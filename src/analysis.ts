// Analysis: the engine looks at every position of a game, draws the evaluation graph and marks the mistakes (?!, ?, ??).
// It also shows a live engine line for the position on the board.
import { Game, Position } from './rules'
import { search, startEngine, engineError, Info, stopSearch } from './engine'
import { GameView } from './gameview'
import { h, themeCol } from './ui'

// the engine's score from Sente's view
export const senteCp = (cp: number, turn: number) => (turn === 0 ? cp : -cp)
const winChance = (cp: number) => 2 / (1 + Math.exp(-0.0012 * Math.max(-4000, Math.min(4000, cp)))) - 1          // -1 .. 1
export function fmtEval(cp: number, mate: number | null): string {
	if (mate !== null) return (mate > 0 ? '#' : '#-') + Math.abs(mate)
	return (cp > 0 ? '+' : '') + (cp / 100).toFixed(1)
}

export class Analyzer {
	evals: (number | null)[] = []          // per ply, Sente's view (cp)
	mates: (number | null)[] = []
	best: (string | null)[] = []
	running = false
	graph = h('canvas', { class: 'evalgraph' })
	live = h('div', { class: 'enginebox' })
	liveOn = false
	private liveToken = 0
	constructor(public view: GameView) {
		this.graph.addEventListener('pointerdown', (e) => {
			const r = this.graph.getBoundingClientRect()
			const n = this.view.game.moves.length
			this.view.go(Math.round(((e.clientX - r.left) / r.width) * n))
		})
		new ResizeObserver(() => this.draw()).observe(this.graph)
	}

	async analyzeGame(onProgress: (k: number, n: number) => void, nodes = 160000): Promise<void> {
		if (this.running) return
		if (!(await startEngine())) { onProgress(-1, 0); return }
		this.running = true
		const g = this.view.game
		const n = g.moves.length
		for (let ply = 0; ply <= n && this.running; ply++) {
			if (this.evals[ply] != null) continue
			const p = g.positionAt(ply)
			if (!p.hasLegal()) { this.evals[ply] = p.turn === 0 ? -30000 : 30000; this.mates[ply] = 0; continue }
			const r = await search(g.usiPosition(ply), { nodes })
			if (!r || !this.running) break
			const i = r.infos[0]
			this.evals[ply] = i ? senteCp(i.cp, p.turn) : 0
			this.mates[ply] = i && i.mate !== null ? (p.turn === 0 ? i.mate : -i.mate) : null
			this.best[ply] = r.best
			onProgress(ply, n)
			this.annotate()
			this.draw()
		}
		this.running = false
		this.annotate()
		this.draw()
		onProgress(n, n)
	}
	stop(): void { this.running = false; stopSearch() }

	// marks: the loss in winning chance of the side that moved
	annotate(): void {
		const notes: string[] = []
		for (let ply = 1; ply < this.evals.length; ply++) {
			const a = this.evals[ply - 1], b = this.evals[ply]
			if (a == null || b == null) continue
			const moverSide = (Position.fromSfen(this.view.game.start).turn + ply - 1) % 2
			const sgn = moverSide === 0 ? 1 : -1
			const loss = (winChance(a) - winChance(b)) * sgn / 2          // 0 .. 1
			if (this.best[ply - 1] && this.view.game.usi[ply - 1] === this.best[ply - 1]) continue
			notes[ply] = loss >= 0.3 ? '??' : loss >= 0.15 ? '?' : loss >= 0.07 ? '?!' : ''
		}
		this.view.notes = notes
		this.view.renderMoves()
	}
	summary(): { side: string; inacc: number; mist: number; blun: number; acpl: number }[] {
		const out = [0, 1].map((s) => ({ side: s ? 'Gote' : 'Sente', inacc: 0, mist: 0, blun: 0, acpl: 0, n: 0 }))
		for (let ply = 1; ply < this.evals.length; ply++) {
			const s = (ply - 1) % 2, n = this.view.notes[ply]
			if (n === '?!') out[s].inacc++; else if (n === '?') out[s].mist++; else if (n === '??') out[s].blun++
			const a = this.evals[ply - 1], b = this.evals[ply]
			if (a != null && b != null) { const loss = Math.max(0, (s === 0 ? a - b : b - a)); out[s].acpl += Math.min(1000, loss); out[s].n++ }
		}
		return out.map((o) => ({ ...o, acpl: o.n ? Math.round(o.acpl / o.n) : 0 }))
	}

