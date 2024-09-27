require("dotenv").config()

const fs = require("fs")
const { join } = require("path")
const WebSocket = require("isomorphic-ws")

const { ApiClient } = require('@twurple/api')
const { StaticAuthProvider } = require("@twurple/auth")
const { EventSubWsListener } = require('@twurple/eventsub-ws')

const { clientName, showDebugMessages, rewardName, stateExclude } = require("./settings")

/* ===================== Veadotube ===================== */

let veadotubeConnected = false
/** @type {VeadoState[]} */ let veadoStates = []

/**
 * @typedef {{
 *   name: string, time: number, server: string,
 *   address: string, filetime: number, filename: string,
 * }} Instance
 * 
 * @typedef {{
 *   time: number, data?: object | string,
 *   event?: WebSocket.MessageEvent,
 * }} SavedMessageWS
 * 
 * @typedef {{
 *   id: string, name: string,
 * }} VeadoState
 */

const instances = getVeadoInstances(clientName)

switch (instances.length) {
  case 0:
    console.warn("No Veadotube instances running, bye!")
    process.exit(0)
  
  case 1: break
  
  default:
    console.info("Found", instances.length, "veadotube instances, choosing newest one"); break
}

showDebugMessages && console.debug("Connecting to", instances[0].name, instances[0].server)

const veado = new WebSocket(instances[0].address)

/** @type {SavedMessageWS} */
let latestVeadoMsg = { time: Date.now() }

veado.onopen = async function open() {
  veadotubeConnected = true
  console.info("Connected to", instances[0].name)

  // Start connecting to Twitch at the same time
  connectTwitch()

  // Read avatar states
  veadoSendMessage({event: "list"})
  veadoStates = ( await veadoWaitForResponse() ).data.payload.states
  console.log("States:", veadoStates)
}

veado.onclose = function close() {
  veadotubeConnected = false
  console.info("Disconnected from", instances[0].name, "- stopping program")
  process.exit(0)
}

veado.onmessage = function incoming ( /**@type {WebSocket.MessageEvent}*/ msg ) {
  const now = Date.now()
  const data = msg.data.toString().split("\0")[0] // Strip everything after a null byte is encountered

  /* Veadotube events come as a JSON object with a channel prefix, like `channel:{}` */

  // Separate out the channel prefix
  const channel = data.split(":")[0] // Everything before the first colon
  const message = data.split(":").slice(1).join(":") // Everything after the first colon

  // Parse message
  try {
    const parsedMessage = JSON.parse(message)
    showDebugMessages && console.debug("→", channel)
    showDebugMessages && console.dir(parsedMessage,
      { showHidden: false, depth: null, maxArrayLength: null, maxStringLength: null }
    )
    latestVeadoMsg = {
      time: now,
      data: parsedMessage,
      event: msg,
    }
  } catch (err) {
    console.warn("Error parsing message as JSON, using raw data instead")
    showDebugMessages && console.debug("→", channel, message)
    latestVeadoMsg = {
      time: now,
      data: message,
      event: msg,
    }
  }
}

async function veadoWaitForResponse() { return watchVariable(() => latestVeadoMsg, latestVeadoMsg) }

function veadoSendMessage(payloadObject={}, channel="nodes") {
  const message = JSON.stringify({
    event: "payload",
    type: "stateEvents",
    id: "mini",
    payload: payloadObject,
  })
  
  veado.send(channel + ":" + message)
}

async function getCurrentState() {
  veadoSendMessage({event: "peek"})
  /** @type {string} */
  const currentStateID = ( await veadoWaitForResponse() ).data.payload.state // Returns state ID
  const currentState = veadoStates.find(state => state.id == currentStateID)
  showDebugMessages && console.debug("The current state is", currentState)
  return currentState
}

async function randomState() {
  let currentState = await getCurrentState()
  const statePool = structuredClone(veadoStates).filter(s => !checkStateExcluded(s.name, [currentState?.name]))
  showDebugMessages && console.debug("State random pool:", statePool)
  /** @type {VeadoState} */
  const chosenState = sample(statePool)
  console.debug("New state:", chosenState)
  veadoSendMessage({event: "set", state: chosenState.id})
}

/** Returns `true` if the given state should be excluded */
function checkStateExcluded(stateName="", extraStatesToExclude=[]) {
  return [...stateExclude, ...extraStatesToExclude].map(normalize).includes(normalize(stateName))
}

const normalize = (string="") => string.trim().toLowerCase()

/* ===================== Twitch ===================== */

/** @type {undefined | string} */
let twitchUserID
/** @type {undefined | import("@twurple/api").HelixCustomReward} */
let twitchReward

