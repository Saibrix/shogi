// The game screen used by every mode: board, the two player bars (name, clock), the move list and a row of buttons.
import { ShogiBoard } from './board'
import { Game, Position } from './rules'
import { h, fmtClock } from './ui'
import { settings } from './settings'

export interface Bar { el: HTMLElement; name: HTMLElement; sub: HTMLElement; clock: HTMLElement; dot: HTMLElement }
function bar(): Bar {
	const name = h('span', { class: 'pname' }), sub = h('span', { class: 'psub' }), clock = h('div', { class: 'clock' }), dot = h('span', { class: 'odot' })
	return { el: h('div', { class: 'pbar' }, h('div', { class: 'pinfo' }, dot, name, sub), clock), name, sub, clock, dot }
}

export class GameView {
	el: HTMLElement
	board = new ShogiBoard()
	game: Game
	ply = 0          // the ply shown (game.moves.length = live)
	top = bar()
	bottom = bar()
	moves = h('div', { class: 'moves' })
	status = h('div', { class: 'status' })
	buttons = h('div', { class: 'gbtns' })
	extra = h('div', { class: 'gextra' })
	side: HTMLElement
	notes: string[] = []          // per ply: '', '?!', '?', '??'
	onNavigate: (ply: number) => void = () => {}

	constructor(game = new Game()) {
		this.game = game
		this.ply = game.moves.length
		const nav = h('div', { class: 'nav' },
			h('button', { class: 'ico', title: 'First', onClick: () => this.go(0) }, '⏮'),
			h('button', { class: 'ico', title: 'Back', onClick: () => this.go(this.ply - 1) }, '◀'),
			h('button', { class: 'ico', title: 'Forward', onClick: () => this.go(this.ply + 1) }, '▶'),
			h('button', { class: 'ico', title: 'Last', onClick: () => this.go(this.game.moves.length) }, '⏭'),
			h('button', { class: 'ico', title: 'Flip board', onClick: () => this.flip() }, '⇅'))
		this.side = h('div', { class: 'gside' }, this.status, this.moves, nav, this.buttons, this.extra)
		const main = h('div', { class: 'gmain' }, this.top.el, this.board.el, this.bottom.el)
		this.el = h('div', { class: 'gameview' }, main, this.side)
		this.board.setCoords(settings.coords)
		this.board.setPosition(game.pos.clone(), game.moves[game.moves.length - 1] ?? 0)
		this.renderMoves()
		this.keys = (e: KeyboardEvent) => {
			if ((e.target as HTMLElement)?.tagName === 'INPUT') return
			if (e.key === 'ArrowLeft') this.go(this.ply - 1)
			else if (e.key === 'ArrowRight') this.go(this.ply + 1)
			else if (e.key === 'ArrowUp' || e.key === 'Home') this.go(0)
			else if (e.key === 'ArrowDown' || e.key === 'End') this.go(this.game.moves.length)
			else return
			e.preventDefault()
		}
		window.addEventListener('keydown', this.keys)
		;(window as any).__view = this
	}
	private keys: (e: KeyboardEvent) => void
	destroy(): void { window.removeEventListener('keydown', this.keys) }
	live(): boolean { return this.ply === this.game.moves.length }
	flip(): void { this.board.setOrientation(1 - this.board.orientation); this.swapBars() }
	swapBars(): void {
		// the bar of the side at the bottom is below the board
		const main = this.top.el.parentElement!
		const bottomFirst = this.board.orientation === 1
		const [t, b] = bottomFirst ? [this.bottomBarFor(0), this.bottomBarFor(1)] : [this.bottomBarFor(1), this.bottomBarFor(0)]
		main.insertBefore(t.el, this.board.el)
		main.append(b.el)
	}
	// bars belong to sides: top = Gote, bottom = Sente (in the starting orientation)
	barOf(side: number): Bar { return side === 0 ? this.bottom : this.top }
	private bottomBarFor(side: number): Bar { return this.barOf(side) }
	setOrientation(o: number): void { if (this.board.orientation !== o) this.flip() }

