const { showDebugMessages } = require("./settings")

/** Normalize a string for comparison purposes */
const normalize = (string="") => string.trim().toLocaleLowerCase()

/** Async delay @url https://stackoverflow.com/a/39914235/11933690 */
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Print debug message if it's enabled in settings */
function debug(...args) { showDebugMessages && console.debug(...args) }

/** Print debug message with object, if it's enabled in settings */
function debugDir(obj) { showDebugMessages && console.dir(obj,
  { showHidden: false, depth: null, maxArrayLength: null, maxStringLength: null }
) }

/**
 * Returns a random item from a given array
 * @url https://stackoverflow.com/a/5915122/11933690
 * @template T @param {T[]} [array=[]] @returns {T}
 */
function sample(array=[]) {
  const index = Math.floor( Math.random() * array.length )
  return array[index]
}

module.exports = {
  normalize, sleep, debug, debugDir, sample,
}