console.debug("Logging into Twitch. If you crash here, reauthenticate yourself using the link in readme.md")
const authProvider = new StaticAuthProvider(process.env.twitch_client_id ?? "", process.env.twitch_oauth_token  ?? "")
const apiClient = new ApiClient({ authProvider })
const twitchListener = new EventSubWsListener({ apiClient })

async function connectTwitch() {
  twitchUserID = (await authProvider.getAnyAccessToken()).userId
	if (!twitchUserID) throw new Error("Couldn't find your user ID based on the Twitch token")
  const user = await apiClient.users.getUserById(twitchUserID)
  
  console.info("Logged into Twitch as", user?.displayName, `(${user?.broadcasterType || "regular user"}): #` + user?.id)
  
  const rewards = await apiClient.channelPoints.getCustomRewards(twitchUserID)

  twitchReward = rewards.find(r => normalize(r.title).includes(normalize(rewardName)))
  if (!twitchReward) console.warn(`Couldn't find reward "${rewardName}".\nAvailable rewards are: ${rewards.map(r => `"${r.title}"`).join(", ")}\nI'll still let you know about all redeems, but nothing will happen.`)

  twitchListener.start()
  twitchListener.onChannelRedemptionAdd(twitchUserID, rewardRedeemed)
}

const player = new (require("cli-sound")).Player

/** @param {import("@twurple/eventsub-base").EventSubChannelRedemptionAddEvent} rew */
async function rewardRedeemed(rew) {
  // Check if this is the reward we're looking for
  const match = rew.rewardId == twitchReward?.id
  console.info(`Reward redeemed: ${rew.rewardTitle} (${rew.rewardCost} pts) by ${rew.userDisplayName}.`, match ? "Triggering your TF..." : "Ignoring this reward")
  if (!match) return

  // Change the state to a random one
  randomState()

  // Wait, it's that simple??
  // Huh..
  // Okay, gonna play a sound at least

  player.play("./transform.wav", { volume: 0.1 })
}

/* ===================== Helper functions ===================== */

/**
 * Returns currently running Veadotube Mini instances, sorted newest first
 * @param {string} [clientName] Can be anything you want. The client display name will show up inside Veadotube
 * @url https://veado.tube/help/docs/websocket/#connecting-to-the-server
 * @returns {Instance[]}
 */
function getVeadoInstances(clientName="JS") {
  const instancesDir = `C:/Users/${process.env.USERNAME}/.veadotube/instances`

  const instances = fs.readdirSync(instancesDir)
    .filter((file) => file.startsWith("mini-"))
    .map((file) => {
      const filePath = join(instancesDir, file)
      const stats = fs.statSync(filePath)

      if (stats.isDirectory()) return null

      try {
        const fileContents = fs.readFileSync(filePath, "utf8")
        const instanceData = JSON.parse(fileContents)
      
        if (!instanceData.server) {
          console.warn(`Instance ${file}: Server address not found`)
          return null
        }

        return {
          ...instanceData, // This syntax might looks scary but it's just merging two objects together
          address: `ws://${instanceData.server}?n=${encodeURIComponent(clientName)}`,
          filetime: stats.mtimeMs / 1000,
          filename: file,
        }
      } catch (err) {
        console.warn(`Couldn't parse instance file ${filePath}:`, err)
      }

      return null
    })
    .filter(i => i != null)
    .sort((a, b) => b.time - a.time)
  return instances
}


/**
 * Waits for a variable to change and returns it, or times out
 * @example watchVariable(() => varName, varName)
 * @url https://chatgpt.com/share/66e6a468-8ce0-800a-bb31-023de6f6fd8f
 * @param {() => any} getValue Function to get the current value (see example)
 * @param {any} initialValue Initial value
 * @param {number} [timeout] Timeout delay in ms
 */
async function watchVariable(getValue, initialValue, timeout=5_000) {
  return new Promise((resolve, reject) => {
    let checkInterval = 25 // ms
    let startTime = Date.now()

    let checkValue = setInterval(() => {
      let currentValue = getValue()

      // Check if the value has changed
      if (currentValue !== initialValue) {
        clearInterval(checkValue)
        resolve(currentValue)
      }

      // Check if the timeout has been reached
      if (Date.now() - startTime >= timeout) {
        clearInterval(checkValue)
        reject(new Error("Timeout: Variable did not change within 5 seconds."))
      }
    }, checkInterval)
  })
}


/**
 * Returns a random item from a given array
 * @url https://stackoverflow.com/a/5915122/11933690
 * @param {any[]} array
 */
function sample(array) {
  const index = Math.floor( Math.random() * array.length )
  return array[index]
}
