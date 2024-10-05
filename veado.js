const fs = require("fs")
const { join } = require("path")
const WebSocket = require("isomorphic-ws")

const { clientName, transitionDuration } = require("./settings")
const { debug, debugDir, sample } = require("./helper")

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

debug("Connecting to", instances[0].name, instances[0].server)

const veado = new WebSocket(instances[0].address)

/** @type {boolean} */ let veadotubeConnected = false
/** @type {VeadoState[]} */ let veadoStates = []
/** @type {SavedMessageWS} */ let latestVeadoMsg = { time: Date.now() }

veado.onopen = async function open() {
  veadotubeConnected = true
  console.info("Connected to", instances[0].name)

  // Read avatar states
  await refreshStates()
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
    debug("→", channel)
    debugDir(parsedMessage)
    latestVeadoMsg = {
      time: now,
      data: parsedMessage,
      event: msg,
    }
  } catch (err) {
    console.warn("Error parsing message as JSON, using raw data instead")
    debug("→", channel, message)
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

async function refreshStates() {
  veadoSendMessage({ event: "list" })
  /** @type {VeadoState[]} */
  const response = (await veadoWaitForResponse()).data.payload.states
  veadoStates = response // Also save globally
  return response
}

async function getCurrentState() {
  veadoSendMessage({event: "peek"})
  /** @type {string} */
  const currentStateID = ( await veadoWaitForResponse() ).data.payload.state // Returns state ID
  /** @type {VeadoState} */ // @ts-ignore
  const currentState = veadoStates.find(state => state.id == currentStateID)
  debug("The current state is", currentState)
  return currentState
}

/**
 * If there are multiple states with the same name, it picks a random one
 */
async function getStateByName(name="") {
  const availableStates = await refreshStates()
  const matchingStates = availableStates.filter(x => x.name == name)

  switch (matchingStates.length) {
    case 0: return null
    case 1: return matchingStates[0]
    default: return sample(matchingStates)
  }
}

function setState(id="") {
  veadoSendMessage({event: "set", state: id})
}

async function setStateByName(name="") {
  const foundState = await getStateByName(name)
  if (foundState) setState(foundState.id)
  return foundState
}

module.exports = {
  getVeadoInstances, getCurrentState, getStateByName, setState,  veadotubeConnected,
  refreshStates,     setStateByName,  parseStateName, instances, veadoStates
}

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

/**
 * Splits up a state name into named chunks
 * @typedef { {valid:boolean, type?:string, modifier?:string, activity?:string}} ParsedName
 * @returns {ParsedName}
 */
function parseStateName(name="") {
  const pattern = /^(?<type>\w+)-(?<modifier>\w+)-(?<activity>\w+)$/
  const result = pattern.exec(name)
  // @ts-ignore
  return !!result
    ? { valid: true, ...result.groups }
    : { valid: false }
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