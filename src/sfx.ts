// Short sound effects, synthesised in code like sfx.gd (move, capture, check, boom, zap). The buffers are made by a worker (sfxworker.ts) in the background
// as soon as the page has sound, so playing one never blocks the page; a sound asked for before it is ready plays as soon as it arrives (if that is soon).
import { settings } from './settings'
import { RATE, normalized, SOUNDS } from './sfxgen'

let actx: AudioContext | null = null
const cache = new Map<string, AudioBuffer>()

let worker: Worker | null = null
const asked = new Set<string>()
const waiting = new Map<string, { at: number; play: (b: AudioBuffer) => void }[]>()
function store(name: string, s: Float32Array): AudioBuffer | null {
	if (!actx) return null
	const b = actx.createBuffer(1, s.length, RATE)
	b.getChannelData(0).set(s)
	cache.set(name, b)
	return b
}
// the sound if it is ready; without a worker it is made here (blocks for a moment)
function buffer(name: string): AudioBuffer | null {
	if (!actx) return null
	const b = cache.get(name)
	if (b) return b
	if (worker) { ask(name); return null }
	return store(name, normalized(name))
}
function ask(name: string): void { if (worker && !asked.has(name) && !cache.has(name)) { asked.add(name); worker.postMessage(name) } }
function startWorker(): void {
	try { worker = new Worker('sfxgen.js') } catch { worker = null; return }
	worker.onmessage = (e: MessageEvent) => {
		const { name, s } = e.data as { name: string; s: Float32Array }
		const b = store(name, s)
		const list = waiting.get(name); waiting.delete(name)
		if (b && list) for (const w of list) if (performance.now() - w.at < 350) w.play(b)          // only if it is still "now"
	}
	worker.onerror = () => { worker = null }
	// the game's sounds first, then all the others
	for (const n of ['move', 'capture', 'check', 'boom', 'zap', 'flick', 'tick', ...SOUNDS]) ask(n)
}

// The first tap on the page makes the audio context (browsers need a gesture)
export function unlockAudio(): void {
	if (actx) { if (actx.state === 'suspended') actx.resume(); return }
	try {
		actx = new (window.AudioContext || (window as any).webkitAudioContext)()
		setTimeout(startWorker, 0)          // not in the tap itself
	} catch { actx = null }
}
document.addEventListener('pointerdown', unlockAudio, { once: false, passive: true })

// no sound while the tab is in the background
document.addEventListener('visibilitychange', () => {
	if (!actx) return
	if (document.hidden) { if (actx.state === 'running') actx.suspend().catch(() => {}) }
	else if (actx.state === 'suspended') actx.resume().catch(() => {})
})

// Makes the buffers of these sounds ahead of time (the worker makes all of them anyway; without one: one per pause, so no frame is blocked long)
const toMake: string[] = []
let making = 0
export function preloadSounds(names: string[]): void {
	if (worker) { for (const n of names) ask(n); return }
	for (const n of names) if (!cache.has(n) && !toMake.includes(n)) toMake.push(n)
	const step = () => {
		making = 0
		if (!toMake.length) return
		if (worker) { for (const n of toMake.splice(0)) ask(n); return }
		if (actx) { const n = toMake.shift()!; if (!cache.has(n)) buffer(n) }
		making = window.setTimeout(step, actx ? 40 : 500)
	}
	if (!making) making = window.setTimeout(step, 60)
}

// while hushed only sounds played with `force` are heard (the wish show silences the previews)
let hushed = false
export function setHush(on: boolean): void { hushed = on }
export function playSoundForce(name: string, volume = 0.63, rate = 1): { stop: () => void } | null { return playSound(name, volume, rate, true) }

export function playSound(name: string, volume = 0.63, rate = 1, force = false): { stop: () => void } | null {
	if (!settings.sound || !actx || document.hidden || (hushed && !force)) return null
	if (actx.state === 'suspended') actx.resume()
	const ctx = actx
	let src: AudioBufferSourceNode | null = null, gain: GainNode | null = null, stopped = false
	const play = (b: AudioBuffer): void => {
		if (stopped) return
		src = ctx.createBufferSource()
		src.buffer = b
		src.playbackRate.value = rate
		gain = ctx.createGain()
		gain.gain.value = volume * settings.volume
		src.connect(gain).connect(ctx.destination)
		src.start()
	}
	const b = buffer(name)
	if (b) play(b)
	else if (worker) { const l = waiting.get(name) ?? []; l.push({ at: performance.now(), play }); waiting.set(name, l) }
	else return null
	return { stop: () => { stopped = true; try { if (gain && src) { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04); src.stop(ctx.currentTime + 0.2) } } catch { /* already over */ } } }
}