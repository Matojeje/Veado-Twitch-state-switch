const { randomState } = require("./veado")

const { demoMode, demoInterval, soundEnabled, soundName, soundVolume } = require("./settings")

// Prepare (preheat?) audio player for later
const player = new (require("cli-sound")).Player
if (soundEnabled) player.play(soundName, { volume: 0 })


// TF function
async function transform() {
  if (soundEnabled) player.play(soundName, { volume: soundVolume })
  await randomState()
}

module.exports = { transform }