	draw(): void {
		const c = this.graph, r = c.getBoundingClientRect()
		if (!r.width) return
		const dpr = Math.min(2, window.devicePixelRatio || 1)
		c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr)
		const x = c.getContext('2d')!
		x.setTransform(dpr, 0, 0, dpr, 0, 0)
		const w = r.width, hh = r.height, n = Math.max(1, this.view.game.moves.length)
		x.fillStyle = themeCol.graphbg; x.fillRect(0, 0, w, hh)
		const Y = (cp: number) => hh / 2 - winChance(cp) * (hh / 2 - 2)
		x.beginPath(); x.moveTo(0, hh / 2)
		let last = hh / 2
		for (let i = 0; i <= n; i++) { const e = this.evals[i]; if (e == null) continue; last = Y(e); x.lineTo((i / n) * w, last) }
		x.lineTo(w, last); x.lineTo(w, hh / 2); x.closePath()
		x.fillStyle = themeCol.graphfill; x.fill()
		x.strokeStyle = 'rgba(128,128,128,0.4)'; x.beginPath(); x.moveTo(0, hh / 2); x.lineTo(w, hh / 2); x.stroke()
		for (let i = 1; i <= n; i++) {
			const note = this.view.notes[i]
			if (!note) continue
			const e = this.evals[i]
			if (e == null) continue
			x.fillStyle = note === '??' ? '#df5353' : note === '?' ? '#e69f00' : '#56b4e9'
			x.beginPath(); x.arc((i / n) * w, Y(e), 3, 0, Math.PI * 2); x.fill()
		}
		const cx = (this.view.ply / n) * w
		x.strokeStyle = '#d64f00'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, hh); x.stroke()
	}

	// the live engine box: best line for the shown position
	async think(): Promise<void> {
		const token = ++this.liveToken
		if (!this.liveOn) { this.live.innerHTML = ''; this.view.board.arrows = []; this.view.board.redraw(); return }
		const ply = this.view.ply, g = this.view.game, p = g.positionAt(ply)
		if (!p.hasLegal()) { this.live.innerHTML = '<div class="eline">No moves: game over.</div>'; this.view.board.arrows = []; this.view.board.redraw(); return }
		this.live.innerHTML = '<div class="eline muted">thinking…</div>'
		if (!(await startEngine())) { this.live.innerHTML = `<div class="eline muted">${engineError}</div>`; return }
		const show = (infos: Info[]) => {
			if (token !== this.liveToken) return
			this.live.innerHTML = ''
			const arrows: { m: number; color: string }[] = []
			infos.forEach((i, k) => {
				if (!i || !i.pv.length) return
				const sc = senteCp(i.cp, p.turn), mt = i.mate !== null ? (p.turn === 0 ? i.mate : -i.mate) : null
				const q = p.clone(), san: string[] = []
				for (const u of i.pv.slice(0, 10)) { try { const m = q.fromUsi(u); if (!q.legal().includes(m)) break; san.push(q.notation(m)); q.make(m) } catch { break } }
				this.live.append(h('div', { class: 'eline' }, h('b', {}, fmtEval(sc, mt)), ' ', san.join(' ')))
				try { arrows.push({ m: p.fromUsi(i.pv[0]), color: k === 0 ? '#15781b' : '#3a6fb0' }) } catch { /* bad pv */ }
			})
			this.live.prepend(h('div', { class: 'eline muted' }, `depth ${infos[0]?.depth ?? 0}`))
			this.view.board.arrows = arrows
			this.view.board.redraw()
		}
		const infos: Info[] = []
		await search(g.usiPosition(ply), { movetime: 4000, multipv: 2 }, (i) => { infos[i.multipv - 1] = i; if (i.multipv === infos.filter(Boolean).length) show(infos.filter(Boolean)) })
		if (token === this.liveToken) show(infos.filter(Boolean))
	}
}
export function gameFromText(text: string): Game | null {
	// accepts "sfen ... [moves ...]", "startpos moves ...", "position ..." or a plain list of USI moves
	let t = text.trim().replace(/^position\s+/, '')
	let sfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
	let moves: string[] = []
	try {
		if (t.startsWith('startpos')) { t = t.slice(8).trim() }
		else if (t.startsWith('sfen ') || /^[1-9lnsgkrbpLNSGKRBP+/]+\s+[bw]\s/.test(t)) {
			t = t.replace(/^sfen\s+/, '')
			const parts = t.split(/\s+/)
			sfen = parts.slice(0, 4).join(' ')
			t = parts.slice(4).join(' ')
		}
		t = t.replace(/^moves\s*/, '')
		moves = t.split(/\s+/).filter(Boolean)
		const g = new Game(sfen)
		for (const u of moves) { const m = g.pos.fromUsi(u); if (!g.play(m)) break }
		return g
	} catch { return null }
}