	go(ply: number): void {
		ply = Math.max(0, Math.min(this.game.moves.length, ply))
		if (ply === this.ply) return
		const forwardOne = ply === this.ply + 1
		const before = this.game.positionAt(this.ply)
		this.ply = ply
		if (forwardOne) { const after = before.clone(); after.make(this.game.moves[ply - 1]); this.board.playMove(before, this.game.moves[ply - 1], after) }
		else this.board.setPosition(this.game.positionAt(ply), this.game.moves[ply - 1] ?? 0)
		this.board.movable = this.live() ? this.movable : -1
		this.renderMoves()
		this.onNavigate(ply)
	}
	movable = -1
	setMovable(side: number): void { this.movable = side; this.board.movable = this.live() ? side : -1 }

	// a move was added to the game: show it (animated when we were looking at the end)
	pushed(): void {
		const n = this.game.moves.length
		if (this.ply === n - 1) {
			const before = this.game.positionAt(n - 1)
			this.ply = n
			this.board.playMove(before, this.game.moves[n - 1], this.game.pos.clone())
		}
		this.board.movable = this.live() ? this.movable : -1
		this.renderMoves()
	}
	reset(game: Game): void { this.game = game; this.ply = game.moves.length; this.board.setPosition(game.pos.clone(), game.moves[game.moves.length - 1] ?? 0); this.notes = []; this.renderMoves() }

	renderMoves(): void {
		const m = this.moves
		m.innerHTML = ''
		const s = this.game.sans
		for (let i = 0; i < s.length; i += 2) {
			const row = h('div', { class: 'mrow' }, h('span', { class: 'mnum' }, String(i / 2 + 1)))
			for (const k of [i, i + 1]) {
				if (k >= s.length) { row.append(h('span', { class: 'mv' })); continue }
				const note = this.notes[k + 1] ?? ''
				const el = h('span', { class: 'mv' + (k + 1 === this.ply ? ' cur' : '') + (note ? ' n' + note.length + (note === '?!' ? 'i' : '') : ''), onClick: () => this.go(k + 1) }, s[k] + (note ? ' ' + note : ''))
				row.append(el)
			}
			m.append(row)
		}
		if (this.game.result) m.append(h('div', { class: 'mresult' }, resultText(this.game.result)))
		const cur = m.querySelector('.cur') as HTMLElement | null
		// scroll only inside the list (scrollIntoView would move the whole page on a phone)
		if (cur) { m.scrollTop = Math.max(0, cur.offsetTop - m.clientHeight / 2); m.scrollLeft = Math.max(0, cur.offsetLeft - m.clientWidth / 2) }
		else { m.scrollTop = this.ply === 0 ? 0 : m.scrollHeight; m.scrollLeft = this.ply === 0 ? 0 : m.scrollWidth }
	}
	setStatus(html: string): void { this.status.innerHTML = html }
	shownPosition(): Position { return this.game.positionAt(this.ply) }
	setClock(side: number, ms: number | null, running: boolean, byo = 0): void {
		const c = this.barOf(side).clock
		if (ms === null) { c.style.display = 'none'; return }
		c.style.display = ''
		let txt = fmtClock(ms)
		if (ms <= 0 && byo > 0) txt = '⏱ ' + fmtClock(byo)
		c.textContent = txt
		c.classList.toggle('run', running)
		c.classList.toggle('low', running && (ms > 0 ? ms < 20000 : byo < 10000))
	}
}
export function resultText(r: { winner: number; reason: string }): string {
	if (r.winner === -1) return r.reason === 'aborted' ? 'Game aborted' : `Draw (${r.reason})`
	return `${r.winner === 0 ? '☗ Sente' : '☖ Gote'} wins (${r.reason})`
}
