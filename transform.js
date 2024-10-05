const weighted = require("weighted-rng").default
const { refreshStates, getCurrentState, parseStateName, setState, setStateByName } = require("./veado")
const { soundEnabled, soundName, soundVolume, weights, transitionDuration } = require("./settings")
const { sample, sleep, debugDir, debug } = require("./helper")

// Prepare (preheat?) audio player for later
const player = new (require("cli-sound")).Player
if (soundEnabled) player.play(soundName, { volume: 0 })

/**
 * @typedef {{
 *   name: string, weight: number,
 * }} WeightRecord
 * 
 * @typedef {{
 *   modifiers: WeightRecord[]
 * } & WeightRecord } SpeciesRecord
 * 
 * @enum {Number}
 */

const transformType = {
  Modifier: 0,
  Species: 1,
  Both: 2,
}

/** TF function @param {transformType} type  */
async function transform(type) {

  const stateWeights = await getRealWeights() // Important we get the weights before triggering the transition (which changes the current state)
  const prevState = await getCurrentState()
  const current = parseStateName(prevState.name)

  try {
    /** @type {WeightRecord[] | undefined} */
    let choicePool = []

    debugDir(stateWeights)

    switch (type) {
      case transformType.Modifier:
        choicePool = stateWeights.find(spec => spec.name == current.type)?.modifiers
        break

      case transformType.Species:
        throw new Error("Not yet implemented")
        break

      case transformType.Both:
        throw new Error("Not yet implemented")
        break
    
      default:
        throw new Error(`Unknown TF type "${type}", please choose from ${JSON.stringify(transformType)}.`)
    }

    console.log("Filtered choice pool:", makeRecords( choicePool ?? [] ))

    // Random pick
    const newStateName = weighted(makeRecords( choicePool ?? [] ))
    console.info("New state:", newStateName)

    // Transition sound
    if (soundEnabled) player.play(soundName, { volume: soundVolume })
    if (transitionDuration > 0) await playTransition()

    // Change state
    await setStateByName(String(newStateName))

  } catch (err) {
    console.error(err)
    setState(prevState.id)
  }
}

/** Play transition state and wait */
async function playTransition(length=transitionDuration) {
  const current = parseStateName((await getCurrentState()).name)
  const pattern = new RegExp(`Transition-.*-${current.activity}`, "gi")

  const transitionStates = (await refreshStates()).filter(state => pattern.test(state.name))
  if (transitionStates.length == 0) return console.warn("Couldn't find any transition state")
  const transition = sample(transitionStates)

  setState(transition.id)
  await sleep(transitionDuration)
}

/** Random weight normalization */
async function getRealWeights(excludeCurrentState=true) {

  const existingStates = (await refreshStates()).map(state => state.name)
  const current = parseStateName((await getCurrentState()).name)
  
  /** @type {SpeciesRecord[]} */
  const realWeights = weights.map(species => {
    
    // Turn the object into state names
    /** @type {WeightRecord[]} */
    const mods = Object.entries(species.modifiers).map( ([mod, weight]) => ({name: `${species.name}-${mod}-${current.activity}`, weight}) )

    // Filter out nonexistent states
    .filter( mod => !!existingStates.find(state => state.startsWith(mod.name)) )


    return {...species, modifiers: mods}
  })

  // Filter out species with no existing modifiers
  // .filter(spec => spec.modifiers.length != 0)

  if (!excludeCurrentState) return realWeights

  // Exclude current state from the weights
  const excludedPrefix = `${current.type}-${current.modifier}`

  return realWeights.map(spec => ({...spec, modifiers: spec.modifiers.filter(mod => !mod.name.startsWith(excludedPrefix))}))
}

/** @param {WeightRecord[]} arr */
function makeRecords(arr=[]) {
  return Object.fromEntries(arr.map(({ name, weight }) => [name, weight]))
}

module.exports = { transform, transformType, playTransition }
