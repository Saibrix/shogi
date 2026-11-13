// Tsume puzzles with a rating: every puzzle has a rating, the player's rating moves like Elo (faster at the start).
import { Game, Position, mTo, mFrom, mDrop } from './rules'
import { Solver } from './tsume'
import { GameView } from './gameview'
import { h, clear, toast } from './ui'
import { settings, store, keep, myLooks } from './settings'
import { playSound } from './sfx'

type Puzzle = [string, string[], number]
interface PState { rating: number; rd: number; solved: number; failed: number; done: Record<number, number>; streak: number; history: [number, number, boolean][] }
let bank: Puzzle[] | null = null
async function loadBank(): Promise<Puzzle[]> {
	if (bank) return bank
	const r = await fetch('tsume.json')
	bank = await r.json()
	return bank!
}
const st = (): PState => store<PState>('puzzles', { rating: 1200, rd: 300, solved: 0, failed: 0, done: {}, streak: 0, history: [] })

function pickPuzzle(b: Puzzle[], s: PState, len: number): number {
	const ok = (i: number) => (len === 0 || b[i][1].length === len)
	let best: number[] = []
	for (let span = 120; span <= 2000 && best.length < 8; span *= 1.6) {
		best = []
		for (let i = 0; i < b.length; i++) if (ok(i) && !s.done[i] && Math.abs(b[i][2] - s.rating) <= span) best.push(i)
	}
	if (!best.length) for (let i = 0; i < b.length; i++) if (ok(i)) best.push(i)
	return best[Math.floor(Math.random() * best.length)]
}

