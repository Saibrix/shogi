// The sound effects, made in code (shared by the page and the sound worker, which makes them away from the page so nothing stutters).
export const RATE = 44100
const TAU = Math.PI * 2

function rngMaker(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1 } }

export function make(name: string): Float32Array {
	const rnd = rngMaker(name.length * 977 + name.charCodeAt(0))
	const NS = (secs: number) => Math.floor(RATE * secs)
	const bp = (st: { a: number; b: number }, x: number, k: number) => { st.a += (x - st.a) * k; st.b += (st.a - st.b) * k; return st.a - st.b }      // a cheap band-ish filter
	const env = (t: number, att: number, dec: number) => Math.min(t / att, 1) * Math.exp(-t * dec)
	switch (name) {
		case 'whoosh': { const n = NS(0.4), o = new Float32Array(n), st = { a: 0, b: 0 }; for (let i = 0; i < n; i++) { const t = i / RATE, k = 0.04 + 0.5 * Math.sin(Math.min(1, t / 0.4) * Math.PI) ** 2; o[i] = bp(st, rnd(), k) * 2.2 * Math.sin(Math.min(1, t / 0.4) * Math.PI) } return o }
		case 'poof': { const n = NS(0.34), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.12; o[i] = (lp * 1.6 + 0.5 * Math.sin(TAU * 110 * t)) * env(t, 0.004, 11) } return o }
		case 'flick': { const n = NS(0.16), o = new Float32Array(n), st = { a: 0, b: 0 }; for (let i = 0; i < n; i++) { const t = i / RATE; o[i] = (bp(st, rnd(), 0.5) * 2.5 + 0.6 * Math.sin(TAU * (1500 - 3500 * t) * t)) * env(t, 0.001, 24) } return o }
		case 'sink': { const n = NS(0.7), o = new Float32Array(n); let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.05; ph += TAU * (260 * Math.exp(-t * 3.2) + 40) / RATE; o[i] = (0.8 * Math.sin(ph) + 0.9 * lp) * env(t, 0.01, 4.5) } return o }
		case 'splat': { const n = NS(0.42), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.2; const blip = Math.sin(TAU * (300 + 900 * Math.exp(-t * 18)) * t) * Math.exp(-t * 16); o[i] = (lp * 1.3 * Math.exp(-t * 13) + 0.7 * blip + 0.5 * Math.sin(TAU * 90 * t) * Math.exp(-t * 20)) * Math.min(t / 0.001, 1) } return o }
		case 'slash': { const n = NS(0.7), o = new Float32Array(n), st = { a: 0, b: 0 }; for (let i = 0; i < n; i++) { const t = i / RATE; const sw = bp(st, rnd(), 0.55) * 3 * env(t, 0.002, 28); const ring = (Math.sin(TAU * 2200 * t) + 0.6 * Math.sin(TAU * 3330 * t) + 0.4 * Math.sin(TAU * 4710 * t)) * env(t - 0.03, 0.001, 7) * (t > 0.03 ? 0.35 : 0); o[i] = sw + ring } return o }
		case 'squash': { const n = NS(0.5), o = new Float32Array(n); let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.3; ph += TAU * (420 * Math.exp(-t * 16) + 50) / RATE; o[i] = (1.1 * Math.sin(ph) * Math.exp(-t * 9) + 0.6 * lp * Math.exp(-t * 40)) * Math.min(t / 0.001, 1) } return o }
		case 'pixel': { const n = NS(0.6), o = new Float32Array(n); let f = 600, hold = 0; for (let i = 0; i < n; i++) { const t = i / RATE; if (hold-- <= 0) { f = 300 + Math.abs(rnd()) * 1800; hold = Math.floor(RATE * (0.02 + Math.abs(rnd()) * 0.03)) } const sq = Math.sin(TAU * f * t) > 0 ? 1 : -1; o[i] = sq * 0.5 * Math.exp(-t * 4.5) * Math.min(t / 0.002, 1) } return o }
		case 'vortex': { const n = NS(1.0), o = new Float32Array(n); let ph = 0, lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE, k = t / 1.0; lp += (rnd() - lp) * 0.06; ph += TAU * (700 * Math.pow(1 - k, 2) + 70 + 25 * Math.sin(t * 40)) / RATE; o[i] = (0.8 * Math.sin(ph) * (1 - k * 0.5) + 0.8 * lp * Math.sin(k * Math.PI)) * Math.min(t / 0.02, 1) * (1 - k * k) } return o }
		case 'whistle': { const n = NS(0.9), o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / RATE, k = t / 0.9; ph += TAU * (2100 * Math.pow(1 - k, 1.6) + 260) / RATE; o[i] = (Math.sin(ph) * 0.8 + 0.25 * Math.sin(ph * 2)) * Math.min(t / 0.03, 1) * (0.3 + 0.7 * k) * (k > 0.97 ? (1 - k) / 0.03 : 1) } return o }
		case 'clack': { const n = NS(1.2), o = new Float32Array(n); let tt = 0.02; const hits: number[] = []; let gap = 0.19; while (tt < 1.1) { hits.push(tt); hits.push(tt + 0.07); tt += gap; gap = Math.max(0.09, gap * 0.9) } for (let i = 0; i < n; i++) { const t = i / RATE; let v = 0; for (const h0 of hits) { const u = t - h0; if (u > 0 && u < 0.08) v += (Math.sin(TAU * 1500 * u) * 0.5 + rnd() * 0.5 + 0.5 * Math.sin(TAU * 210 * u)) * Math.exp(-u * 70) } o[i] = v * 0.7 * Math.min(1, t / 0.1) } return o }
		case 'toot': { const n = NS(0.5), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE, f = t < 0.18 ? 520 : 660, e = Math.min(t / 0.01, 1) * (t > 0.38 ? Math.max(0, 1 - (t - 0.38) / 0.12) : 1) * (t < 0.18 ? 1 : 0.9); o[i] = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * 0.45 * e } return o }
		case 'horn': { const n = NS(1.3), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE, e = Math.min(t / 0.05, 1) * (t > 0.95 ? Math.max(0, 1 - (t - 0.95) / 0.35) : 1), vib = 1 + 0.004 * Math.sin(t * 38); let v = 0; for (const f of [311, 370, 466]) v += Math.sin(TAU * f * vib * t) + 0.5 * Math.sin(TAU * f * 2 * vib * t) + 0.3 * Math.sin(TAU * f * 3 * t); o[i] = v * 0.3 * e } return o }
		case 'chug': { const n = NS(1.3), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE, rate = 5 + 7 * t / 1.3, p = (t * rate) % 1; lp += (rnd() - lp) * 0.1; o[i] = lp * 2 * Math.exp(-p * 7) * (0.5 + 0.5 * Math.min(1, t / 0.2)) + 0.4 * Math.sin(TAU * 52 * t) * Math.exp(-p * 9) } return o }
		case 'rumble': { const n = NS(1.4), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.025; o[i] = (lp * 3 + 0.4 * Math.sin(TAU * 38 * t) * (1 + 0.5 * Math.sin(t * 30))) * Math.min(t / 0.25, 1) * Math.exp(-t * 1.6) } return o }
		case 'riser': { const n = NS(3.4), o = new Float32Array(n); let ph = 0, lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE, k = t / 3.4; lp += (rnd() - lp) * (0.02 + 0.5 * k * k); ph += TAU * (110 * Math.pow(16, k * k)) / RATE; o[i] = (0.55 * Math.sin(ph) + 0.25 * Math.sin(ph * 2.01) + 0.9 * lp * k) * (0.1 + 0.9 * k) * (1 + 0.25 * Math.sin(t * (14 + 30 * k))) } return o }
		case 'tick': { const n = NS(0.04), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE; o[i] = (Math.sin(TAU * 1900 * t) + 0.5 * rnd()) * Math.exp(-t * 130) } return o }
		case 'shimmer': { const n = NS(1.3), o = new Float32Array(n); const pings: { at: number; f: number }[] = []; for (let j = 0; j < 22; j++) pings.push({ at: Math.abs(rnd()) * 0.8, f: 1800 + Math.abs(rnd()) * 4200 }); for (let i = 0; i < n; i++) { const t = i / RATE; let v = 0; for (const p of pings) { const u = t - p.at; if (u > 0) v += Math.sin(TAU * p.f * u) * Math.exp(-u * 11) * 0.18 } o[i] = v } return o }
		case 'ping': { const n = NS(1.2), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE; o[i] = (Math.sin(TAU * 880 * t) + 0.5 * Math.sin(TAU * 1760 * t) * Math.exp(-t * 6) + 0.3 * Math.sin(TAU * 2640 * t) * Math.exp(-t * 9)) * env(t, 0.003, 4.2) } return o }
		case 'fanfare': { const n = NS(1.8), o = new Float32Array(n); const notes = [[0, 262], [0.1, 330], [0.2, 392], [0.34, 523], [0.34, 659], [0.34, 784]]; for (let i = 0; i < n; i++) { const t = i / RATE; let v = 0; for (const [s, f] of notes) { const u = t - s; if (u < 0) continue; let saw = 0; for (let h2 = 1; h2 <= 6; h2++) saw += Math.sin(TAU * f * h2 * u) / h2; v += saw * Math.min(u / 0.02, 1) * Math.exp(-u * 1.7) * 0.28 } o[i] = v } return o }
		case 'choir': { const n = NS(2.6), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE; let v = 0; for (const f of [196, 247, 294, 392, 494, 587]) for (const d of [-0.004, 0, 0.004]) v += Math.sin(TAU * f * (1 + d) * t + Math.sin(t * 5) * 0.2); o[i] = v * 0.07 * Math.min(t / 0.9, 1) * Math.exp(-Math.max(0, t - 1.2) * 1.2) } return o }
		case 'laser': { const n = NS(1.5), o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / RATE; ph += TAU * (180 + 40 * Math.sin(t * 25) + 140 * Math.min(1, t / 0.2)) / RATE; let saw = 0; for (let h2 = 1; h2 <= 5; h2++) saw += Math.sin(ph * h2) / h2; o[i] = (saw * 0.7 + 0.35 * Math.sin(ph * 4 + Math.sin(t * 90))) * Math.min(t / 0.03, 1) * (t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.3) : 1) } return o }
		case 'flip': { const n = NS(0.14), o = new Float32Array(n), st = { a: 0, b: 0 }; for (let i = 0; i < n; i++) { const t = i / RATE; o[i] = bp(st, rnd(), 0.4) * 1.8 * env(t, 0.002, 30) + 0.5 * Math.sin(TAU * 1300 * t) * env(t - 0.05, 0.001, 60) * (t > 0.05 ? 1 : 0) } return o }
		// ---- the wish show (2026-11-07): softer, more magical than boom / fanfare ----
		// a glassy FM bell; played at different rates it makes the notes of a scale
		case 'bell': { const n = NS(1.6), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE, f = 784; o[i] = (Math.sin(TAU * f * t + 2.2 * Math.exp(-t * 5) * Math.sin(TAU * f * 3.51 * t)) + 0.35 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 4) + 0.15 * Math.sin(TAU * f * 4.2 * t) * Math.exp(-t * 9)) * env(t, 0.002, 2.6) } return o }
		// a deep soft hit: a falling sine under a puff of noise
		case 'impact': { const n = NS(1.1), o = new Float32Array(n); let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.04; ph += TAU * (36 + 110 * Math.exp(-t * 9)) / RATE; o[i] = (1.2 * Math.sin(ph) * env(t, 0.003, 3.2) + 0.9 * lp * env(t, 0.002, 7)) } return o }
		// light glittering pings, higher and shorter than the shimmer
		case 'sparkle': { const n = NS(1.0), o = new Float32Array(n); const pings: { at: number; f: number }[] = []; for (let j = 0; j < 16; j++) pings.push({ at: Math.abs(rnd()) * 0.55, f: 3000 + Math.abs(rnd()) * 4500 }); for (let i = 0; i < n; i++) { const t = i / RATE; let v = 0; for (const p of pings) { const u = t - p.at; if (u > 0 && u < 0.3) v += Math.sin(TAU * p.f * u) * Math.exp(-u * 16) * 0.2 } o[i] = v } return o }
		// a warm major chord that swells in (Legendary and better)
		case 'pad': { const n = NS(2.0), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / RATE; let v = 0; for (const f of [262, 330, 392, 523, 659]) for (const d of [-0.003, 0.003]) v += Math.sin(TAU * f * (1 + d) * t) + 0.3 * Math.sin(TAU * f * 2 * (1 + d) * t); o[i] = v * 0.08 * Math.min(t / 0.18, 1) * Math.exp(-Math.max(0, t - 0.5) * 2.2) } return o }
		// a short airy swish (an orb flying out)
		case 'swish': { const n = NS(0.32), o = new Float32Array(n), st = { a: 0, b: 0 }; for (let i = 0; i < n; i++) { const t = i / RATE, k = t / 0.32; o[i] = bp(st, rnd(), 0.15 + 0.5 * k) * 2 * Math.sin(k * Math.PI) ** 2 } return o }
		case 'swell': { const n = NS(1.0), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / RATE; lp += (rnd() - lp) * 0.08; o[i] = lp * 1.8 * Math.sin(Math.min(1, t) * Math.PI * 0.5) * (t > 0.9 ? (1 - t) / 0.1 : 1) + 0.3 * Math.sin(TAU * (80 + 120 * t) * t) } return o }
	}	if (name === 'move') {
		const n = Math.floor(RATE * 0.13), out = new Float32Array(n)
		for (let i = 0; i < n; i++) {
			const t = i / RATE, f = 170 + 90 * Math.exp(-t * 50)
			let v = 0.55 * Math.sin(TAU * f * t) * Math.exp(-t * 34)
			v += 0.22 * Math.sin(TAU * 610 * t) * Math.exp(-t * 90)
			v += 0.25 * rnd() * Math.exp(-t * 220)
			out[i] = v * Math.min(t / 0.001, 1)
		}
		return out
	}
	if (name === 'capture') {
		const n = Math.floor(RATE * 0.34), out = new Float32Array(n)
		let lp = 0
		for (let i = 0; i < n; i++) {
			const t = i / RATE
			lp += (rnd() - lp) * 0.35
			let v = 0.75 * Math.sin(TAU * (95 + 70 * Math.exp(-t * 35)) * t) * Math.exp(-t * 11)
			v += 0.55 * lp * Math.exp(-t * 26)
			v += 0.3 * Math.sin(TAU * 220 * t) * Math.exp(-t * 40)
			v += 0.18 * Math.sin(TAU * 1250 * t) * Math.exp(-t * 45)
			out[i] = v * Math.min(t / 0.001, 1)
		}
		return out
	}
	if (name === 'boom') {
		const n = Math.floor(RATE * 1.3), out = new Float32Array(n)
		let lp = 0, phase = 0
		for (let i = 0; i < n; i++) {
			const t = i / RATE
			lp += (rnd() - lp) * 0.08
			phase += TAU * (34 + 90 * Math.exp(-t * 9)) / RATE
			let v = 0.9 * Math.sin(phase) * Math.exp(-t * 3.2)
			v += 1.1 * lp * Math.exp(-t * 4)
			v += 0.35 * rnd() * Math.exp(-t * 30)
			out[i] = v * Math.min(t / 0.002, 1)
		}
		return out
	}
	if (name === 'zap') {
		const n = Math.floor(RATE * 0.55), out = new Float32Array(n)
		let prev = 0
		for (let i = 0; i < n; i++) {
			const t = i / RATE, raw = rnd(), hp = raw - prev * 0.7
			prev = raw
			const crackle = hp * (Math.exp(-t * 14) * (0.4 + 0.6 * Math.abs(Math.sin(t * 160))))
			const v = crackle + 0.4 * Math.sin(TAU * (900 * Math.exp(-t * 7) + 60) * t) * Math.exp(-t * 10)
			out[i] = v * Math.min(t / 0.001, 1)
		}
		return out
	}
	// check
	const n = Math.floor(RATE * 0.34), out = new Float32Array(n)
	for (let i = 0; i < n; i++) {
		const t = i / RATE
		let v = 0
		for (const [start, f] of [[0, 880], [0.13, 1175]]) {
			const u = t - start
			if (u >= 0) { const env = Math.min(u / 0.004, 1) * Math.exp(-u * 13); v += env * (Math.sin(TAU * f * u) + 0.25 * Math.sin(TAU * f * 2 * u)) }
		}
		out[i] = v * 0.5
	}
	return out
}

// louder to the same peak, clipped
export function normalized(name: string): Float32Array {
	const s = make(name)
	let peak = 0.001
	for (const v of s) peak = Math.max(peak, Math.abs(v))
	const g = 0.8 / peak
	for (let i = 0; i < s.length; i++) s[i] = Math.max(-1, Math.min(1, s[i] * g))
	return s
}
// every sound there is (anything else is the check sound)
export const SOUNDS = ['bell', 'boom', 'capture', 'check', 'choir', 'chug', 'clack', 'fanfare', 'flick', 'flip', 'horn', 'impact', 'laser', 'move', 'pad', 'ping', 'pixel', 'poof', 'riser', 'rumble', 'shimmer', 'sink', 'slash', 'sparkle', 'splat', 'squash', 'swell', 'swish', 'tick', 'toot', 'vortex', 'whistle', 'whoosh', 'zap']
