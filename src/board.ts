// The shogi board on a canvas, with the move animation and the capture effects of Hex Chaos (board.ts there, ported to squares).
// A frame is only drawn while something moves or fades.
import { Position, mFrom, mTo, mDrop, mPromo, mv, dropMv, base, PROMOTE, HAND_TYPES, K, P, L, N, S, G, B, R, deadEnd } from './rules'
import { pieceSprite, onPiecesLoaded } from './pieces'
import { settings, BOARDS, Looks, EffectsMode } from './settings'
import { playSound, preloadSounds } from './sfx'
import { h } from './ui'

const TAU = Math.PI * 2
const DRAG_THRESHOLD = 8
export const FX_PAD = 90
export const HIT = { CLASSIC: 0, POOF: 1, FLICK: 2, SINK: 3, SPLAT: 4, SLASH: 5, PANCAKE: 6, ZAP: 7, PIXEL: 8, VORTEX: 9, METEOR: 10, TRAIN: 11, BALLOON: 12, FROST: 13, CONFETTI: 14, ABDUCT: 15, COUNT: 16 }
export const HIT_NAMES = ['Classic', 'Poof', 'Flick', 'Sink', 'Paint splat', 'Slash', 'Pancake', 'Zap', 'Pixels', 'Vortex', 'Meteor', 'Train', 'Balloon', 'Frost', 'Confetti', 'Abduction']
const HIT_DUR: Record<number, number> = { [HIT.SLASH]: 0.16, [HIT.PANCAKE]: 0.46, [HIT.ZAP]: 0.3, [HIT.METEOR]: 0.75, [HIT.TRAIN]: 1.15 }
const TRAIN_PART = 0.62
const DEFAULT_FX = ['#ffcf73', '#8fc8ff']          // effect colour of a side when its pieces have no own colour

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; s: number; k: number; g: number; rot: number; sp: number }
interface Ring { x: number; y: number; t: number; col: string; max: number; life: number; flat?: boolean }
interface Victim { code: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; vr: number; t: number; life: number; mode?: string; ang?: number; x0?: number; y0?: number }
interface Splat { x: number; y: number; t: number; life: number; col: string; blobs: [number, number, number][] }
interface Zap { pts: [number, number][]; t: number; life: number; col: string; w: number }
interface Slash { x: number; y: number; ang: number; len: number; t: number; life: number }
interface TileHit { sq: number; t: number; life: number; col: string }
interface Kick { sq: number; t: number; life: number; amp: number }
interface Flash { x: number; y: number; t: number; life: number; r: number; col: string }
interface Burst { kind: string; x: number; y: number; dx: number; dy: number; t: number; life: number; col: string; seed: number }
interface Anim { from: number; to: number; fromPx: [number, number]; t: number; dur: number; captured: number; style: number; hitAt: number; hitDone: boolean; dir: number; code: number; simple: boolean }
export interface Arrow { m: number; color: string; side?: number }

const glowCache = new Map<string, HTMLCanvasElement>()
function hexRgb(c: string): [number, number, number] {
	if (c.startsWith('#')) { const n = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)] }
	const m = c.match(/[\d.]+/g); return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [255, 255, 255]
}
const rgba = (c: string, a: number) => { const [r, g, b] = hexRgb(c); return `rgba(${r},${g},${b},${a})` }
export function glowSprite(col: string): HTMLCanvasElement {
	let s = glowCache.get(col)
	if (s) return s
	s = document.createElement('canvas'); s.width = s.height = 64
	const c = s.getContext('2d')!
	const g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
	g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, rgba(col, 0.85)); g.addColorStop(1, rgba(col, 0))
	c.fillStyle = g; c.fillRect(0, 0, 64, 64)
	glowCache.set(col, s)
	return s
}
function rngSeed(seed: number) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
const rr = (a: number, b: number) => a + Math.random() * (b - a)
const smooth = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c) }

export class ShogiBoard {
	el: HTMLDivElement
	canvas: HTMLCanvasElement
	fx: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private fctx: CanvasRenderingContext2D
	pos: Position = Position.start()
	orientation = 0
	movable = -1          // the side the user may move: -1 none, 0 / 1, 2 both
	lastMove = 0
	arrows: Arrow[] = []
	marks: { sq: number; color: string }[] = []
	looks: [Looks | null, Looks | null] = [null, null]
	effects: EffectsMode = 'all'
	onUserMove: (m: number) => void = () => {}
	coords = true

	private w = 0; private hgt = 0; private dpr = 1; private fdpr = 1
	private s = 40; private bx = 0; private by = 0; private handY = [0, 0]
	private sel = -1          // a square, or 100 + type for a piece in hand
	private targets: number[] = []
	private legalCache: number[] | null = null
	private pressing = false; private dragging = false; private pressPos: [number, number] = [0, 0]; private dragPos: [number, number] = [0, 0]; private pressWasSel = false
	private promoBox: HTMLElement | null = null
	private raf = 0; private last = 0; private time = 0; private dirty = true
	private anim: Anim | null = null
	private particles: Particle[] = []; private rings: Ring[] = []; private bursts: Burst[] = []; private flashes: Flash[] = []
	private victims: Victim[] = []; private tileHits: TileHit[] = []; private kicks: Kick[] = []; private splats: Splat[] = []; private zaps: Zap[] = []; private slashes: Slash[] = []
	private freeze = 0; private shake = 0; private trailT = 0; private fxDrawn = false
	private off: [number, number] = [0, 0]

	constructor() {
		preloadSounds(['move', 'capture', 'check', 'poof', 'swish', 'bell', 'sparkle', 'flick', 'toot', 'swell', 'laser'])
		this.canvas = h('canvas', { class: 'board' })
		this.fx = h('canvas', { class: 'boardfx' })
		this.el = h('div', { class: 'boardwrap' }, this.canvas, this.fx)
		this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none'
		this.fx.style.cssText = `position:absolute;left:-${FX_PAD}px;top:-${FX_PAD}px;width:calc(100% + ${FX_PAD * 2}px);height:calc(100% + ${FX_PAD * 2}px);pointer-events:none;z-index:3`
		this.ctx = this.canvas.getContext('2d')!
		this.fctx = this.fx.getContext('2d')!
		new ResizeObserver(() => this.resize()).observe(this.el)
		this.canvas.addEventListener('pointerdown', (e) => this.pdown(e))
		this.canvas.addEventListener('pointermove', (e) => this.pmove(e))
		this.canvas.addEventListener('pointerup', (e) => this.pup(e))
		this.canvas.addEventListener('pointercancel', () => { this.pressing = false; this.dragging = false; this.redraw() })
		onPiecesLoaded(() => this.redraw())
	}

