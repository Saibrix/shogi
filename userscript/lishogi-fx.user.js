// ==UserScript==
// @name         Lishogi FX
// @namespace    https://shogi.saidozturk08.workers.dev
// @version      0.1.2
// @description  Random capture effects on lishogi (cosmetic only: no sounds, no hints, never touches the game)
// @match        https://lishogi.org/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://shogi.saidozturk08.workers.dev/lishogi-fx.user.js
// @updateURL    https://shogi.saidozturk08.workers.dev/lishogi-fx.user.js
// ==/UserScript==
// Notes for changes: see userscript/NOTES.md in the shogi repo.
(function () {
	'use strict'
	const KEY = 'lishogiFx.on'
	let on = localStorage.getItem(KEY) !== '0'
	const TAU = Math.PI * 2
	const rr = (a, b) => a + Math.random() * (b - a)
	const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c) }
	const SIDE = { sente: '#ffcf73', gote: '#8fc8ff' }

	// ---- the switch in the board theme menu, next to "thick grid" ----
	function addSwitch() {
		const thick = document.querySelector('.sub.theme .thick-switch')
		if (!thick || document.getElementById('sgfx-toggle')) return
		const box = document.createElement('div')
		box.className = 'thick-switch sgfx-switch'
		box.innerHTML = '<label for="sgfx-toggle">Effects</label><div class="switch"><input id="sgfx-toggle" class="cmn-toggle" type="checkbox"><label for="sgfx-toggle"></label></div>'
		const input = box.querySelector('input')
		input.checked = on
		input.addEventListener('change', (e) => { e.stopPropagation(); on = input.checked; localStorage.setItem(KEY, on ? '1' : '0') })
		box.addEventListener('click', (e) => e.stopPropagation())
		thick.after(box)
	}

	// ---- the effect layer: one canvas over the whole window, only drawn while something moves ----
	let cv = null, ctx = null, dpr = 1, raf = 0, last = 0
	const parts = [], rings = [], flashes = [], victims = [], bursts = [], splats = [], zaps = []
	function layer() {
		if (cv && cv.isConnected) return
		cv = document.createElement('canvas')
		cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000'
		document.body.appendChild(cv)
		ctx = cv.getContext('2d')
	}
	function size() {
		dpr = Math.min(window.devicePixelRatio || 1, 2)
		const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr)
		if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
		// exactly the visible window (100vh is taller than the window on phones, which stretched the picture)
		cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px'
	}
	const glow = new Map()
	function glowSprite(col) {
		let s = glow.get(col)
		if (s) return s
		s = document.createElement('canvas'); s.width = s.height = 64
		const c = s.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
		g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, rgba(col, 0.85)); g.addColorStop(1, rgba(col, 0))
		c.fillStyle = g; c.fillRect(0, 0, 64, 64)
		glow.set(col, s)
		return s
	}
	function rgba(c, a) { const n = c.slice(1); return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})` }
	function particle(p, col, speed, life, sz, k = 0, g = 0) {
		const a = Math.random() * TAU, sp = speed * rr(0.35, 1)
		parts.push({ x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * rr(0.7, 1), max: life, col, s: sz * rr(0.6, 1.1), k, g, rot: Math.random() * TAU, sp: rr(-10, 10) })
	}
	function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }
	function busy() { return parts.length || rings.length || flashes.length || victims.length || bursts.length || splats.length || zaps.length }

	// ---- the effects (from Hex Chaos; only those that leave the moving piece alone) ----
	const LEAD = 0.1          // seconds the effect is brought forward (raise it if it still feels late)
	const STYLES = ['classic', 'poof', 'flick', 'pixel', 'vortex', 'balloon', 'frost', 'confetti', 'abduct', 'zap']
	function impact(p, sq, img, victimColor, moverColor, moverRole, dir) {
		layer(); size()
		const ts = sq * 0.58, col = SIDE[victimColor] || '#ffcf73', tcol = SIDE[moverColor] || '#ffffff'
		const style = STYLES[Math.floor(Math.random() * STYLES.length)]
		const V = (o) => victims.push(Object.assign({ img, sq, x: p[0], y: p[1], z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vr: 0, t: 0, life: 0.6 }, o))
		const ground = (c, max, life) => rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col: c, max, life, flat: true })
		let [dx, dy] = dir
		switch (style) {
			case 'poof':
				V({ mode: 'fade', life: 0.35 })
				for (let i = 0; i < 10; i++) particle(p, i % 2 ? '#c9ccd6' : '#ffffff', ts * 1.2, 0.6, ts * 0.13)
				ground('#ffffff', ts * 1.2, 0.4); break
			case 'flick': {
				const sd = Math.random() < 0.5 ? -1 : 1
				V({ vx: dx * ts * 2.4, vy: dy * ts * 2.4, vz: ts * 3, vr: sd * 6, life: 0.5 })
				for (let i = 0; i < 4; i++) particle(p, '#ffffff', ts * 1.5, 0.35, ts * 0.06, 1)
				break
			}
			case 'sink':
				V({ mode: 'sink', life: 0.7 }); ground(col, ts * 1.3, 0.7)
				for (let i = 0; i < 6; i++) particle([p[0], p[1] + ts * 0.25], '#8a7a6a', ts * 0.9, 0.5, ts * 0.08, 2, ts * 4)
				break
			case 'splat': {
				V({ mode: 'fade', life: 0.18 })
				const blobs = [[0, 0, ts * 0.62]]
				for (let i = 0; i < 9; i++) { const an = rr(0, TAU), d = ts * rr(0.45, 1.1); blobs.push([Math.cos(an) * d, Math.sin(an) * d * 0.6, ts * rr(0.1, 0.3)]) }
				splats.push({ x: p[0], y: p[1] + ts * 0.1, t: 0, life: 1.6, col, blobs })
				for (let i = 0; i < 16; i++) particle(p, col, ts * 4, 0.6, ts * 0.11, 2, ts * 9)
				break
			}
			case 'pixel':
				V({ mode: 'fade', life: 0.2 })
				for (let i = 0; i < 30; i++) parts.push({ x: p[0] + rr(-0.45, 0.45) * ts, y: p[1] + rr(-0.55, 0.35) * ts, vx: rr(-1, 1) * ts * 1.6, vy: rr(-2.6, -0.6) * ts, life: rr(0.7, 1.2), max: 1.2, col: i % 4 === 0 ? '#ffffff' : col, s: ts * rr(0.07, 0.12), k: 2, g: -ts * 0.5, rot: 0, sp: 0 })
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.2, r: ts * 0.9, col }); break
			case 'vortex':
				V({ mode: 'spiral', life: 0.9, x0: p[0], y0: p[1] })
				for (let i = 0; i < 22; i++) { const an = rr(0, TAU), d = ts * rr(0.8, 1.6); parts.push({ x: p[0] + Math.cos(an) * d, y: p[1] + Math.sin(an) * d * 0.7, vx: -Math.sin(an) * ts * 3 - Math.cos(an) * ts * 1.6, vy: Math.cos(an) * ts * 2.1 - Math.sin(an) * ts * 1.1, life: rr(0.5, 0.9), max: 0.9, col: i % 3 ? '#b47cff' : '#ffffff', s: ts * 0.08, k: 0, g: 0, rot: 0, sp: 0 }) }
				rings.push({ x: p[0], y: p[1], t: 0, col: '#b47cff', max: ts * 1.6, life: 0.7 })
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.6, r: ts * 1.2, col: '#3a1466' }); break
			case 'balloon':
				V({ mode: 'float', life: 1.4 })
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.2, r: ts * 0.8, col: '#ffffff' })
				for (let i = 0; i < 6; i++) particle(p, '#ffffff', ts * 1.2, 0.4, ts * 0.07); break
			case 'frost':
				V({ mode: 'frozen', life: 0.8 })
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.35, r: ts * 1.4, col: '#bfe6ff' }); ground('#bfe6ff', ts * 1.6, 0.6)
				for (let i = 0; i < 8; i++) particle(p, '#e8f6ff', ts * 0.9, 0.6, ts * 0.06)
				setTimeout(() => { for (let i = 0; i < 20; i++) particle(p, i % 2 ? '#e8f6ff' : '#8fd0ff', ts * 3.4, 0.8, ts * 0.11, 2, ts * 7); for (let i = 0; i < 8; i++) particle(p, '#ffffff', ts * 3, 0.3, ts * 0.05, 1); kick() }, 330)
				break
			case 'confetti': {
				V({ mode: 'fade', life: 0.22 })
				const cols = ['#ff4f7b', '#ffd24a', '#5aa8ff', '#6fdc8c', '#b46cff', '#ff9a3c']
				for (let i = 0; i < 44; i++) parts.push({ x: p[0], y: p[1] - ts * 0.2, vx: rr(-1, 1) * ts * 3.6, vy: rr(-5.2, -1.6) * ts, life: rr(0.9, 1.5), max: 1.5, col: cols[i % cols.length], s: ts * rr(0.06, 0.11), k: 2, g: ts * 7, rot: rr(0, TAU), sp: rr(-14, 14) })
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.25, r: ts * 1.2, col: '#fff3c4' }); ground('#ffffff', ts * 1.5, 0.4)
				break
			}
			case 'abduct':
				V({ mode: 'abduct', life: 1.3 })
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.5, r: ts * 1.3, col: '#a6ffb0' })
				for (let i = 0; i < 16; i++) parts.push({ x: p[0] + rr(-0.5, 0.5) * ts, y: p[1] + rr(-0.2, 0.4) * ts, vx: rr(-0.2, 0.2) * ts, vy: -rr(1.5, 3.5) * ts, life: rr(0.7, 1.2), max: 1.2, col: i % 3 ? '#c8ffd0' : '#ffffff', s: ts * rr(0.05, 0.09), k: 0, g: 0, rot: 0, sp: 0 })
				ground('#a6ffb0', ts * 1.4, 0.8); break
			case 'zap':
				V({ mode: 'ash', life: 0.85 })
				for (let k = 0; k < 4; k++) { const an = rr(0, TAU), d = ts * rr(1, 1.8); zaps.push({ pts: jagged(p, [p[0] + Math.cos(an) * d, p[1] + Math.sin(an) * d], ts * 0.25), t: 0, life: 0.35, col: '#9fe6ff', w: ts * 0.09 }) }
				flashes.push({ x: p[0], y: p[1], t: 0, life: 0.35, r: ts * 1.8, col: '#9fe6ff' })
				for (let i = 0; i < 16; i++) particle(p, i % 2 ? '#9fe6ff' : '#ffffff', ts * 3.6, 0.45, ts * 0.07, 1)
				for (let i = 0; i < 14; i++) particle(p, '#2a2a33', ts * 0.8, 1.1, ts * 0.09, 2, -ts * 2.5)
				break
			default: {          // classic: knocked away, shockwave, sparks and a burst that fits the taking piece
				const side = Math.random() < 0.5 ? -1 : 1
				V({ vx: dx * ts * 3.6 - dy * ts * 0.6 * side, vy: dy * ts * 3.6 + dx * ts * 0.6 * side, vz: ts * 5.2, vr: side * rr(7, 11), life: 0.62 })
				rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col, max: ts * 2.3, life: 0.6, flat: true })
				rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col: '#ffffff', max: ts * 1.4, life: 0.4, flat: true })
				flashes.push({ x: p[0], y: p[1] - ts * 0.1, t: 0, life: 0.22, r: ts * 1.1, col: '#ffffff' })
				for (let i = 0; i < 12; i++) particle(p, i % 3 ? col : '#ffffff', ts * 4.4, 0.5, ts * 0.09, 1)
				for (let i = 0; i < 14; i++) particle(p, col, ts * 3, 0.9, ts * 0.085, 2, ts * 8)
				const kind = { pawn: 'stomp', tokin: 'stomp', lance: 'strike', knight: 'bounce', silver: 'slice', bishop: 'slice', horse: 'slice', gold: 'ram', rook: 'ram', dragon: 'ram', king: 'royal' }[moverRole] || 'stomp'
				bursts.push({ kind, ts, x: p[0], y: p[1], dx, dy, t: 0, life: kind === 'ram' ? 0.6 : kind === 'slice' ? 0.5 : kind === 'strike' ? 0.65 : 0.7, col: tcol, seed: Math.floor(Math.random() * 1e9) })
			}
		}
		advance(LEAD)          // start the effect already a little way in, so it lands on time
		kick()
	}
	function jagged(a, b, jag) {
		const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d
		const n = Math.max(4, Math.round(d / (jag * 1.4))), out = [a]
		for (let i = 1; i < n; i++) { const k = i / n, o = rr(-1, 1) * jag; out.push([a[0] + (b[0] - a[0]) * k + nx * o, a[1] + (b[1] - a[1]) * k + ny * o]) }
		out.push(b); return out
	}

	function frame(now) {
		raf = 0
		const dt = Math.min(0.05, (now - last) / 1000)
		last = now
		advance(dt)
		draw()
		if (busy()) raf = requestAnimationFrame(frame)
		else ctx.clearRect(0, 0, cv.width, cv.height)
	}
	function advance(dt) {
		const step = (arr) => { for (const x of arr) x.t += dt / x.life; for (let i = arr.length - 1; i >= 0; i--) if (arr[i].t >= 1) arr.splice(i, 1) }
		step(rings); step(flashes); step(bursts); step(splats); step(zaps)
		for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; const k = Math.pow(p.k === 2 ? 0.25 : 0.04, dt); p.vx *= k; p.vy = (p.vy + p.g * dt) * k; p.rot += p.sp * dt; p.life -= dt }
		for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1)
		for (const v of victims) { const ts = v.sq * 0.58; v.t += dt / v.life; v.x += v.vx * dt; v.y += v.vy * dt; v.vz -= ts * 17 * dt; v.z = Math.max(0, v.z + v.vz * dt); v.rot += v.vr * dt; if (v.z === 0 && v.vz < 0) v.vz *= -0.3 }
		for (let i = victims.length - 1; i >= 0; i--) if (victims[i].t >= 1) victims.splice(i, 1)
	}

	function drawPiece(img, x, y, sz, alpha) {
		if (!img || !img.complete || !img.naturalWidth) return
		ctx.save(); ctx.globalAlpha *= Math.max(0, alpha); ctx.drawImage(img, x - sz / 2, y - sz / 2, sz, sz); ctx.restore()
	}
	function tinted(img, sz, tint, alpha) {
		const t = document.createElement('canvas'); t.width = t.height = Math.ceil(sz * dpr)
		const c = t.getContext('2d')
		if (img && img.complete && img.naturalWidth) c.drawImage(img, 0, 0, t.width, t.height)
		c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.65; c.fillStyle = tint; c.fillRect(0, 0, t.width, t.height)
		ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(t, -sz / 2, -sz / 2, sz, sz); ctx.restore()
	}
	function drawVictim(v) {
		const k = Math.min(1, v.t), sz = v.sq, ts = sz * 0.58
		ctx.save()
		switch (v.mode) {
			case 'fade': ctx.translate(v.x, v.y); ctx.scale(1 + 0.3 * k, 1 + 0.3 * k); drawPiece(v.img, 0, 0, sz, 1 - k); break
			case 'sink': ctx.beginPath(); ctx.rect(v.x - sz, v.y - sz * 2, sz * 2, sz * 2.5); ctx.clip(); drawPiece(v.img, v.x, v.y + sz * 0.9 * k * k, sz, 1 - k * k); break
			case 'spiral': { const an = k * 9, r = ts * 0.6 * (1 - k); ctx.translate(v.x0 + Math.cos(an) * r, v.y0 + Math.sin(an) * r * 0.6); ctx.rotate(k * 14); ctx.scale(1 - k, 1 - k); drawPiece(v.img, 0, 0, sz, 1 - k * 0.5); break }
			case 'float': {
				const up = ts * 3.4 * k * k + ts * 0.5 * k, x = v.x + Math.sin(k * 9) * ts * 0.14, y = v.y - up
				ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3)
				const bx = x + ts * 0.12, by = y - sz * 0.9
				ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, ts * 0.035)
				ctx.beginPath(); ctx.moveTo(x, y - sz * 0.35); ctx.quadraticCurveTo(x - ts * 0.18, y - sz * 0.6, bx, by + ts * 0.42); ctx.stroke()
				ctx.fillStyle = '#ff4f7b'; ctx.beginPath(); ctx.ellipse(bx, by, ts * 0.34, ts * 0.42, 0, 0, TAU); ctx.fill()
				ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(bx - ts * 0.11, by - ts * 0.15, ts * 0.07, ts * 0.13, -0.5, 0, TAU); ctx.fill()
				ctx.translate(x, y); ctx.rotate(Math.sin(k * 7) * 0.18); drawPiece(v.img, 0, 0, sz, 1 - 0.25 * k)
				break
			}
			case 'frozen': {
				const br = 0.42, sh = k > 0.18 && k < br ? Math.sin(k * 110) * ts * 0.035 : 0
				ctx.translate(v.x + sh, v.y)
				let al = 1
				if (k >= br) { const u = (k - br) / (1 - br); al = Math.max(0, 1 - u * 2.5); ctx.scale(1 + u * 0.4, 1 + u * 0.4) }
				tinted(v.img, sz, '#9fd8ff', al)
				break
			}
			case 'abduct': {
				const beam = k < 0.12 ? k / 0.12 : k > 0.85 ? Math.max(0, (1 - k) / 0.15) : 1
				const gr = ctx.createLinearGradient(v.x, v.y - ts * 7, v.x, v.y + sz * 0.5)
				gr.addColorStop(0, 'rgba(166,255,176,0)'); gr.addColorStop(1, 'rgba(166,255,176,0.5)')
				ctx.globalAlpha = beam; ctx.fillStyle = gr
				ctx.beginPath(); ctx.moveTo(v.x - ts * 0.22, v.y - ts * 7); ctx.lineTo(v.x + ts * 0.22, v.y - ts * 7); ctx.lineTo(v.x + ts * 0.8, v.y + sz * 0.5); ctx.lineTo(v.x - ts * 0.8, v.y + sz * 0.5); ctx.closePath(); ctx.fill()
				const u = Math.max(0, (k - 0.12) / 0.88), up = ts * 5 * u * u
				ctx.globalAlpha = 1; ctx.translate(v.x, v.y - up); ctx.rotate(u * 5); drawPiece(v.img, 0, 0, sz, Math.max(0, 1 - u * u))
				break
			}
			case 'ash': ctx.translate(v.x, v.y); ctx.scale(1 - 0.25 * k, 1 - 0.25 * k); tinted(v.img, sz, '#2a2a33', 1 - k); break
			default: {
				const al = Math.min(1, (1 - k) * 2.6)
				ctx.globalAlpha = al * 0.35; ctx.fillStyle = '#000'
				ctx.beginPath(); ctx.ellipse(v.x, v.y + sz * 0.4, ts * 0.42 * (1 - Math.min(0.6, v.z / (ts * 3))), ts * 0.17, 0, 0, TAU); ctx.fill()
				ctx.globalAlpha = 1; ctx.translate(v.x, v.y - v.z); ctx.rotate(v.rot); const sc = 1 - 0.3 * k; ctx.scale(sc, sc)
				drawPiece(v.img, 0, 0, sz, al)
			}
		}
		ctx.restore()
	}
	function draw() {
		size()
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		for (const s of splats) {
			const al = s.t < 0.6 ? 1 : 1 - (s.t - 0.6) / 0.4, grow = Math.min(1, s.t / 0.06)
			ctx.save(); ctx.globalAlpha = 0.85 * al; ctx.fillStyle = s.col
			for (const b of s.blobs) { ctx.beginPath(); ctx.ellipse(s.x + b[0] * grow, s.y + b[1] * grow, b[2] * grow, b[2] * 0.6 * grow, 0, 0, TAU); ctx.fill() }
			ctx.restore()
		}
		for (const p of parts) if (p.k === 2) {
			const age = 1 - p.life / p.max
			ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = smooth(age / 0.06) * Math.min(1, (p.life / p.max) * 2.5)
			ctx.fillStyle = p.col; ctx.fillRect(-p.s, -p.s * 0.6, p.s * 2, p.s * 1.2); ctx.restore()
		}
		for (const v of victims) drawVictim(v)
		ctx.globalCompositeOperation = 'lighter'
		for (const f of flashes) { const a = smooth(f.t / 0.1) * Math.pow(1 - f.t, 2), r = f.r * (0.45 + 0.75 * (1 - Math.pow(1 - f.t, 3))); ctx.globalAlpha = Math.min(1, a); ctx.drawImage(glowSprite(f.col), f.x - r, f.y - r, r * 2, r * 2) }
		for (const r of rings) {
			const k = r.t, base = r.max * 0.13, rad = Math.max(0.5, base + (r.max - base) * (1 - Math.pow(1 - k, 3))), a = smooth(k / 0.12) * Math.pow(1 - k, 1.4), w = Math.max(2, r.max * 0.05) * (1 - k * 0.7)
			ctx.globalAlpha = a * 0.28; ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, r.flat ? rad * 0.5 : rad, 0, 0, TAU); ctx.strokeStyle = r.col; ctx.lineWidth = w * 2.6; ctx.stroke()
			ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, r.flat ? rad * 0.5 : rad, 0, 0, TAU); ctx.lineWidth = w; ctx.stroke()
		}
		for (const b of bursts) drawBurst(b)
		ctx.globalCompositeOperation = 'lighter'
		for (const z of zaps) {
			const a = smooth(z.t / 0.05) * Math.pow(1 - z.t, 1.2)
			const line = (w, col, al) => { ctx.globalAlpha = al; ctx.beginPath(); z.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke() }
			line(z.w * 3.2, z.col, 0.2 * a); line(z.w * 1.5, z.col, 0.6 * a); line(Math.max(1.5, z.w * 0.6), '#ffffff', a)
		}
		for (const p of parts) {
			if (p.k === 2) continue
			const age = 1 - p.life / p.max, left = Math.max(0, p.life / p.max), a = smooth(age / 0.07) * Math.pow(left, 1.2)
			if (a <= 0.003) continue
			ctx.globalAlpha = Math.min(1, a)
			if (p.k === 1) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(1.5, p.s * 0.5); ctx.lineCap = 'round'; ctx.stroke() }
			else { const r = p.s * (1.8 + 1.2 * Math.sin(Math.min(1, age * 3) * 1.4)) * (0.5 + 0.5 * left); ctx.drawImage(glowSprite(p.col), p.x - r, p.y - r, r * 2, r * 2) }
		}
		ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
	}
	function drawBurst(b) {
		const k = b.t, fade = smooth(1 - k), out = 1 - Math.pow(1 - k, 3), env = smooth(k / 0.1), ts = (b.ts || 30), x = b.x, y = b.y
		let s = (b.seed >>> 0) || 1
		const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
		ctx.save(); ctx.globalCompositeOperation = 'lighter'
		const line = (x0, y0, x1, y1, c, w) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineCap = 'round'; ctx.globalAlpha = 0.22 * env; ctx.strokeStyle = c; ctx.lineWidth = w * 2.6; ctx.stroke(); ctx.globalAlpha = env; ctx.lineWidth = w; ctx.stroke() }
		const arcs = (r, c, w) => { if (r <= 0) return; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = c; ctx.globalAlpha = 0.22 * env; ctx.lineWidth = Math.max(w, 0.5) * 2.6; ctx.stroke(); ctx.globalAlpha = env; ctx.lineWidth = Math.max(w, 0.5); ctx.stroke() }
		const col = b.col
		switch (b.kind) {
			case 'ram': {
				const sx = -b.dy, sy = b.dx
				for (let i = 0; i < 6; i++) { const off = (i - 2.5) * ts * 0.17; line(x - b.dx * ts * (0.3 + 1.6 * out) + sx * off, y - b.dy * ts * (0.3 + 1.6 * out) + sy * off, x - b.dx * ts * (0.1 + 0.5 * out) + sx * off * (1 + out), y - b.dy * ts * (0.1 + 0.5 * out) + sy * off * (1 + out), rgba(col, 0.9 * fade), Math.max(2, ts * 0.07)) }
				arcs(ts * (0.2 + 1.5 * out), rgba(col, fade), Math.max(2.5, ts * 0.2 * fade)); break
			}
			case 'slice':
				for (let n = 0; n < 2; n++) {
					const dx = Math.SQRT1_2, dy = (n === 0 ? 1 : -1) * Math.SQRT1_2, reach = ts * 1.5, head = Math.max(0, Math.min(1, k * 3 - n * 0.7))
					if (head <= 0) continue
					const a = Math.max(0, Math.min(1, fade * 1.6))
					line(x - dx * reach, y - dy * reach, x - dx * reach + dx * reach * 2 * head, y - dy * reach + dy * reach * 2 * head, `rgba(255,255,255,${a})`, Math.max(2, ts * 0.09))
				}
				break
			case 'bounce':
				for (let n = 0; n < 2; n++) {
					const kk = Math.max(0, Math.min(1, k * 1.4 - n * 0.2)); if (kk <= 0) continue
					const o = 1 - Math.pow(1 - kk, 2)
					ctx.beginPath(); ctx.ellipse(x, y, ts * (0.3 + 1.3 * o), ts * (0.15 + 0.6 * o), 0, 0, TAU)
					ctx.globalAlpha = env; ctx.strokeStyle = rgba(col, 0.9 * (1 - kk)); ctx.lineWidth = Math.max(2, ts * 0.12 * (1 - kk)); ctx.stroke()
				}
				break
			case 'strike': {
				const top = [x + (rnd() * 0.6 - 0.3) * ts, y - ts * 3.2], pts = [top]
				for (let i = 1; i < 7; i++) { const f = i / 6, jit = (rnd() - 0.5) * ts * 0.7 * (1 - f); pts.push([top[0] + (x - top[0]) * f + jit, top[1] + (y - top[1]) * f]) }
				const flash = k < 0.45 ? 1 : Math.max(0, Math.min(1, (0.7 - k) / 0.25))
				ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.globalAlpha = env; ctx.strokeStyle = `rgba(255,255,255,${flash})`; ctx.lineWidth = Math.max(2, ts * 0.1); ctx.stroke()
				arcs(ts * (0.3 + 1.2 * out), rgba(col, fade), Math.max(2, ts * 0.1 * fade)); break
			}
			case 'royal':
				arcs(ts * (0.3 + 1.4 * out), rgba('#ffd24d', fade), Math.max(2, ts * 0.16 * fade)); break
			default:
				for (let i = 0; i < 7; i++) {
					const a = rnd() * TAU, len = ts * (0.7 + rnd() * 0.6) * out
					ctx.beginPath(); ctx.moveTo(x, y)
					for (let j = 1; j < 4; j++) { const aa = a + (rnd() - 0.5) * 0.7; ctx.lineTo(x + Math.cos(aa) * len * j / 3, y + Math.sin(aa) * len * j / 3) }
					ctx.globalAlpha = env; ctx.strokeStyle = rgba(col, fade); ctx.lineWidth = Math.max(2, ts * 0.08 * fade + 1); ctx.lineJoin = 'round'; ctx.stroke()
				}
				arcs(ts * (0.3 + 0.9 * out), `rgba(217,191,153,${0.5 * fade})`, Math.max(2, ts * 0.12 * fade))
		}
		ctx.restore()
	}

	// ---- watching the board ----
	// shogiground places every piece with transform: translate(x%, y%) (x/100 = column, y/100 = row on screen).
	// A capture: when the move animation ends, the taken piece's element is removed, and a piece of the other colour stands on its square.
	const imgCache = new Map()          // "orientation|color role" -> the picture of that piece
	const ROLES = ['pawn', 'lance', 'knight', 'silver', 'gold', 'bishop', 'rook', 'king', 'tokin', 'promotedlance', 'promotedknight', 'promotedsilver', 'horse', 'dragon']
	function pieceInfo(el) {
		const cl = el.classList
		const color = cl.contains('sente') ? 'sente' : cl.contains('gote') ? 'gote' : ''
		const role = ROLES.find((r) => cl.contains(r)) || ''
		// translate(col * 100 * f %, row * 100 * f %) scale(f): with "scale down pieces" lishogi draws pieces twice as big and f = 0.5
		const tr = el.style.transform || ''
		const m = /translate\(\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%/.exec(tr)
		const sc = /scale\(\s*([\d.]+)/.exec(tr)
		const f = sc ? Number(sc[1]) || 1 : 1
		return { color, role, col: m ? Math.round(Number(m[1]) / (100 * f)) : -1, row: m ? Math.round(Number(m[2]) / (100 * f)) : -1 }
	}
	const wrapOf = (piecesEl) => piecesEl.closest('.sg-wrap')
	const orient = (piecesEl) => { const w = wrapOf(piecesEl); return w && w.classList.contains('orientation-gote') ? 'g' : 's' }
	function remember(piecesEl) {
		const o = orient(piecesEl)
		for (const el of piecesEl.children) {
			if (el.tagName !== 'PIECE') continue
			const i = pieceInfo(el), key = `${o}|${i.color} ${i.role}`
			if (imgCache.has(key)) continue
			const bg = getComputedStyle(el).backgroundImage
			const m = /url\(["']?(.*?)["']?\)/.exec(bg || '')
			if (!m) continue
			const img = new Image(); img.src = m[1]
			imgCache.set(key, img)
		}
	}
	function onChange(piecesEl, removed) {
		remember(piecesEl)
		if (!on || !removed.length || removed.length > 2) return          // (many at once: a jump in the move list, not a capture)
		const rect = piecesEl.getBoundingClientRect()
		if (!rect.width) return
		const dm = /d-(\d+)x(\d+)/.exec(wrapOf(piecesEl)?.className || '')
		const sw = rect.width / (dm ? Number(dm[1]) : 9), sh = rect.height / (dm ? Number(dm[2]) : 9)          // (lishogi's squares are a little taller than wide)
		const sq = Math.min(sw, sh)
		const now = [...piecesEl.children].filter((e) => e.tagName === 'PIECE' && !e.classList.contains('ghost')).map(pieceInfo)
		for (const el of removed) {
			const v = pieceInfo(el)
			if (v.col < 0 || !v.color) continue
			const mover = now.find((p) => p.col === v.col && p.row === v.row && p.color && p.color !== v.color)
			if (!mover) continue          // no piece of the other side there: a promotion or a jump, not a capture
			const p = [rect.left + (v.col + 0.5) * sw, rect.top + (v.row + 0.5) * sh]
			const img = imgCache.get(`${orient(piecesEl)}|${v.color} ${v.role}`)
			const dir = [0, (mover.color === 'sente') === (orient(piecesEl) === 's') ? -1 : 1]          // the push goes the way the taker moves
			impact(p, sq, img, v.color, mover.color, mover.role, dir)
		}
	}
	const obs = new MutationObserver((list) => {
		addSwitch()
		const byBoard = new Map()
		for (const m of list) {
			const t = m.target
			if (!(t instanceof Element) || t.tagName !== 'SG-PIECES') continue
			const arr = byBoard.get(t) || []
			for (const n of m.removedNodes) if (n.nodeType === 1 && n.tagName === 'PIECE') arr.push(n)
			byBoard.set(t, arr)
		}
		for (const [el, removed] of byBoard) onChange(el, removed)
	})
	obs.observe(document.body, { childList: true, subtree: true })
	for (const el of document.querySelectorAll('sg-pieces')) remember(el)
	addSwitch()
	window.addEventListener('resize', () => { if (cv) size() })
})()
