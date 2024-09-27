const fs = require("fs")
const { join } = require("path")
const WebSocket = require("isomorphic-ws")

const { clientName, showDebugMessages, stateExcludeCustom, stateMatchLast, stateSeparator, ignoreNoSeparator } = require("./settings")

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

// ===============================================================

const instances = getVeadoInstances(clientName ?? "Node.JS")

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

/** @type {boolean} */ let veadotubeConnected = false
/** @type {VeadoState[]} */ let veadoStates = []
/** @type {SavedMessageWS} */ let latestVeadoMsg = { time: Date.now() }

veado.onopen = async function open() {
  veadotubeConnected = true
  console.info("Connected to", instances[0].name)

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
  const currentStateName = currentState?.name ?? ""
  let statePool = structuredClone(veadoStates).filter(s => !checkStateExcluded(s.name, currentStateName))
  showDebugMessages && console.debug("State pool after removing excluded states:", statePool)

  if (stateMatchLast) {
    const suffix = currentStateName.split(stateSeparator ?? " ").slice(-1)[0]
    showDebugMessages && console.debug(`Suffix matching is enabled, filtering for names ending with "${suffix}"`)

    statePool = statePool.filter(s => s.name.endsWith(suffix))
    showDebugMessages && console.debug("Filtered state pool:", statePool)
  }
  
  if (statePool.length == 0) {
    return console.warn("After filtering, there were no states left to pick from. Aborting transformation")
  }

  /** @type {VeadoState} */
  const chosenState = sample(statePool)
  showDebugMessages ? console.debug("New state:", chosenState) : console.info("New state:", chosenState.name)
  veadoSendMessage({event: "set", state: chosenState.id})
}

/** Returns `true` if the given state should be excluded */
function checkStateExcluded(stateNameToCheck="", currentStateName="", extraStatesToExclude=[]) {
  return [ // Funky syntactic sugar time
    ...(stateExcludeCustom ?? []),
    ...extraStatesToExclude,
    currentStateName
  ].map(normalize).includes(normalize(stateNameToCheck))
}

exports.getVeadoInstances = getVeadoInstances
exports.getCurrentState = getCurrentState
exports.randomState = randomState
exports.instances = instances
exports.veadotubeConnected = veadotubeConnected
exports.veadoStates = veadoStates

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

/* ===================== Helper functions ===================== */

/** Normalize a string for comparison purposes */
const normalize = (string="") => string.trim().toLocaleLowerCase()


/**
 * Returns a random item from a given array
 * @url https://stackoverflow.com/a/5915122/11933690
 * @param {any[]} array
 */
function sample(array) {
  const index = Math.floor( Math.random() * array.length )
  return array[index]
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