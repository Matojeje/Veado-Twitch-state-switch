require("dotenv").config()

const { demoMode, demoInterval } = require("./settings")
const { transform } = require("./transform")

if (!demoMode) require("./twitch")
else {
  console.warn("Demo mode enabled, not logging into Twitch.")
  console.info(`Triggering TF every ${demoInterval / 1000} seconds.\nOnce your DNA gets too unstable, press CTRL+C to quit`)
  setInterval(transform, demoInterval)
}
