const { transform } = require("./transform")
const { rewardName } = require("./settings")

const { ApiClient } = require("@twurple/api")
const { StaticAuthProvider } = require("@twurple/auth")
const { EventSubWsListener } = require("@twurple/eventsub-ws")

let twitchConnected = false

/** @type {undefined | string} */
let twitchUserID = undefined

/** @type {undefined | import("@twurple/api").HelixCustomReward} */
let twitchReward = undefined

/** @type {null | import("@twurple/api").HelixUser} */
let twitchUser = null

/** Normalize a string for comparison purposes */
const normalize = (string="") => string.trim().toLocaleLowerCase()

// ===============================================================

console.debug("Logging into Twitch. If you crash here, reauthenticate yourself using the link in readme.md")

const authProvider = new StaticAuthProvider(process.env.twitch_client_id ?? "", process.env.twitch_oauth_token ?? "")
const apiClient = new ApiClient({ authProvider })
const twitchListener = new EventSubWsListener({ apiClient })

async function connectTwitch() {
  twitchUserID = (await authProvider.getAnyAccessToken()).userId
  if (!twitchUserID) throw new Error("Couldn't find your user ID based on the Twitch token")

  twitchConnected = true
  const user = await apiClient.users.getUserById(twitchUserID)
  twitchUser = user

  console.info("Logged into Twitch as", user?.displayName, `(${user?.broadcasterType || "regular user"}): #` + user?.id)

  const rewards = await apiClient.channelPoints.getCustomRewards(twitchUserID)

  twitchReward = rewards.find(r => normalize(r.title).includes(normalize(rewardName)))
  if (!twitchReward) console.warn(`Couldn't find reward "${rewardName}".\nAvailable rewards are: ${rewards.map(r => `"${r.title}"`).join(", ")}\nI'll still let you know about all redeems, but nothing will happen.`)

  twitchListener.start()
  twitchListener.onChannelRedemptionAdd(twitchUserID, rewardRedeemed)
}

/** @param {import("@twurple/eventsub-base").EventSubChannelRedemptionAddEvent} rew */
async function rewardRedeemed(rew) {
  // Check if this is the reward we're looking for
  const match = rew.rewardId == twitchReward?.id
  console.info(`Reward redeemed: ${rew.rewardTitle} (${rew.rewardCost} pts) by ${rew.userDisplayName}.`, match ? "Triggering your TF..." : "Ignoring this reward")
  if (!match) return

  // Trigger a transformation!
  await transform()
}

// Testing without having to buy Twitch rewards
/* setTimeout(async () => {
  console.time("bwah..")
  await transform()
  console.timeEnd("bwah..")
}, 5_000) */

connectTwitch()

exports = {
  twitchUser,
  twitchUserID,
  twitchReward,
  twitchListener,
  twitchApi: ApiClient,
  twitchAuth: StaticAuthProvider,
  twitchEvents: EventSubWsListener,
}
