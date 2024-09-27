require("dotenv").config()

const { demoMode, demoInterval, soundEnabled, soundName, soundVolume } = require("./settings")

const { randomState } = require("./veado")
if (!demoMode) require("./twitch")

/* ===================== The main thing ===================== */

if (demoMode) console.warn("Demo mode enabled, not logging into Twitch.")

// Prepare (preheat?) audio player for later
const player = new (require("cli-sound")).Player
if (soundEnabled) player.play(soundName, { volume: 0 })

// TF function
async function transform() {
  await randomState()
  if (soundEnabled) player.play(soundName, { volume: soundVolume })
}

exports = { transform }

if (demoMode) {
  console.info(`Triggering TF every ${demoInterval / 1000} seconds.\nOnce your DNA gets too unstable, press CTRL+C to quit`)
  setInterval(transform, demoInterval)
}
