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

/** @type {string}          Any name for this program, might show up in Veadotube */
exports.clientName          = "puppy experiment"

/** @type {string[]}        Veadotube states to blacklist from the random picker */
exports.stateExcludeCustom  = ["Ignored state example", "Idle"]

/** @type {boolean}         Only switch between states with the same suffix */
exports.stateMatchLast      = true

/** @type {string}          Separator that marks the suffix in your state names */
exports.stateSeparator      = "-"

/** @type {boolean}         Ignore states that don't have that separator */
exports.ignoreNoSeparator   = true
