
/**
 * List of species, modifiers and weights.
 * Things not listed here won't be included in the random picker.
 * You can include things that don't exist in veadotube yet - they'll be automatically excluded.
 * The weights will be automatically adjusted to add up to 100%
 * 
 * @typedef {{
*   name: string,
*   weight: number,
*   modifiers: {[modifier: string]: number},
* }} Species
* 
* @type {Species[]}
*/

exports.weights = [
  {
    name: "Pichu",
    weight: 1,
    modifiers: {
      "Base": 2,
      "Plush": 1,
      "Pooltoy": 1,
      "Gummy": 0.5,
    }
  },
]


// Main settings

/** @type {boolean}         Would you like me to be extra yappy? */
exports.showDebugMessages   = false

/** @type {boolean}         Play sound effect when transforming */
exports.soundEnabled        = true

/** @type {string}          Sound file name, use ./ to look for files relative to this folder */
exports.soundName           = "./transform.wav"

/** @type {number}          Sound volume */
exports.soundVolume         = 0.1

/** @type {boolean}         Trigger TF events periodically. This will disable Twitch */
exports.demoMode            = false

/** @type {number}          How often to trigger TF events in demo mode, in ms */
exports.demoInterval        = 5_000


// Twitch settings

/** @type {string}          Name of your Twitch reward */
exports.rewardName          = "Transform me"


// Veadotube settings

/** @type {number}          How long to show the transition for, in milliseconds (set to 0 to disable transitions) */
exports.transitionDuration  = 600

/** @type {string}          Optional name for this program, might show up in Veadotube */
exports.clientName          = "puppy experiment"