	// ---- geometry ----
	private resize(): void {
		const r = this.el.getBoundingClientRect()
		const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height))
		const dpr = Math.min(window.devicePixelRatio || 1, 3)
		if (w === this.w && hh === this.hgt && dpr === this.dpr) return
		this.w = w; this.hgt = hh; this.dpr = dpr
		this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(hh * dpr)
		const cells = (w + FX_PAD * 2) * (hh + FX_PAD * 2)
		this.fdpr = Math.max(1, Math.min(dpr, 2, Math.sqrt(3e6 / cells)))
		this.fx.width = Math.round((w + FX_PAD * 2) * this.fdpr); this.fx.height = Math.round((hh + FX_PAD * 2) * this.fdpr)
		this.layout()
		this.redraw()
	}
	private layout(): void {
		const cm = this.coords ? 0.42 : 0.12
		const hand = 1.12
		const s = Math.min(this.w / (9 + cm + 0.12), this.hgt / (9 + 2 * hand + cm + 0.3))
		this.s = s
		this.bx = (this.w - 9 * s - (this.coords ? cm * s * 0.6 : 0)) / 2
		const total = 9 * s + 2 * hand * s + cm * s + 0.3 * s
		const top = (this.hgt - total) / 2
		this.handY = [0, 0]
		const yTopHand = top + hand * s / 2
		this.by = top + hand * s + cm * s + 0.1 * s
		const yBottomHand = this.by + 9 * s + 0.2 * s + hand * s / 2
		// handY[side]: the side at the bottom has the bottom hand
		this.handY[this.orientation] = yBottomHand
		this.handY[1 - this.orientation] = yTopHand
	}
	get ts(): number { return this.s * 0.58 }          // the "tile size" the effects were made for
	sqCenter(sq: number): [number, number] {
		let r = Math.floor(sq / 9), c = sq % 9
		if (this.orientation) { r = 8 - r; c = 8 - c }
		return [this.bx + (c + 0.5) * this.s + this.off[0], this.by + (r + 0.5) * this.s + this.off[1]]
	}
	private sqAt(x: number, y: number): number {
		let c = Math.floor((x - this.bx) / this.s), r = Math.floor((y - this.by) / this.s)
		if (c < 0 || c > 8 || r < 0 || r > 8) return -1
		if (this.orientation) { r = 8 - r; c = 8 - c }
		return r * 9 + c
	}
	// the slots of a hand: only the kinds held, bottom hand from the left, top hand from the right
	handSlots(side: number, pos = this.pos): { t: number; n: number; x: number; y: number }[] {
		const out: { t: number; n: number; x: number; y: number }[] = []
		const bottom = side === this.orientation
		const list = HAND_TYPES.filter((t) => pos.hands[side][t] > 0)
		const sw = Math.min(this.s * 1.25, (9 * this.s) / Math.max(1, list.length))
		list.forEach((t, i) => {
			const x = bottom ? this.bx + sw * (i + 0.5) : this.bx + 9 * this.s - sw * (i + 0.5)
			out.push({ t, n: pos.hands[side][t], x: x + this.off[0], y: this.handY[side] + this.off[1] })
		})
		return out
	}
	private handAt(x: number, y: number): number {
		for (const side of [0, 1]) for (const sl of this.handSlots(side)) if (Math.abs(x - sl.x) < this.s * 0.5 && Math.abs(y - sl.y) < this.s * 0.55) return side * 100 + sl.t + 1000
		return -1
	}

	// ---- state from outside ----
	redraw(): void { this.dirty = true; this.kick() }
	private kick(): void { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)) } }
	setOrientation(o: number): void { this.orientation = o; this.layout(); this.redraw() }
	setCoords(on: boolean): void { this.coords = on; this.layout(); this.redraw() }
	setPosition(p: Position, lastMove = 0): void {
		this.pos = p; this.lastMove = lastMove; this.legalCache = null
		this.anim = null
		this.clearSelection()
	}
	clearSelection(): void { this.sel = -1; this.targets = []; this.dragging = false; this.pressing = false; this.promoBox?.remove(); this.promoBox = null; this.redraw() }
	private legal(): number[] { if (!this.legalCache) this.legalCache = this.pos.legal(); return this.legalCache }
	animating(): boolean { return !!this.anim }

	// A move was made: show it with the animation and the capture effect of the side that moved
	playMove(before: Position, m: number, after: Position, quiet = false): void {
		const to = mTo(m), from = mFrom(m), d = mDrop(m)
		const side = before.turn
		const captured = before.board[to]
		let fromPx: [number, number]
		if (d) { const sl = this.handSlots(side, before).find((x) => x.t === d); fromPx = sl ? [sl.x, sl.y] : this.sqCenter(to) }
		else fromPx = this.dragDrop ?? this.sqCenter(from)
		this.dragDrop = null
		this.pos = after; this.lastMove = m; this.legalCache = null
		this.sel = -1; this.targets = []; this.dragging = false; this.pressing = false
		const code = after.board[to]
		const look = this.looks[side]?.[base(Math.abs(code))]
		const mode = this.effects
		let style = captured && mode !== 'off' && mode !== 'simple' ? (look?.hit ?? 0) : 0
		if (style < 0) style = Math.floor(Math.random() * HIT.COUNT)
		let dur = d ? 0.2 : 0.22
		if (HIT_DUR[style]) dur = HIT_DUR[style]
		const tp = this.sqCenter(to), ts = this.ts
		const dir = side === this.orientation ? 1 : -1
		let hitAt = 1
		if (style === HIT.TRAIN) {
			const sx = dir > 0 ? -ts * 3 : this.w + ts * 3, ex = dir > 0 ? this.w + ts * 9 : -ts * 9
			hitAt = Math.max(0.05, Math.min(0.95, (tp[0] - dir * ts * 0.45 - sx) / (ex - sx))) * TRAIN_PART
		}
		if (style === HIT.ZAP) {
			this.zaps.push({ pts: this.jagged(fromPx, tp, ts * 0.35), t: 0, life: 0.45, col: '#9fe6ff', w: ts * 0.16 })
			this.flashes.push({ x: fromPx[0], y: fromPx[1], t: 0, life: 0.3, r: ts * 1.1, col: '#9fe6ff' })
		}
		if (!quiet) switch (style) {
			case HIT.SLASH: playSound('whoosh', 0.5, 1.5); break
			case HIT.PANCAKE: playSound('whoosh', 0.45, 0.8); break
			case HIT.ZAP: playSound('zap', 0.55); break
			case HIT.METEOR: playSound('whoosh', 0.5, 0.7); setTimeout(() => playSound('whistle', 0.5), dur * 400); break
			case HIT.TRAIN: playSound('toot', 0.5); setTimeout(() => playSound('clack', 0.55), 120); break
			case HIT.ABDUCT: playSound('swell', 0.35, 1.5); break
		}
		this.anim = { from, to, fromPx, t: 0, dur, captured, style, hitAt, hitDone: false, dir, code, simple: mode === 'simple' || mode === 'off' }
		this.quietSounds = quiet
		if (!quiet) {
			if (!captured) playSound('move', 0.63)
			else if (style === 0) playSound('capture', 0.63)
			else playSound('move', 0.3)
			if (after.inCheck()) setTimeout(() => playSound('check', 0.5), dur * 1000)
		}
		this.redraw()
	}
	private quietSounds = false
	private dragDrop: [number, number] | null = null

	// effect colours: the own colour of the piece kind, else the side's default
	private fxColor(code: number): string {
		const side = code > 0 ? 0 : 1
		return this.looks[side]?.[base(Math.abs(code))]?.color ?? DEFAULT_FX[side]
	}

	// ---- drawing a piece ----
	drawPc(ctx: CanvasRenderingContext2D, code: number, x: number, y: number, ts: number, alpha = 1, lift = 0): void {
		if (!code) return
		const side = code > 0 ? 0 : 1, t = Math.abs(code)
		const sz = (ts / 0.58) * 0.94
		const color = this.looks[side]?.[base(t)]?.color ?? null
		const sp = pieceSprite(t, side ^ this.orientation, sz * this.dpr, color)
		if (!sp) return
		ctx.save()
		if (alpha < 1) ctx.globalAlpha *= Math.max(0, alpha)
		if (lift > 0) {
			ctx.save(); ctx.globalAlpha *= 0.25; ctx.fillStyle = '#000'
			ctx.beginPath(); ctx.ellipse(x, y + lift + sz * 0.38, sz * 0.36, sz * 0.12, 0, 0, TAU); ctx.fill(); ctx.restore()
		}
		ctx.drawImage(sp, x - sz / 2, y - sz / 2, sz, sz)
		ctx.restore()
	}

	// ---- input ----
	private local(e: PointerEvent): [number, number] { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (this.w / r.width), (e.clientY - r.top) * (this.hgt / r.height)] }
	private canMove(): boolean { return this.movable === 2 || this.movable === this.pos.turn }
	private pdown(e: PointerEvent): void {
		if (this.promoBox) { this.clearSelection(); return }
		try { this.canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
		const p = this.local(e)
		this.pressPos = p; this.dragPos = p; this.pressing = false; this.dragging = false
		if (!this.canMove()) { this.clearSelection(); return }
		const side = this.pos.turn
		const hd = this.handAt(p[0], p[1])
		if (hd >= 0) {
			const hs = Math.floor((hd - 1000) / 100), t = (hd - 1000) % 100
			if (hs === side) { this.pressWasSel = this.sel === 100 + t; this.select(100 + t); this.pressing = true; return }
			this.clearSelection(); return
		}
		const sq = this.sqAt(p[0], p[1])
		if (sq < 0) { this.clearSelection(); return }
		if (this.sel >= 0 && this.targets.includes(sq)) { this.tryMove(sq); return }
		const v = this.pos.board[sq]
		if (v && (v > 0) === (side === 0)) { this.pressWasSel = this.sel === sq; this.select(sq); this.pressing = true; return }
		this.clearSelection()
	}
	private pmove(e: PointerEvent): void {
		if (!this.pressing) return
		const p = this.local(e)
		this.dragPos = p
		if (!this.dragging && Math.hypot(p[0] - this.pressPos[0], p[1] - this.pressPos[1]) > DRAG_THRESHOLD) this.dragging = true
		if (this.dragging) this.redraw()
	}
	private pup(e: PointerEvent): void {
		if (!this.pressing) return
		const p = this.local(e)
		const was = this.dragging
		this.pressing = false; this.dragging = false
		if (was) {
			const sq = this.sqAt(p[0], p[1])
			if (this.targets.includes(sq)) { this.dragDrop = p; this.tryMove(sq); return }
			this.redraw()
		} else if (this.pressWasSel) this.clearSelection()
	}
	private select(sel: number): void {
		this.sel = sel
		const ms = this.legal()
		this.targets = ms.filter((m) => (sel >= 100 ? mDrop(m) === sel - 100 : mFrom(m) === sel)).map(mTo)
		this.redraw()
	}
	private tryMove(to: number): void {
		const ms = this.legal().filter((m) => mTo(m) === to && (this.sel >= 100 ? mDrop(m) === this.sel - 100 : mFrom(m) === this.sel))
		if (!ms.length) { this.clearSelection(); return }
		if (ms.length === 1) { this.sel = -1; this.targets = []; this.onUserMove(ms[0]); return }
		this.askPromotion(ms, to)
	}
	private askPromotion(ms: number[], to: number): void {
		const from = mFrom(ms[0]), v = this.pos.board[from], t = Math.abs(v)
		const [x, y] = this.sqCenter(to)
		const box = h('div', { class: 'promo' })
		const sz = this.s * 0.95
		for (const promo of [true, false]) {
			const c = h('canvas', { class: 'promochoice' })
			c.width = c.height = Math.round(sz * this.dpr)
			c.style.width = c.style.height = sz + 'px'
			const cx = c.getContext('2d')!
			cx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
			this.drawPc(cx, Math.sign(v) * (promo ? PROMOTE[t] : t), sz / 2, sz / 2, this.ts)
			c.addEventListener('pointerdown', (e) => { e.stopPropagation(); const m = ms.find((q) => mPromo(q) === promo)!; this.promoBox?.remove(); this.promoBox = null; this.sel = -1; this.targets = []; this.onUserMove(m) })
			box.append(c)
		}
		const r = this.canvas.getBoundingClientRect(), k = r.width / this.w
		box.style.left = `${(x - sz / 2) * k}px`
		box.style.top = `${Math.max(0, Math.min(this.hgt - sz * 2, y - sz / 2)) * k}px`
		this.el.append(box)
		this.promoBox = box
	}

	// ---- frame ----
	private needsFast(): boolean {
		return this.sel >= 0 || !!this.anim || this.dragging || this.particles.length > 0 || this.rings.length > 0 || this.bursts.length > 0 || this.flashes.length > 0 || this.shake > 0 || this.victims.length > 0 || this.tileHits.length > 0 || this.kicks.length > 0 || this.freeze > 0 || this.splats.length > 0 || this.zaps.length > 0 || this.slashes.length > 0 || this.dirty
	}
	private frame(now: number): void {
		this.raf = 0
		let dt = Math.min(0.05, (now - this.last) / 1000)
		this.last = now
		if (this.freeze > 0) { this.freeze -= dt; dt = 0 }
		this.time += dt
		const a = this.anim
		if (a) {
			a.t += dt / a.dur
			if (a.captured && !a.hitDone && a.t >= a.hitAt) { a.hitDone = true; this.impact(a) }
			if (a.t >= 1) { this.anim = null; this.onLanded(a) }
			else this.styleTrail(a, dt)
		}
		const ts = this.ts
		for (const s of this.splats) s.t += dt / s.life
		this.splats = this.splats.filter((s) => s.t < 1)
		for (const z of this.zaps) z.t += dt / z.life
		this.zaps = this.zaps.filter((z) => z.t < 1)
		for (const s of this.slashes) s.t += dt / s.life
		this.slashes = this.slashes.filter((s) => s.t < 1)
		for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; const k = Math.pow(p.k === 2 ? 0.25 : 0.04, dt); p.vx *= k; p.vy = (p.vy + p.g * dt) * k; p.rot += p.sp * dt; p.life -= dt }
		this.particles = this.particles.filter((p) => p.life > 0)
		for (const r of this.rings) r.t += dt / r.life
		this.rings = this.rings.filter((r) => r.t < 1)
		for (const f of this.flashes) f.t += dt / f.life
		this.flashes = this.flashes.filter((f) => f.t < 1)
		for (const v of this.victims) { v.t += dt / v.life; v.x += v.vx * dt; v.y += v.vy * dt; v.vz -= ts * 17 * dt; v.z = Math.max(0, v.z + v.vz * dt); v.rot += v.vr * dt; if (v.z === 0 && v.vz < 0) v.vz *= -0.3 }
		this.victims = this.victims.filter((v) => v.t < 1)
		for (const q of this.tileHits) q.t += dt / q.life
		this.tileHits = this.tileHits.filter((q) => q.t < 1)
		for (const q of this.kicks) q.t += dt / q.life
		this.kicks = this.kicks.filter((q) => q.t < 1)
		if (a && !a.captured && a.style === 0 && this.trailT <= 0 && this.effects !== 'off') {
			const tp = this.sqCenter(a.to), e = 1 - Math.pow(1 - Math.min(1, a.t), 2)
			this.particle([a.fromPx[0] + (tp[0] - a.fromPx[0]) * e, a.fromPx[1] + (tp[1] - a.fromPx[1]) * e - Math.sin(a.t * Math.PI) * ts * 0.35], this.fxColor(a.code), ts * 0.15, 0.3, ts * 0.15, 0)
			this.trailT = 0.03
		}
		this.trailT -= dt
		for (const b of this.bursts) b.t += dt / b.life
		this.bursts = this.bursts.filter((b) => b.t < 1)
		this.shake = Math.max(0, this.shake - dt * this.hgt * 0.6)
		this.render()
		if (this.needsFast() && !this.raf) this.raf = requestAnimationFrame((t) => this.frame(t))
	}

	private render(): void {
		this.dirty = false
		const ctx = this.ctx
		if (!this.w) return
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
		ctx.clearRect(0, 0, this.w, this.hgt)
		this.off = this.shake > 0 ? [rr(-1, 1) * this.shake, rr(-1, 1) * this.shake] : [0, 0]
		const s = this.s, ts = this.ts, bx = this.bx + this.off[0], by = this.by + this.off[1]
		const bd = BOARDS.find((b) => b.id === settings.board) ?? BOARDS[0]
		// the board
		ctx.save()
		ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = s * 0.5; ctx.shadowOffsetY = s * 0.12
		const gr = ctx.createLinearGradient(bx, by, bx + 9 * s, by + 9 * s)
		gr.addColorStop(0, bd.a); gr.addColorStop(1, bd.b)
		ctx.fillStyle = gr
		ctx.fillRect(bx - s * 0.08, by - s * 0.08, 9 * s + s * 0.16, 9 * s + s * 0.16)
		ctx.restore()
		// hand trays
		for (const side of [0, 1]) {
			const y = this.handY[side] + this.off[1]
			ctx.fillStyle = 'rgba(255,255,255,0.05)'
			ctx.beginPath(); ctx.roundRect(bx, y - s * 0.55, 9 * s, s * 1.1, s * 0.18); ctx.fill()
			if (this.pos.turn === side && !this.anim) { ctx.strokeStyle = 'rgba(255,207,115,0.35)'; ctx.lineWidth = 1.5; ctx.stroke() }
		}
		// highlights under the grid
		const fill = (sq: number, col: string) => { const [x, y] = this.sqCenter(sq); ctx.fillStyle = col; ctx.fillRect(x - s / 2, y - s / 2, s, s) }
		if (this.lastMove) { if (mFrom(this.lastMove) >= 0) fill(mFrom(this.lastMove), 'rgba(155,199,0,0.32)'); fill(mTo(this.lastMove), 'rgba(155,199,0,0.42)') }
		for (const mk of this.marks) fill(mk.sq, mk.color)
		for (const q of this.tileHits) { const e = Math.pow(1 - q.t, 2); fill(q.sq, rgba(q.col, 0.5 * e)) }
		if (this.sel >= 0 && this.sel < 81) fill(this.sel, 'rgba(20,85,30,0.5)')
		for (const sp of this.splats) {
			const al = sp.t < 0.6 ? 1 : 1 - (sp.t - 0.6) / 0.4, grow = Math.min(1, sp.t / 0.06)
			ctx.save(); ctx.globalAlpha = 0.85 * al; ctx.fillStyle = sp.col
			for (const b of sp.blobs) { ctx.beginPath(); ctx.ellipse(sp.x + b[0] * grow, sp.y + b[1] * grow, b[2] * grow, b[2] * 0.6 * grow, 0, 0, TAU); ctx.fill() }
			ctx.restore()
		}
		// the grid
		ctx.strokeStyle = bd.line; ctx.lineWidth = Math.max(1, s * 0.022)
		ctx.beginPath()
		for (let i = 0; i <= 9; i++) { ctx.moveTo(bx + i * s, by); ctx.lineTo(bx + i * s, by + 9 * s); ctx.moveTo(bx, by + i * s); ctx.lineTo(bx + 9 * s, by + i * s) }
		ctx.stroke()
		ctx.fillStyle = bd.line
		for (const [px, py] of [[3, 3], [6, 3], [3, 6], [6, 6]]) { ctx.beginPath(); ctx.arc(bx + px * s, by + py * s, s * 0.06, 0, TAU); ctx.fill() }
		// coordinates
		if (this.coords) {
			ctx.fillStyle = 'rgba(230,220,200,0.6)'; ctx.font = `${Math.round(s * 0.26)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
			for (let c = 0; c < 9; c++) ctx.fillText(String(this.orientation ? c + 1 : 9 - c), bx + (c + 0.5) * s, by - s * 0.25)
			for (let r = 0; r < 9; r++) ctx.fillText('abcdefghi'[this.orientation ? 8 - r : r], bx + 9 * s + s * 0.24, by + (r + 0.5) * s)
		}
		// check
		const pos = this.pos
		if (!this.anim && pos.inCheck()) {
			const k = pos.king(pos.turn)
			if (k >= 0) { const [x, y] = this.sqCenter(k); const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.7); g.addColorStop(0, 'rgba(255,0,0,0.9)'); g.addColorStop(0.5, 'rgba(231,0,0,0.5)'); g.addColorStop(1, 'rgba(169,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - s / 2, y - s / 2, s, s) }
		}
		// pieces that stand
		const a = this.anim
		for (let sq = 0; sq < 81; sq++) {
			const v = pos.board[sq]
			if (!v) continue
			if (a && sq === a.to) continue
			if (this.dragging && sq === this.sel) continue
			const [x, y] = this.sqCenter(sq)
			const kk = this.kicks.length ? this.kicks.find((q) => q.sq === sq) : undefined
			if (kk) {
				const u = kk.t, e = Math.exp(-4.5 * u) * Math.cos(u * 15) * kk.amp
				const fy = y + s * 0.42
				ctx.save(); ctx.translate(x, fy); ctx.scale(1 + e * 0.7, 1 - e); ctx.translate(-x, -fy)
				this.drawPc(ctx, v, x, y, ts); ctx.restore()
			} else this.drawPc(ctx, v, x, y, ts)
		}
		// hands
		for (const side of [0, 1]) for (const sl of this.handSlots(side)) {
			const sgn = side === 0 ? 1 : -1
			const isSel = this.sel === 100 + sl.t && pos.turn === side
			if (isSel) { ctx.fillStyle = 'rgba(20,85,30,0.55)'; ctx.beginPath(); ctx.roundRect(sl.x - s * 0.5, sl.y - s * 0.52, s, s * 1.04, s * 0.12); ctx.fill() }
			const n = sl.n
			if (!(this.dragging && isSel && n === 1)) this.drawPc(ctx, sgn * sl.t, sl.x, sl.y, ts * 0.9)
			if (n > 1) {
				const bx2 = sl.x + s * 0.34, by2 = sl.y + s * 0.34
				ctx.fillStyle = '#d64f00'; ctx.beginPath(); ctx.arc(bx2, by2, s * 0.17, 0, TAU); ctx.fill()
				ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.24)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
				ctx.fillText(String(n), bx2, by2 + 1)
			}
		}
		// targets
		for (const t of this.targets) {
			const [x, y] = this.sqCenter(t)
			if (pos.board[t]) { ctx.strokeStyle = 'rgba(20,85,30,0.6)'; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.arc(x, y, s * 0.46, 0, TAU); ctx.stroke() }
			else { ctx.fillStyle = 'rgba(20,85,30,0.5)'; ctx.beginPath(); ctx.arc(x, y, s * 0.15, 0, TAU); ctx.fill() }
		}
		this.paintFx(ctx)
		this.paintVictims(ctx)
		this.paintArrows(ctx)
		if (this.dragging && this.sel >= 0) {
			const code = this.sel >= 100 ? (pos.turn === 0 ? 1 : -1) * (this.sel - 100) : pos.board[this.sel]
			const hv = this.sqAt(this.dragPos[0], this.dragPos[1])
			if (this.targets.includes(hv)) { const [x, y] = this.sqCenter(hv); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(x - s / 2 + 1, y - s / 2 + 1, s - 2, s - 2) }
			this.drawPc(ctx, code, this.dragPos[0], this.dragPos[1] - s * 0.3, ts * 1.15, 1, s * 0.3)
		}
		this.renderFx()
	}

	private paintArrows(ctx: CanvasRenderingContext2D): void {
		const s = this.s
		for (const ar of this.arrows) {
			const to = mTo(ar.m), d = mDrop(ar.m)
			let fp: [number, number]
			if (d) { const side = ar.side ?? this.pos.turn; const sl = this.handSlots(side).find((x) => x.t === d); fp = sl ? [sl.x, sl.y] : this.sqCenter(to) }
			else fp = this.sqCenter(mFrom(ar.m))
			const tp = this.sqCenter(to)
			let dx = tp[0] - fp[0], dy = tp[1] - fp[1]
			const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l
			const w = s * 0.16, head = s * 0.42
			const neck: [number, number] = [tp[0] - dx * head, tp[1] - dy * head]
			ctx.save(); ctx.globalAlpha = 0.75
			ctx.strokeStyle = ar.color; ctx.lineWidth = w; ctx.lineCap = 'round'
			ctx.beginPath(); ctx.moveTo(fp[0] + dx * s * 0.2, fp[1] + dy * s * 0.2); ctx.lineTo(neck[0], neck[1]); ctx.stroke()
			ctx.fillStyle = ar.color; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(neck[0] - dy * head * 0.55, neck[1] + dx * head * 0.55); ctx.lineTo(neck[0] + dy * head * 0.55, neck[1] - dx * head * 0.55); ctx.closePath(); ctx.fill()
			ctx.restore()
		}
	}

	// ---- effects (ported from Hex Chaos) ----
	private jagged(a: [number, number], b: [number, number], jag: number): [number, number][] {
		const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d
		const n = Math.max(4, Math.round(d / (jag * 1.4)))
		const out: [number, number][] = [a]
		for (let i = 1; i < n; i++) { const k = i / n, o = rr(-1, 1) * jag; out.push([a[0] + (b[0] - a[0]) * k + nx * o, a[1] + (b[1] - a[1]) * k + ny * o]) }
		out.push(b)
		return out
	}
	private onLanded(a: Anim): void {
		const ts = this.ts, p = this.sqCenter(a.to)
		const big = a.style === HIT.PANCAKE || a.style === HIT.METEOR
		if (this.effects !== 'off') this.kicks.push({ sq: a.to, t: 0, life: big ? 0.5 : 0.34, amp: a.captured ? (big ? 0.38 : 0.2) : 0.08 })
		if (!a.captured) {
			if (this.effects !== 'off') {
				this.rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col: '#ffffff', max: ts * 1.1, life: 0.4, flat: true })
				for (let i = 0; i < 5; i++) this.particle(p, '#ffffff', ts * 0.5, 0.45, ts * 0.06, 0)
			}
		} else if (!a.hitDone) { a.hitDone = true; this.impact(a) }
	}
	private impact(a: Anim): void {
		const ts = this.ts, p = this.sqCenter(a.to)
		const col = this.fxColor(a.captured)
		const fp = a.fromPx
		let dx = p[0] - fp[0], dy = p[1] - fp[1]
		const l = Math.hypot(dx, dy)
		if (l > 1) { dx /= l; dy /= l } else { dx = 0; dy = -1 }
		const V = (o: Partial<Victim>): void => { this.victims.push({ code: a.captured, x: p[0], y: p[1], z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vr: 0, t: 0, life: 0.6, ...o }) }
		const ground = (c: string, max: number, life: number) => this.rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col: c, max, life, flat: true })
		if (this.effects === 'off') { V({ mode: 'fade', life: 0.2 }); return }
		if (this.effects === 'simple') {
			V({ mode: 'fade', life: 0.3 })
			ground(col, ts * 1.6, 0.45)
			for (let i = 0; i < 6; i++) this.particle(p, col, ts * 2, 0.4, ts * 0.07, 1)
			return
		}
		const snd: Record<number, [string, number, number][]> = {
			[HIT.POOF]: [['poof', 0.7, 1]], [HIT.FLICK]: [['flick', 0.6, 1], ['move', 0.3, 1.4]], [HIT.SINK]: [['sink', 0.7, 1]], [HIT.SPLAT]: [['splat', 0.8, 1]],
			[HIT.SLASH]: [['slash', 0.8, 1]], [HIT.PANCAKE]: [['squash', 0.9, 1], ['capture', 0.4, 0.7]], [HIT.ZAP]: [['zap', 0.6, 1.3], ['poof', 0.4, 1.4]], [HIT.PIXEL]: [['pixel', 0.6, 1]],
			[HIT.VORTEX]: [['vortex', 0.75, 1]], [HIT.METEOR]: [['boom', 0.8, 1.15], ['capture', 0.6, 0.6]], [HIT.TRAIN]: [['capture', 0.8, 0.6], ['boom', 0.6, 1.6]],
			[HIT.BALLOON]: [['poof', 0.35, 1.7], ['swish', 0.45, 0.8], ['bell', 0.25, 1.5]], [HIT.FROST]: [['flick', 0.5, 1.9], ['sparkle', 0.55, 0.8]],
			[HIT.CONFETTI]: [['poof', 0.5, 1.4], ['toot', 0.45, 1.6], ['sparkle', 0.6, 1.2]], [HIT.ABDUCT]: [['laser', 0.35, 0.65], ['bell', 0.3, 0.5]],
		}
		if (!this.quietSounds) for (const [n, v, r] of snd[a.style] ?? []) playSound(n, v, r)
		switch (a.style) {
			case HIT.POOF:
				V({ mode: 'fade', life: 0.35 })
				for (let i = 0; i < 10; i++) this.particle(p, i % 2 ? '#c9ccd6' : '#ffffff', ts * 1.2, 0.6, ts * 0.13, 0)
				ground('#ffffff', ts * 1.2, 0.4)
				return
			case HIT.FLICK: {
				const sd = Math.random() < 0.5 ? -1 : 1
				V({ vx: dx * ts * 2.4, vy: dy * ts * 2.4, vz: ts * 3, vr: sd * 6, life: 0.5 })
				for (let i = 0; i < 4; i++) this.particle(p, '#ffffff', ts * 1.5, 0.35, ts * 0.06, 1)
				return
			}
			case HIT.SINK:
				V({ mode: 'sink', life: 0.7 })
				ground(col, ts * 1.3, 0.7)
				for (let i = 0; i < 6; i++) this.particle([p[0], p[1] + ts * 0.25], '#8a7a6a', ts * 0.9, 0.5, ts * 0.08, 2, ts * 4)
				return
			case HIT.SPLAT: {
				V({ mode: 'fade', life: 0.18 })
				const blobs: [number, number, number][] = [[0, 0, ts * 0.62]]
				for (let i = 0; i < 9; i++) { const an = rr(0, TAU), d = ts * rr(0.45, 1.1); blobs.push([Math.cos(an) * d, Math.sin(an) * d * 0.6, ts * rr(0.1, 0.3)]) }
				this.splats.push({ x: p[0], y: p[1] + ts * 0.1, t: 0, life: 1.6, col, blobs })
				for (let i = 0; i < 16; i++) this.particle(p, col, ts * 4, 0.6, ts * 0.11, 2, ts * 9)
				this.freeze = 0.05; this.shake = ts * 0.08; this.punch(0.02)
				return
			}
			case HIT.SLASH: {
				const ang = Math.atan2(dy, dx) + Math.PI / 2 + rr(-0.35, 0.35)
				this.slashes.push({ x: p[0], y: p[1] - ts * 0.1, ang, len: ts * 2.6, t: 0, life: 0.32 })
				V({ mode: 'split', life: 0.75, ang })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.18, r: ts * 0.9, col: '#ffffff' })
				for (let i = 0; i < 8; i++) this.particle(p, '#ffffff', ts * 3.5, 0.3, ts * 0.06, 1)
				this.freeze = 0.07; this.shake = ts * 0.1
				return
			}
			case HIT.PANCAKE:
				V({ mode: 'squash', life: 0.95 })
				ground('#ffffff', ts * 2, 0.5); ground(col, ts * 2.6, 0.7)
				for (let i = 0; i < 14; i++) this.particle([p[0], p[1] + ts * 0.25], '#d8c7a8', ts * 2.4, 0.6, ts * 0.12, 0)
				this.freeze = 0.08; this.shake = ts * 0.22; this.punch(0.035)
				return
			case HIT.ZAP:
				V({ mode: 'ash', life: 0.85 })
				for (let k = 0; k < 4; k++) { const an = rr(0, TAU), d = ts * rr(1, 1.8); this.zaps.push({ pts: this.jagged(p, [p[0] + Math.cos(an) * d, p[1] + Math.sin(an) * d], ts * 0.25), t: 0, life: 0.35, col: '#9fe6ff', w: ts * 0.09 }) }
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.35, r: ts * 1.8, col: '#9fe6ff' })
				for (let i = 0; i < 16; i++) this.particle(p, i % 2 ? '#9fe6ff' : '#ffffff', ts * 3.6, 0.45, ts * 0.07, 1)
				for (let i = 0; i < 14; i++) this.particle(p, '#2a2a33', ts * 0.8, 1.1, ts * 0.09, 2, -ts * 2.5)
				this.freeze = 0.06; this.shake = ts * 0.14
				return
			case HIT.PIXEL:
				V({ mode: 'fade', life: 0.2 })
				for (let i = 0; i < 30; i++) {
					const q: [number, number] = [p[0] + rr(-0.45, 0.45) * ts, p[1] + rr(-0.55, 0.35) * ts]
					this.particles.push({ x: q[0], y: q[1], vx: rr(-1, 1) * ts * 1.6, vy: rr(-2.6, -0.6) * ts, life: rr(0.7, 1.2), max: 1.2, col: i % 4 === 0 ? '#ffffff' : col, s: ts * rr(0.07, 0.12), k: 2, g: -ts * 0.5, rot: 0, sp: 0 })
				}
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.2, r: ts * 0.9, col })
				return
			case HIT.VORTEX:
				V({ mode: 'spiral', life: 0.9, x0: p[0], y0: p[1] })
				for (let i = 0; i < 22; i++) {
					const an = rr(0, TAU), d = ts * rr(0.8, 1.6), q: [number, number] = [p[0] + Math.cos(an) * d, p[1] + Math.sin(an) * d * 0.7]
					this.particles.push({ x: q[0], y: q[1], vx: -Math.sin(an) * ts * 3 - Math.cos(an) * ts * 1.6, vy: Math.cos(an) * ts * 2.1 - Math.sin(an) * ts * 1.1, life: rr(0.5, 0.9), max: 0.9, col: i % 3 ? '#b47cff' : '#ffffff', s: ts * 0.08, k: 0, g: 0, rot: 0, sp: 0 })
				}
				this.rings.push({ x: p[0], y: p[1], t: 0, col: '#b47cff', max: ts * 1.6, life: 0.7 })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.6, r: ts * 1.2, col: '#3a1466' })
				return
			case HIT.METEOR: {
				V({ vx: dx * ts * 2 + rr(-1, 1) * ts * 2, vy: -ts * 1.5, vz: ts * 10, vr: rr(-14, 14), life: 0.9 })
				const blobs: [number, number, number][] = [[0, 0, ts * 0.85]]
				for (let i = 0; i < 7; i++) { const an = rr(0, TAU), d = ts * rr(0.6, 1); blobs.push([Math.cos(an) * d, Math.sin(an) * d * 0.55, ts * rr(0.15, 0.3)]) }
				this.splats.push({ x: p[0], y: p[1] + ts * 0.15, t: 0, life: 2.2, col: '#2b1d16', blobs })
				ground('#ffb347', ts * 3.4, 0.7); ground('#ffffff', ts * 2, 0.45)
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.45, r: ts * 2.6, col: '#ffb347' })
				for (let i = 0; i < 26; i++) this.particle(p, i % 3 ? '#ff8a2a' : '#ffe08a', ts * 6, 0.7, ts * 0.11, 1)
				for (let i = 0; i < 18; i++) this.particle(p, '#5a4638', ts * 4, 1.1, ts * 0.13, 2, ts * 9)
				this.freeze = 0.12; this.shake = ts * 0.45; this.punch(0.06)
				return
			}
			case HIT.TRAIN:
				V({ vx: a.dir * ts * 13, vy: -ts * 0.8, vz: ts * 7, vr: a.dir * rr(14, 20), life: 0.85 })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.3, r: ts * 1.6, col: '#ffffff' })
				for (let i = 0; i < 18; i++) this.particle(p, i % 2 ? '#ffd27a' : col, ts * 5, 0.6, ts * 0.1, 1)
				for (let i = 0; i < 10; i++) this.particle(p, '#6a6a72', ts * 3, 0.9, ts * 0.12, 2, ts * 8)
				this.freeze = 0.09; this.shake = ts * 0.35; this.punch(0.05)
				return
			case HIT.BALLOON:
				V({ mode: 'float', life: 1.4 })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.2, r: ts * 0.8, col: '#ffffff' })
				for (let i = 0; i < 6; i++) this.particle(p, '#ffffff', ts * 1.2, 0.4, ts * 0.07, 0)
				return
			case HIT.FROST:
				V({ mode: 'frozen', life: 0.8 })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.35, r: ts * 1.4, col: '#bfe6ff' })
				ground('#bfe6ff', ts * 1.6, 0.6)
				for (let i = 0; i < 8; i++) this.particle(p, '#e8f6ff', ts * 0.9, 0.6, ts * 0.06, 0)
				this.freeze = 0.05
				setTimeout(() => {
					if (!this.el.isConnected) return
					for (let i = 0; i < 20; i++) this.particle(p, i % 2 ? '#e8f6ff' : '#8fd0ff', ts * 3.4, 0.8, ts * 0.11, 2, ts * 7)
					for (let i = 0; i < 8; i++) this.particle(p, '#ffffff', ts * 3, 0.3, ts * 0.05, 1)
					this.shake = ts * 0.1
					if (!this.quietSounds) { playSound('flick', 0.55, 2.4); playSound('sparkle', 0.4, 1.3) }
				}, 330)
				return
			case HIT.CONFETTI: {
				V({ mode: 'fade', life: 0.22 })
				const cols = ['#ff4f7b', '#ffd24a', '#5aa8ff', '#6fdc8c', '#b46cff', '#ff9a3c']
				for (let i = 0; i < 44; i++) this.particles.push({ x: p[0], y: p[1] - ts * 0.2, vx: rr(-1, 1) * ts * 3.6, vy: rr(-5.2, -1.6) * ts, life: rr(0.9, 1.5), max: 1.5, col: cols[i % cols.length], s: ts * rr(0.06, 0.11), k: 2, g: ts * 7, rot: rr(0, TAU), sp: rr(-14, 14) })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.25, r: ts * 1.2, col: '#fff3c4' })
				ground('#ffffff', ts * 1.5, 0.4)
				this.punch(0.025)
				return
			}
			case HIT.ABDUCT:
				V({ mode: 'abduct', life: 1.3 })
				this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.5, r: ts * 1.3, col: '#a6ffb0' })
				for (let i = 0; i < 16; i++) this.particles.push({ x: p[0] + rr(-0.5, 0.5) * ts, y: p[1] + rr(-0.2, 0.4) * ts, vx: rr(-0.2, 0.2) * ts, vy: -rr(1.5, 3.5) * ts, life: rr(0.7, 1.2), max: 1.2, col: i % 3 ? '#c8ffd0' : '#ffffff', s: ts * rr(0.05, 0.09), k: 0, g: 0, rot: 0, sp: 0 })
				ground('#a6ffb0', ts * 1.4, 0.8)
				return
		}
		// Classic: the taken piece is knocked away, a shockwave, sparks and a burst that fits the kind of the taking piece
		const tcol = this.fxColor(a.code)
		const side = Math.random() < 0.5 ? -1 : 1
		this.victims.push({ code: a.captured, x: p[0], y: p[1], z: 0, vx: dx * ts * 3.6 - dy * ts * 0.6 * side, vy: dy * ts * 3.6 + dx * ts * 0.6 * side, vz: ts * 5.2, rot: 0, vr: side * rr(7, 11), t: 0, life: 0.62 })
		this.tileHits.push({ sq: a.to, t: 0, life: 0.45, col })
		this.freeze = 0.075
		this.rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col, max: ts * 2.3, life: 0.6, flat: true })
		this.rings.push({ x: p[0], y: p[1] + ts * 0.3, t: 0, col: '#ffffff', max: ts * 1.4, life: 0.4, flat: true })
		this.flashes.push({ x: p[0], y: p[1] - ts * 0.1, t: 0, life: 0.22, r: ts * 1.1, col: '#ffffff' })
		for (let i = 0; i < 12; i++) this.particle(p, i % 3 ? col : '#ffffff', ts * 4.4, 0.5, ts * 0.09, 1)
		for (let i = 0; i < 14; i++) this.particle(p, col, ts * 3.0, 0.9, ts * 0.085, 2, ts * 8)
		this.punch(0.032)
		const kind = kindFor(base(Math.abs(a.code)))
		this.bursts.push({ kind, x: p[0], y: p[1], dx, dy, t: 0, life: lifeOf(kind), col: tcol, seed: Math.floor(Math.random() * 1e9) })
		this.shake = Math.max(ts * 0.16, ts * shakeOf(kind))
	}
	private particle(p: [number, number], col: string, speed: number, life: number, size: number, k = 0, g = 0): void {
		const a = Math.random() * TAU, sp = speed * rr(0.35, 1)
		this.particles.push({ x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * rr(0.7, 1), max: life, col, s: size * rr(0.6, 1.1), k, g, rot: Math.random() * TAU, sp: rr(-10, 10) })
		this.redraw()
	}
	spark(sq: number, col: string): void {
		const ts = this.ts, p = this.sqCenter(sq)
		this.rings.push({ x: p[0], y: p[1], t: 0, col, max: ts * 1.4, life: 0.5 })
		this.flashes.push({ x: p[0], y: p[1], t: 0, life: 0.45, r: ts * 1.2, col })
		for (let i = 0; i < 9; i++) this.particle(p, col, ts, 0.6, ts * 0.09, i % 3 === 0 ? 1 : 0)
		this.redraw()
	}
	punch(amount: number): void {
		this.el.style.transition = 'transform .07s ease-out'
		this.el.style.transform = `scale(${1 + amount})`
		setTimeout(() => { this.el.style.transition = 'transform .38s cubic-bezier(.2,.8,.3,1)'; this.el.style.transform = '' }, 70)
	}
	clearEffects(): void {
		this.anim = null
		this.particles = []; this.rings = []; this.bursts = []; this.flashes = []; this.victims = []; this.tileHits = []; this.kicks = []
		this.splats = []; this.zaps = []; this.slashes = []; this.freeze = 0; this.shake = 0
		this.redraw()
	}

	private paintFx(ctx: CanvasRenderingContext2D): void {
		const a = this.anim
		if (!a) return
		const ts = this.ts, tp = this.sqCenter(a.to)
		if (a.captured && !a.hitDone) this.drawPc(ctx, a.captured, tp[0], tp[1], ts)
		this.paintMover(ctx, a, a.fromPx, tp, ts)
		if (a.style === HIT.TRAIN) this.paintTrain(ctx, a, tp, ts)
	}
	private paintMover(ctx: CanvasRenderingContext2D, a: Anim, fp: [number, number], tp: [number, number], ts: number): void {
		const u = a.t, pc = a.code
		const lerp2 = (k: number): [number, number] => [fp[0] + (tp[0] - fp[0]) * k, fp[1] + (tp[1] - fp[1]) * k]
		switch (a.style) {
			case HIT.SLASH: {
				const e = 1 - Math.pow(1 - u, 3)
				for (const back of [0.3, 0.18]) { const q = lerp2(Math.max(0, e - back)); this.drawPc(ctx, pc, q[0], q[1], ts, 0.25) }
				const q = lerp2(e); this.drawPc(ctx, pc, q[0], q[1], ts)
				return
			}
			case HIT.PANCAKE: {
				const lift = Math.sin(Math.min(1, u) * Math.PI) * ts * 1.7 * (u < 0.5 ? 1 : 1 - Math.pow((u - 0.5) * 2, 3) * 0.2)
				const q = lerp2(u < 0.5 ? u * 1.1 : Math.min(1, 0.55 + (u - 0.5) * 0.9))
				const sq = u > 0.85 ? 1 - (u - 0.85) * 1.2 : 1
				ctx.save(); ctx.translate(q[0], q[1] - lift); ctx.scale(1 / Math.max(0.6, sq), sq); this.drawPc(ctx, pc, 0, 0, ts * 1.08, 1, lift); ctx.restore()
				return
			}
			case HIT.ZAP: {
				if (u < 0.42) { const k = u / 0.42; ctx.save(); ctx.translate(fp[0], fp[1]); ctx.scale(1 - 0.5 * k, 1 + 0.6 * k); this.drawPc(ctx, pc, 0, 0, ts, 1 - k); ctx.restore() }
				else if (u > 0.58) { const k = (u - 0.58) / 0.42; ctx.save(); ctx.translate(tp[0], tp[1]); ctx.scale(1.5 - 0.5 * k, 0.4 + 0.6 * k); this.drawPc(ctx, pc, 0, 0, ts, k); ctx.restore() }
				return
			}
			case HIT.METEOR: {
				if (u < 0.3) { const k = u / 0.3; this.drawPc(ctx, pc, fp[0], fp[1] - k * k * (fp[1] + ts * 3), ts, 1 - k * 0.3, k * ts * 2) }
				else if (u > 0.42) {
					const k = (u - 0.42) / 0.58, y = -ts * 3 + (tp[1] + ts * 3) * k * k
					ctx.save(); ctx.globalAlpha = 0.25 + 0.35 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(tp[0], tp[1] + ts * 0.5, ts * 0.6 * k, ts * 0.22 * k, 0, 0, TAU); ctx.fill(); ctx.restore()
					this.drawPc(ctx, pc, tp[0], y, ts * 1.1, 1, 0)
				}
				return
			}
			case HIT.TRAIN: {
				if (u < TRAIN_PART) { this.drawPc(ctx, pc, fp[0], fp[1], ts); return }
				const k = (u - TRAIN_PART) / (1 - TRAIN_PART), e = 1 - Math.pow(1 - k, 2), lift = Math.sin(k * Math.PI) * ts * 0.35, q = lerp2(e)
				this.drawPc(ctx, pc, q[0], q[1] - lift, ts, 1, lift)
				return
			}
		}
		const t = 1 - Math.pow(1 - u, 2)
		const lift = this.effects === 'off' ? 0 : Math.sin(u * Math.PI) * ts * 0.35
		const q = lerp2(t)
		this.drawPc(ctx, pc, q[0], q[1] - lift, ts * (1 + lift / ts * 0.15), 1, lift)
	}
	private styleTrail(a: Anim, dt: number): void {
		const ts = this.ts
		if (a.style === HIT.METEOR && a.t > 0.42) {
			const tp = this.sqCenter(a.to), k = (a.t - 0.42) / 0.58, y = -ts * 3 + (tp[1] + ts * 3) * k * k
			for (let i = 0; i < 3; i++) this.particles.push({ x: tp[0] + rr(-0.3, 0.3) * ts, y: y - ts * 0.3, vx: rr(-0.5, 0.5) * ts, vy: -ts * rr(1, 3), life: rr(0.25, 0.45), max: 0.45, col: i ? '#ff8a2a' : '#ffe08a', s: ts * rr(0.12, 0.22), k: 0, g: 0, rot: 0, sp: 0 })
		}
		if (a.style === HIT.TRAIN && a.t < TRAIN_PART) {
			this.trailT -= dt
			if (this.trailT <= 0) {
				const tp = this.sqCenter(a.to), x = this.trainHead(a, ts) - a.dir * ts * 1.5
				this.particles.push({ x, y: tp[1] - ts * 1.25, vx: -a.dir * ts * 1.5, vy: -ts * 1.2, life: 0.9, max: 0.9, col: '#c9ccd6', s: ts * 0.22, k: 0, g: 0, rot: 0, sp: 0 })
				this.trailT = 0.035
			}
		}
	}
	private trainHead(a: Anim, ts: number): number {
		const sx = a.dir > 0 ? -ts * 3 : this.w + ts * 3, ex = a.dir > 0 ? this.w + ts * 9 : -ts * 9
		return sx + (ex - sx) * Math.min(1, a.t / TRAIN_PART)
	}
	private paintTrain(ctx: CanvasRenderingContext2D, a: Anim, tp: [number, number], ts: number): void {
		if (a.t >= TRAIN_PART) return
		const hx = this.trainHead(a, ts), d = a.dir, y = tp[1] - ts * 0.15, hgt = ts * 1.05, team = this.fxColor(a.code)
		const box = (x0: number, len: number, body: string) => {
			const x = d > 0 ? x0 - len : x0
			ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + len / 2, y + hgt * 0.62, len * 0.55, ts * 0.18, 0, 0, TAU); ctx.fill()
			ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(x, y - hgt * 0.5, len, hgt * 0.9, ts * 0.14); ctx.fill()
			ctx.fillStyle = team; ctx.fillRect(x + ts * 0.08, y + hgt * 0.05, len - ts * 0.16, hgt * 0.14)
			ctx.fillStyle = '#1b1e27'; for (const wx of [0.22, 0.78]) { ctx.beginPath(); ctx.arc(x + len * wx, y + hgt * 0.42, ts * 0.17, 0, TAU); ctx.fill() }
			ctx.fillStyle = '#9aa3b5'; for (const wx of [0.22, 0.78]) { ctx.beginPath(); ctx.arc(x + len * wx, y + hgt * 0.42, ts * 0.07, 0, TAU); ctx.fill() }
			return x
		}
		const gap = ts * 0.18
		let x0 = hx
		const lx = box(x0, ts * 2.3, '#3b4152')
		const front = d > 0 ? lx + ts * 2.3 : lx
		ctx.fillStyle = '#2b303d'; ctx.fillRect(d > 0 ? lx : lx + ts * 1.4, y - hgt * 0.95, ts * 0.9, hgt * 0.5)
		ctx.fillStyle = '#bfe6ff'; ctx.fillRect(d > 0 ? lx + ts * 0.15 : lx + ts * 1.55, y - hgt * 0.85, ts * 0.55, hgt * 0.3)
		ctx.fillStyle = '#2b303d'; ctx.fillRect(d > 0 ? lx + ts * 1.6 : lx + ts * 0.45, y - hgt * 0.85, ts * 0.28, hgt * 0.38)
		ctx.fillStyle = '#c94a3a'; ctx.beginPath(); ctx.moveTo(front, y + hgt * 0.38); ctx.lineTo(front + d * ts * 0.45, y + hgt * 0.38); ctx.lineTo(front, y - hgt * 0.05); ctx.fill()
		ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.drawImage(glowSprite('#ffe08a'), front - ts * 0.6, y - hgt * 0.5, ts * 1.2, ts * 1.2); ctx.restore()
		x0 = hx - d * (ts * 2.3 + gap); box(x0, ts * 1.9, '#4a5166')
		x0 -= d * (ts * 1.9 + gap); box(x0, ts * 1.9, '#4a5166')
	}
	private tinted(ctx: CanvasRenderingContext2D, code: number, x: number, y: number, ts: number, tint: string, alpha: number): void {
		// the piece with a colour laid over it (ash, ice)
		const sz = (ts / 0.58) * 0.94
		const tmp = document.createElement('canvas'); tmp.width = tmp.height = Math.ceil(sz * this.dpr)
		const c = tmp.getContext('2d')!
		c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
		this.drawPc(c, code, sz / 2, sz / 2, ts)
		c.setTransform(1, 0, 0, 1, 0, 0)
		c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.65; c.fillStyle = tint; c.fillRect(0, 0, tmp.width, tmp.height)
		ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(tmp, x - sz / 2, y - sz / 2, sz, sz); ctx.restore()
	}
	private paintVictims(ctx: CanvasRenderingContext2D): void {
		const ts = this.ts
		for (const v of this.victims) {
			const k = v.t
			if (v.mode && v.mode !== 'fly') { this.paintVictimMode(ctx, v, ts); continue }
			const al = Math.min(1, (1 - k) * 2.6)
			if (al <= 0) continue
			ctx.save()
			ctx.globalAlpha = al * 0.35; ctx.fillStyle = '#000'
			ctx.beginPath(); ctx.ellipse(v.x, v.y + ts * 0.45, ts * 0.42 * (1 - Math.min(0.6, v.z / (ts * 3))), ts * 0.17, 0, 0, TAU); ctx.fill()
			ctx.globalAlpha = 1
			ctx.translate(v.x, v.y - v.z); ctx.rotate(v.rot)
			const sc = 1 - 0.3 * k
			ctx.scale(sc, sc)
			this.drawPc(ctx, v.code, 0, 0, ts, al)
			ctx.restore()
		}
	}
	private paintVictimMode(ctx: CanvasRenderingContext2D, v: Victim, ts: number): void {
		const k = Math.min(1, v.t), pc = v.code
		ctx.save()
		switch (v.mode) {
			case 'fade': ctx.translate(v.x, v.y); ctx.scale(1 + 0.3 * k, 1 + 0.3 * k); this.drawPc(ctx, pc, 0, 0, ts, 1 - k); break
			case 'sink': {
				const by = v.y + ts * 0.8
				ctx.beginPath(); ctx.rect(v.x - ts * 1.5, by - ts * 3, ts * 3, ts * 3); ctx.clip()
				ctx.translate(v.x, v.y + ts * 1.6 * k * k); this.drawPc(ctx, pc, 0, 0, ts, 1 - k * k)
				break
			}
			case 'squash': {
				const s = Math.min(1, k / 0.12), by = v.y + ts * 0.7
				ctx.translate(v.x, by); ctx.scale(1 + 0.55 * s, 1 - 0.86 * s); ctx.translate(0, -ts * 0.7)
				this.drawPc(ctx, pc, 0, 0, ts, k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4)
				break
			}
			case 'split': {
				const ang = v.ang ?? 0, nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2)
				for (const sd of [-1, 1]) {
					ctx.save()
					ctx.translate(v.x + nx * sd * k * ts * 0.7, v.y + ny * sd * k * ts * 0.7 + k * k * ts * 0.9)
					ctx.rotate(sd * k * 0.7)
					ctx.save(); ctx.rotate(ang); ctx.beginPath(); ctx.rect(-ts * 2, sd > 0 ? 0 : -ts * 2, ts * 4, ts * 2); ctx.restore(); ctx.clip()
					this.drawPc(ctx, pc, 0, 0, ts, Math.min(1, (1 - k) * 2))
					ctx.restore()
				}
				break
			}
			case 'ash': ctx.translate(v.x, v.y); ctx.scale(1 - 0.25 * k, 1 - 0.25 * k); this.tinted(ctx, pc, 0, 0, ts, '#2a2a33', 1 - k); break
			case 'spiral': {
				const an = k * 9, r = ts * 0.6 * (1 - k)
				ctx.translate((v.x0 ?? v.x) + Math.cos(an) * r, (v.y0 ?? v.y) + Math.sin(an) * r * 0.6); ctx.rotate(k * 14); ctx.scale(1 - k, 1 - k)
				this.drawPc(ctx, pc, 0, 0, ts, 1 - k * 0.5)
				break
			}
			case 'float': {
				const up = ts * 3.4 * k * k + ts * 0.5 * k, x = v.x + Math.sin(k * 9) * ts * 0.14, y = v.y - up
				ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3)
				const bx = x + ts * 0.12, by = y - ts * 1.5
				ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, ts * 0.035)
				ctx.beginPath(); ctx.moveTo(x, y - ts * 0.6); ctx.quadraticCurveTo(x - ts * 0.18, y - ts * 0.95, bx, by + ts * 0.42); ctx.stroke()
				ctx.fillStyle = '#ff4f7b'; ctx.beginPath(); ctx.ellipse(bx, by, ts * 0.34, ts * 0.42, 0, 0, TAU); ctx.fill()
				ctx.beginPath(); ctx.moveTo(bx - ts * 0.07, by + ts * 0.47); ctx.lineTo(bx + ts * 0.07, by + ts * 0.47); ctx.lineTo(bx, by + ts * 0.38); ctx.fill()
				ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(bx - ts * 0.11, by - ts * 0.15, ts * 0.07, ts * 0.13, -0.5, 0, TAU); ctx.fill()
				ctx.translate(x, y); ctx.rotate(Math.sin(k * 7) * 0.18)
				this.drawPc(ctx, pc, 0, 0, ts, 1 - 0.25 * k)
				break
			}
			case 'frozen': {
				const br = 0.42
				const sh = k > 0.18 && k < br ? Math.sin(k * 110) * ts * 0.035 : 0
				ctx.translate(v.x + sh, v.y)
				let al = 1
				if (k >= br) { const u = (k - br) / (1 - br); al = Math.max(0, 1 - u * 2.5); ctx.scale(1 + u * 0.4, 1 + u * 0.4) }
				this.tinted(ctx, pc, 0, 0, ts, '#9fd8ff', al)
				ctx.globalAlpha = al * Math.min(1, k / 0.15) * 0.8
				ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, ts * 0.03)
				ctx.beginPath(); ctx.moveTo(-ts * 0.3, -ts * 0.2); ctx.lineTo(-ts * 0.05, ts * 0.02); ctx.lineTo(-ts * 0.12, ts * 0.25); ctx.moveTo(-ts * 0.05, ts * 0.02); ctx.lineTo(ts * 0.25, -ts * 0.1); ctx.stroke()
				break
			}
			case 'abduct': {
				const beam = k < 0.12 ? k / 0.12 : k > 0.85 ? Math.max(0, (1 - k) / 0.15) : 1
				const gr = ctx.createLinearGradient(v.x, v.y - ts * 7, v.x, v.y + ts * 0.6)
				gr.addColorStop(0, 'rgba(166,255,176,0)'); gr.addColorStop(1, 'rgba(166,255,176,0.5)')
				ctx.globalAlpha = beam; ctx.fillStyle = gr
				ctx.beginPath(); ctx.moveTo(v.x - ts * 0.22, v.y - ts * 7); ctx.lineTo(v.x + ts * 0.22, v.y - ts * 7); ctx.lineTo(v.x + ts * 0.8, v.y + ts * 0.6); ctx.lineTo(v.x - ts * 0.8, v.y + ts * 0.6); ctx.closePath(); ctx.fill()
				ctx.globalAlpha = beam * 0.7; ctx.strokeStyle = '#d8ffe0'; ctx.lineWidth = Math.max(1, ts * 0.04)
				ctx.beginPath(); ctx.ellipse(v.x, v.y + ts * 0.55, ts * 0.78, ts * 0.22, 0, 0, TAU); ctx.stroke()
				const u = Math.max(0, (k - 0.12) / 0.88), up = ts * 5 * u * u
				ctx.globalAlpha = 1
				ctx.translate(v.x, v.y - up); ctx.rotate(u * 5)
				this.drawPc(ctx, pc, 0, 0, ts, Math.max(0, 1 - u * u) * (1 - 0.3 * u))
				break
			}
		}
		ctx.restore()
	}

	private renderFx(): void {
		const busy = this.bursts.length || this.rings.length || this.particles.length || this.flashes.length || this.zaps.length || this.slashes.length
		if (!busy && !this.fxDrawn) return
		const f = this.fctx, fd = this.fdpr, ts = this.ts
		f.setTransform(1, 0, 0, 1, 0, 0)
		f.clearRect(0, 0, this.fx.width, this.fx.height)
		this.fxDrawn = !!busy
		if (!busy) return
		f.setTransform(fd, 0, 0, fd, FX_PAD * fd, FX_PAD * fd)
		for (const p of this.particles) if (p.k === 2) {
			const age = 1 - p.life / p.max
			f.save(); f.translate(p.x, p.y); f.rotate(p.rot)
			f.globalAlpha = smooth(age / 0.06) * Math.min(1, (p.life / p.max) * 2.5)
			f.fillStyle = p.col; f.fillRect(-p.s, -p.s * 0.6, p.s * 2, p.s * 1.2)
			f.restore()
		}
		f.globalCompositeOperation = 'lighter'
		for (const fl of this.flashes) {
			const k = fl.t, a = smooth(k / 0.1) * Math.pow(1 - k, 2), r = fl.r * (0.45 + 0.75 * (1 - Math.pow(1 - k, 3)))
			f.globalAlpha = Math.min(1, a)
			f.drawImage(glowSprite(fl.col), fl.x - r, fl.y - r, r * 2, r * 2)
		}
		for (const r of this.rings) {
			const k = r.t
			const rad = Math.max(0.5, ts * 0.3 + (r.max - ts * 0.3) * (1 - Math.pow(1 - k, 3)))
			const a = smooth(k / 0.12) * Math.pow(1 - k, 1.4)
			const w = Math.max(2, ts * 0.12) * (1 - k * 0.7)
			f.globalAlpha = a * 0.28; f.beginPath(); f.ellipse(r.x, r.y, rad, r.flat ? rad * 0.5 : rad, 0, 0, TAU); f.strokeStyle = r.col; f.lineWidth = w * 2.6; f.stroke()
			f.globalAlpha = a * 0.9; f.beginPath(); f.ellipse(r.x, r.y, rad, r.flat ? rad * 0.5 : rad, 0, 0, TAU); f.strokeStyle = r.col; f.lineWidth = w; f.stroke()
		}
		for (const b of this.bursts) { f.save(); burstEnv = smooth(b.t / 0.1); f.globalAlpha = burstEnv; drawBurstRaw(f, b, ts); f.restore() }
		f.globalCompositeOperation = 'lighter'
		for (const z of this.zaps) {
			const a = smooth(z.t / 0.05) * Math.pow(1 - z.t, 1.2) * (0.75 + 0.25 * Math.sin(this.time * 70))
			const line = (w: number, col: string, al: number) => { f.globalAlpha = al; f.beginPath(); z.pts.forEach((p, i) => (i ? f.lineTo(p[0], p[1]) : f.moveTo(p[0], p[1]))); f.strokeStyle = col; f.lineWidth = w; f.lineJoin = 'round'; f.lineCap = 'round'; f.stroke() }
			line(z.w * 3.2, z.col, 0.2 * a); line(z.w * 1.5, z.col, 0.6 * a); line(Math.max(1.5, z.w * 0.6), '#ffffff', a)
		}
		for (const s of this.slashes) {
			const grow = Math.min(1, s.t / 0.25), a = Math.pow(1 - s.t, 1.5), c = Math.cos(s.ang), sn = Math.sin(s.ang), L = s.len * grow
			for (const [w, al] of [[ts * 0.34, 0.25], [ts * 0.14, 0.7], [ts * 0.05, 1]] as [number, number][]) {
				f.globalAlpha = al * a; f.strokeStyle = '#ffffff'; f.lineWidth = w; f.lineCap = 'round'
				f.beginPath(); f.moveTo(s.x - c * L / 2, s.y - sn * L / 2); f.lineTo(s.x + c * L / 2, s.y + sn * L / 2); f.stroke()
			}
		}
		for (const p of this.particles) {
			if (p.k === 2) continue
			const age = 1 - p.life / p.max, left = Math.max(0, p.life / p.max)
			const a = smooth(age / 0.07) * Math.pow(left, 1.2)
			if (a <= 0.003) continue
			f.globalAlpha = Math.min(1, a)
			if (p.k === 1) {
				f.beginPath(); f.moveTo(p.x, p.y); f.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05)
				f.strokeStyle = p.col; f.lineWidth = Math.max(1.5, p.s * 0.5); f.lineCap = 'round'; f.stroke()
			} else {
				const r = p.s * (1.8 + 1.2 * Math.sin(Math.min(1, age * 3) * 1.4)) * (0.5 + 0.5 * left)
				f.drawImage(glowSprite(p.col), p.x - r, p.y - r, r * 2, r * 2)
			}
		}
		f.globalAlpha = 1
		f.globalCompositeOperation = 'source-over'
	}
}

// ---- the bursts of the Classic hit, by the kind of the taking piece (piece_fx.gd in Hex Chaos) ----
export function kindFor(t: number): string {
	return ({ [P]: 'stomp', [L]: 'strike', [N]: 'bounce', [S]: 'slice', [G]: 'ram', [B]: 'slice', [R]: 'ram', [K]: 'royal' } as Record<number, string>)[t] ?? 'stomp'
}
const lifeOf = (k: string): number => ({ ram: 0.6, slice: 0.5, strike: 0.65, crown: 0.8 } as Record<string, number>)[k] ?? 0.7
const shakeOf = (k: string): number => ({ ram: 0.4, crown: 0.45, strike: 0.34, bounce: 0.28, slice: 0.12, splinter: 0.1 } as Record<string, number>)[k] ?? 0.2
const GOLD = '#ffd24d', CYAN = '#6fe3ff'
let burstEnv = 1
function drawBurstRaw(ctx: CanvasRenderingContext2D, b: Burst, ts: number): void {
	const k = b.t, fade = smooth(1 - k), out = 1 - Math.pow(1 - k, 3)
	const rnd = rngSeed(b.seed)
	const col = b.col
	const line = (x0: number, y0: number, x1: number, y1: number, c: string, w: number) => {
		ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineCap = 'round'
		ctx.globalAlpha = 0.22 * burstEnv; ctx.strokeStyle = c; ctx.lineWidth = w * 2.6; ctx.stroke()
		ctx.globalAlpha = burstEnv; ctx.lineWidth = w; ctx.stroke()
	}
	const circ = (x: number, y: number, r: number, c: string) => { if (r <= 0) return; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = c; ctx.fill() }
	const arcs = (x: number, y: number, r: number, c: string, w: number) => {
		if (r <= 0) return
		ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = c
		ctx.globalAlpha = 0.22 * burstEnv; ctx.lineWidth = Math.max(w, 0.5) * 2.6; ctx.stroke()
		ctx.globalAlpha = burstEnv; ctx.lineWidth = Math.max(w, 0.5); ctx.stroke()
	}
	const cross = (x: number, y: number, s: number, c: string) => { line(x - s, y, x + s, y, c, 2); line(x, y - s, x, y + s, c, 2) }
	const { x, y } = b
	switch (b.kind) {
		case 'stomp':
			circ(x, y, ts * 0.5 * fade * fade, `rgba(255,255,255,${0.5 * fade})`)
			for (let i = 0; i < 7; i++) {
				const a = rnd() * TAU, len = ts * (0.7 + rnd() * 0.6) * out
				ctx.beginPath(); ctx.moveTo(x, y)
				for (let j = 1; j < 4; j++) { const aa = a + (rnd() - 0.5) * 0.7; ctx.lineTo(x + Math.cos(aa) * len * j / 3, y + Math.sin(aa) * len * j / 3) }
				ctx.strokeStyle = rgba(col, fade); ctx.lineWidth = Math.max(2, ts * 0.08 * fade + 1); ctx.lineJoin = 'round'; ctx.stroke()
			}
			arcs(x, y, ts * (0.3 + 0.9 * out), `rgba(217,191,153,${0.5 * fade})`, Math.max(2, ts * 0.12 * fade))
			break
		case 'ram': {
			circ(x, y, ts * (0.4 + 0.5 * out), `rgba(255,255,255,${0.55 * fade * fade})`)
			const sx = -b.dy, sy = b.dx
			for (let i = 0; i < 6; i++) {
				const off = (i - 2.5) * ts * 0.17
				line(x - b.dx * ts * (0.3 + 1.6 * out) + sx * off, y - b.dy * ts * (0.3 + 1.6 * out) + sy * off, x - b.dx * ts * (0.1 + 0.5 * out) + sx * off * (1 + out), y - b.dy * ts * (0.1 + 0.5 * out) + sy * off * (1 + out), rgba(col, 0.9 * fade), Math.max(2, ts * 0.07))
			}
			arcs(x, y, ts * (0.2 + 1.5 * out), rgba(col, fade), Math.max(2.5, ts * 0.2 * fade))
			arcs(x, y, ts * (0.1 + out), `rgba(255,255,255,${0.8 * fade})`, Math.max(2, ts * 0.1 * fade))
			break
		}
		case 'slice':
			for (let n = 0; n < 2; n++) {
				const l = Math.SQRT2, dx = 1 / l, dy = (n === 0 ? 1 : -1) / l, reach = ts * 1.5
				const head = Math.max(0, Math.min(1, k * 3 - n * 0.7))
				if (head <= 0) continue
				const a0: [number, number] = [x - dx * reach, y - dy * reach]
				const a1: [number, number] = [a0[0] + dx * reach * 2 * head, a0[1] + dy * reach * 2 * head]
				const a = Math.max(0, Math.min(1, fade * 1.6))
				line(a0[0], a0[1], a1[0], a1[1], rgba(col, 0.35 * a), ts * 0.28 * a + 1)
				line(a0[0], a0[1], a1[0], a1[1], `rgba(255,255,255,${a})`, Math.max(2, ts * 0.09))
			}
			for (let i = 0; i < 8; i++) { const a = rnd() * TAU; circ(x + Math.cos(a) * ts * 1.1 * out * (0.4 + rnd() * 0.6), y + Math.sin(a) * ts * 1.1 * out * (0.4 + rnd() * 0.6), ts * 0.05 * fade + 0.5, `rgba(255,255,255,${fade})`) }
			break
		case 'bounce':
			for (let n = 0; n < 2; n++) {
				const kk = Math.max(0, Math.min(1, k * 1.4 - n * 0.2))
				if (kk <= 0) continue
				const o = 1 - Math.pow(1 - kk, 2)
				ctx.beginPath()
				for (let i = 0; i < 25; i++) { const a = i * TAU / 24; const px = x + Math.cos(a) * ts * (0.3 + 1.3 * o), py = y + Math.sin(a) * ts * (0.15 + 0.6 * o); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }
				ctx.strokeStyle = rgba(col, 0.9 * (1 - kk)); ctx.lineWidth = Math.max(2, ts * 0.12 * (1 - kk)); ctx.stroke()
			}
			for (let i = 0; i < 5; i++) cross(x + (rnd() - 0.5) * ts * 1.4 * out, y - ts * 1.6 * out * (0.5 + rnd() * 0.5) + ts * 1.2 * k * k, ts * 0.12, `rgba(255,242,153,${fade})`)
			break
		case 'strike': {
			const top: [number, number] = [x + (rnd() * 0.6 - 0.3) * ts, y - ts * 3.2]
			const pts: [number, number][] = [top]
			for (let i = 1; i < 7; i++) { const f = i / 6, jit = (rnd() - 0.5) * ts * 0.7 * (1 - f); pts.push([top[0] + (x - top[0]) * f + jit, top[1] + (y - top[1]) * f]) }
			const flash = k < 0.45 ? 1 : Math.max(0, Math.min(1, (0.7 - k) / 0.25))
			ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = rgba(CYAN, 0.45 * flash); ctx.lineWidth = ts * 0.3; ctx.stroke()
			ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = `rgba(255,255,255,${flash})`; ctx.lineWidth = Math.max(2, ts * 0.1); ctx.stroke()
			circ(x, y, ts * (0.4 + 0.5 * out), rgba(CYAN, 0.55 * fade))
			arcs(x, y, ts * (0.3 + 1.2 * out), rgba(col, fade), Math.max(2, ts * 0.1 * fade))
			break
		}
		case 'royal':
			arcs(x, y, ts * (0.3 + 1.4 * out), rgba(GOLD, fade), Math.max(2, ts * 0.16 * fade))
			for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + k; cross(x + Math.cos(a) * ts * (0.4 + 0.9 * out), y + Math.sin(a) * ts * (0.4 + 0.9 * out), ts * 0.12, `rgba(255,242,153,${fade})`) }
			break
	}
}
export { mv, dropMv, deadEnd }
