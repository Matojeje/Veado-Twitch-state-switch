const { randomState } = require("./veado")

const { demoMode, demoInterval, soundEnabled, soundName, soundVolume } = require("./settings")

// Prepare (preheat?) audio player for later
const player = new (require("cli-sound")).Player
if (soundEnabled) player.play(soundName, { volume: 0 })


// TF function
async function transform() {
  await randomState()
  if (soundEnabled) player.play(soundName, { volume: soundVolume })
}

module.exports = { transform }