export function puzzleScreen(root: HTMLElement): () => void {
	let view: GameView | null = null
	let idx = -1, start: Position, line: string[] = [], step = 0, failed = false, finished = false, hinted = false
	let len = store<number>('puzzleLen', 0)
	const info = h('div', { class: 'pzinfo' })
	const ratingEl = h('div', { class: 'pzrating' })
	const sv = new Solver()
	sv.limit = 300000
	const showRating = (delta?: number) => {
		const s = st()
		clear(ratingEl).append(h('div', { class: 'big' }, String(Math.round(s.rating)), delta !== undefined ? h('span', { class: delta >= 0 ? 'up' : 'down' }, ` ${delta >= 0 ? '+' : ''}${Math.round(delta)}`) : ''), h('div', { class: 'muted' }, `Your puzzle rating · ${s.solved} solved · ${s.failed} failed${s.rd > 120 ? ' · still settling' : ''}`))
	}
	const rate = (win: boolean) => {
		const s = st(), pr = bank![idx][2]
		const e = 1 / (1 + Math.pow(10, (pr - s.rating) / 400))
		const k = Math.max(16, Math.min(80, s.rd / 4))
		const d = k * ((win ? 1 : 0) - e)
		s.rating = Math.max(400, Math.min(3000, s.rating + d)); s.rd = Math.max(60, s.rd * 0.94)
		if (win) { s.solved++; s.streak++ } else { s.failed++; s.streak = 0 }
		s.done[idx] = win ? 1 : -1
		s.history.push([idx, Math.round(s.rating), win]); if (s.history.length > 300) s.history.shift()
		keep('puzzles', s)
		showRating(d)
	}
	const lengthSel = h('select', { onChange: (e: Event) => { len = Number((e.target as HTMLSelectElement).value); keep('puzzleLen', len); next() } },
		...[[0, 'Any length'], [1, 'Mate in 1'], [3, 'Mate in 3'], [5, 'Mate in 5'], [7, 'Mate in 7']].map(([v, t]) => h('option', { value: v, selected: v === len }, String(t))))
	const btnHint = h('button', { onClick: () => hint() }, 'Hint')
	const btnSol = h('button', { onClick: () => solution() }, 'Show solution')
	const btnNext = h('button', { class: 'primary', onClick: () => next() }, 'Next puzzle')
	const btnRetry = h('button', { onClick: () => load(idx) }, 'Retry')

	function setInfo(html: string, cls = ''): void { info.className = 'pzinfo ' + cls; info.innerHTML = html }
	async function next(): Promise<void> { const b = await loadBank(); load(pickPuzzle(b, st(), len)) }
	function load(i: number): void {
		idx = i
		const [sfen, sol, r] = bank![i]
		start = Position.fromSfen(sfen)
		line = sol; step = 0; failed = !!st().done[i]; finished = false; hinted = false
		const g = new Game(sfen)
		if (!view) {
			view = new GameView(g)
			view.board.looks = [myLooks(), null]
			view.board.effects = settings.effects
			view.board.onUserMove = (m) => userMove(m)
			view.barOf(0).name.textContent = 'You (attack)'
			view.barOf(1).name.textContent = 'Defender'
			view.barOf(1).sub.textContent = 'holds all other pieces'
			view.setClock(0, null, false); view.setClock(1, null, false)
			clear(view.buttons).append(btnHint, btnSol, btnRetry, btnNext)
			clear(view.extra).append(h('label', { class: 'row' }, 'Show: ', lengthSel), ratingEl)
			view.side.prepend(info)
			clear(root).append(view.el)
		} else view.reset(g)
		view.setOrientation(0)
		view.setMovable(0)
		setInfo(`<b>Mate in ${sol.length}</b> · puzzle #${i + 1} · rated ${r}<br><span class="muted">Every one of your moves must give check.</span>`)
		btnNext.style.display = 'none'; btnRetry.style.display = 'none'; btnSol.style.display = ''; btnHint.style.display = ''
		showRating()
	}
	function remainingAttacks(): number { return Math.ceil((line.length - step) / 2) }
	function userMove(m: number): void {
		if (!view || finished) return
		const g = view.game
		const before = g.pos.clone()
		const usi = before.toUsi(m)
		let ok = usi === line[step]
		sv.nodes = 0
		let ownLine = false
		if (!ok) {
			// another move that also mates in time is fine
			try { const p = before.clone(); const u = p.make(m); void u; if (p.inCheck(p.turn)) { ok = remainingAttacks() <= 1 ? !p.hasLegal() : (() => { const rs = p.legal(); return rs.length === 0 || rs.every((r) => { const q = p.clone(); q.make(r); return sv.mateIn(q, remainingAttacks() - 1) }) })(); ownLine = ok } } catch { ok = false }
		}
		g.play(m); view.pushed()
		if (!ok) {
			playSound('check', 0.4, 0.6)
			setInfo('<b>✗ Not the solution.</b> Try again or look at the solution.', 'bad')
			if (!failed) { failed = true; rate(false) }
			view.setMovable(-1)
			btnRetry.style.display = ''; btnNext.style.display = ''
			return
		}
		step++
		if (g.result || !g.pos.hasLegal()) { done(); return }
		// the defender answers
		view.setMovable(-1)
		setInfo('<b>✓ Good move!</b> …', 'good')
		setTimeout(() => {
			if (!view || view.game !== g) return
			let reply: number
			sv.nodes = 0; sv.limit = 2e6
			if (!ownLine && line[step]) reply = g.pos.fromUsi(line[step])
			else { try { reply = sv.defend(g.pos.clone(), remainingAttacks()) } catch { reply = g.pos.legal()[0] } ownLine = true }
			if (ownLine) {
				// continue on a line of our own: recompute the rest of the solution
				const p = g.pos.clone(); p.make(reply)
				const rest: string[] = [p.toUsi(reply)]
				line = line.slice(0, step).concat(rest)
				let left = remainingAttacks()
				const q = p.clone()
				try { while (left > 0) { const w = sv.winning(q, left); if (!w.length) break; line.push(q.toUsi(w[0])); q.make(w[0]); if (!q.hasLegal()) break; const d = sv.defend(q, left - 1); line.push(q.toUsi(d)); q.make(d); left-- } } catch { /* too deep: the player finds the rest */ }
			}
			g.play(reply); view.pushed(); step++
			view.setMovable(0)
			sv.limit = 300000
			setInfo(`<b>✓ Good move!</b> Keep going: mate in ${line.length - step}.`, 'good')
		}, 450)
	}
	function done(): void {
		finished = true
		view!.setMovable(-1)
		playSound('sparkle', 0.6)
		setInfo(`<b>✓ Solved!</b> ${failed ? '' : hinted ? '(with a hint)' : ''}`, 'good')
		if (!failed) rate(!hinted)
		btnNext.style.display = ''; btnHint.style.display = 'none'; btnSol.style.display = 'none'
	}
	function hint(): void {
		if (!view || finished) return
		const m = view.game.pos.fromUsi(line[step])
		hinted = true
		const from = mFrom(m)
		view.board.marks = from >= 0 ? [{ sq: from, color: 'rgba(214,79,0,0.45)' }] : [{ sq: mTo(m), color: 'rgba(214,79,0,0.45)' }]
		view.board.redraw()
		setInfo(from >= 0 ? 'Hint: move the marked piece.' : `Hint: drop a piece (${'?PLNSGBR'[mDrop(m)]}) on the marked square.`)
		setTimeout(() => { if (view) { view.board.marks = []; view.board.redraw() } }, 2500)
	}
	function solution(): void {
		if (!view) return
		if (!failed && !finished) { failed = true; rate(false) }
		finished = true
		const g = new Game(start.sfen())
		view.reset(g)
		view.setMovable(-1)
		let k = 0
		const tick = () => { if (!view || view.game !== g || k >= line.length) return; g.play(g.pos.fromUsi(line[k++])); view.pushed(); setTimeout(tick, 800) }
		setTimeout(tick, 400)
		setInfo('Solution: ' + (() => { const p = start.clone(); return line.map((u) => { const m = p.fromUsi(u); const s = p.notation(m); p.make(m); return s }).join(' ') })())
		btnNext.style.display = ''; btnRetry.style.display = ''; btnSol.style.display = 'none'; btnHint.style.display = 'none'
	}
	loadBank().then(() => next()).catch(() => { root.append(h('p', {}, 'Could not load the puzzles.')); toast('Could not load the puzzles') })
	return () => view?.destroy()
}
