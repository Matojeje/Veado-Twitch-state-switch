const fs = require("fs")
const { join } = require("path")
const WebSocket = require("isomorphic-ws")

// Settings
let clientName = "puppy experiment"
let showDebugMessages = false

/**
 * @typedef {{
 *   name: string,
 *   time: number,
 *   server: string,
 *   address: string,
 *   filetime: number,
 *   filename: string,
 * }} Instance
 * 
 * @typedef {{
 *   time: number,
 *   event?: WebSocket.MessageEvent,
 *   data?: object | string,
 * }} SavedMessageWS
 * 
 * @typedef {{
 *   id: string,
 *   name: string,
 * }} VeadoState
 */

const instances = getVeadoInstances(clientName)

switch (instances.length) {
  case 0:
    console.warn("No instances running, bye!")
    process.exit(0)
  
  case 1:
    break
  
  default:
    console.info("Found", instances.length, "instances, choosing newest one")
    break
}

showDebugMessages && console.debug("Connecting to", instances[0].name, instances[0].server)

const ws = new WebSocket(instances[0].address)

/** @type {SavedMessageWS} */
let latestMessage = {
  time: Date.now()
}

ws.onopen = async function open() {
  console.log("Connected")

  // Request avatar states
  sendMessage({event: "list"})
  /** @type {VeadoState[]} */
  const states = ( await waitForResponse() ).data.payload.states
  console.log("States:", states)

  // Demo: get current state
  sendMessage({event: "peek"})
  /** @type {string} */
  const currentStateID = ( await waitForResponse() ).data.payload.state // Returns state ID
  const currentState = states.find(state => state.id == currentStateID)
  console.info("The current state is", currentState)

  // Demo: change to a random state every 3 seconds
  
  console.info("I'll now change the state every 3 seconds to demonstrate")
  setInterval(randomState, 3_000)

  function randomState() {
    /** @type {VeadoState} */
    const chosenState = sample(states)
    console.debug("New state:", chosenState)
    sendMessage({event: "set", state: chosenState.id})
  }

  // Helper functions ------------------------------------

  async function waitForResponse() { return watchVariable(() => latestMessage, latestMessage) }

  function sendMessage(payloadObject={}, channel="nodes") {
    const message = JSON.stringify({
      event: "payload",
      type: "stateEvents",
      id: "mini",
      payload: payloadObject,
    })
    
    ws.send(channel + ":" + message)
  }
}

ws.onclose = function close() {
  console.log("Disconnected")
}

ws.onmessage = function incoming( /**@type {WebSocket.MessageEvent}*/ msg ) {
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
    latestMessage = {
      time: now,
      data: parsedMessage,
      event: msg,
    }
  } catch (err) {
    console.warn("Error parsing message as JSON, using raw data instead")
    showDebugMessages && console.debug("→", channel, message)
    latestMessage = {
      time: now,
      data: message,
      event: msg,
    }
  }
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