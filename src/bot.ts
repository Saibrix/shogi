// The computer opponent: YaneuraOu with limits and a little chance per level; a small own search when the engine cannot run.
import { Game, Position, VALUE, base, K, mTo, mDrop } from './rules'
import { search, startEngine } from './engine'

export const LEVELS: { name: string; elo: number; lim: { depth?: number; nodes?: number; movetime?: number }; multipv: number; temp: number }[] = [
	{ name: 'Level 1', elo: 600, lim: { depth: 1 }, multipv: 10, temp: 420 },
	{ name: 'Level 2', elo: 900, lim: { depth: 2 }, multipv: 8, temp: 230 },
	{ name: 'Level 3', elo: 1150, lim: { depth: 3 }, multipv: 6, temp: 130 },
	{ name: 'Level 4', elo: 1400, lim: { nodes: 4000 }, multipv: 5, temp: 70 },
	{ name: 'Level 5', elo: 1650, lim: { nodes: 25000 }, multipv: 4, temp: 35 },
	{ name: 'Level 6', elo: 1900, lim: { nodes: 120000 }, multipv: 3, temp: 14 },
	{ name: 'Level 7', elo: 2200, lim: { movetime: 1200 }, multipv: 1, temp: 0 },
	{ name: 'Level 8', elo: 2600, lim: { movetime: 3500 }, multipv: 1, temp: 0 },
]

export async function botMove(g: Game, level: number): Promise<number> {
	const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))]
	const legal = g.pos.legal()
	if (!legal.length) return 0
	const t0 = performance.now()
	let move = 0
	if (await startEngine()) {
		const r = await search(g.usiPosition(), { ...L.lim, multipv: L.multipv })
		if (r && r.best && r.best !== 'resign' && r.best !== 'win') {
			move = g.pos.fromUsi(r.best)
			if (L.temp > 0 && r.infos.length > 1) {
				const best = r.infos[0].cp
				const cands = r.infos.filter((i) => i.pv.length && (best - i.cp) < L.temp * 4 && !(i.mate !== null && i.mate < 0 && r.infos[0].mate === null))
				const ws = cands.map((i) => Math.exp((i.cp - best) / L.temp))
				let x = Math.random() * ws.reduce((a, b) => a + b, 0)
				for (let k = 0; k < cands.length; k++) { x -= ws[k]; if (x <= 0) { move = g.pos.fromUsi(cands[k].pv[0]); break } }
			}
		}
	}
	if (!move || !legal.includes(move)) move = fallbackMove(g.pos, level)
	// a short pause, so the bot does not answer in the same instant
	const wait = 350 - (performance.now() - t0)
	if (wait > 0) await new Promise((r) => setTimeout(r, wait))
	return move
}

// ---- the small own bot (alpha-beta over material) ----
function evaluate(p: Position): number {
	let v = 0
	for (let i = 0; i < 81; i++) { const x = p.board[i]; if (x) v += (x > 0 ? 1 : -1) * VALUE[Math.abs(x)] }
	for (let t = 1; t <= 7; t++) v += (p.hands[0][t] - p.hands[1][t]) * VALUE[t] * 1.1
	return p.turn === 0 ? v : -v
}
function ab(p: Position, d: number, a: number, b: number): number {
	if (d === 0) return evaluate(p)
	const ms = p.pseudo()
	let any = false
	ms.sort((x, y) => Math.abs(p.board[mTo(y)]) - Math.abs(p.board[mTo(x)]))
	for (const m of ms) {
		if (Math.abs(p.board[mTo(m)]) === K && !mDrop(m)) return 1000
		const side = p.turn, u = p.make(m)
		if (p.inCheck(side)) { p.unmake(m, u); continue }
		any = true
		const v = -ab(p, d - 1, -b, -a)
		p.unmake(m, u)
		if (v >= b) return v
		if (v > a) a = v
	}
	return any ? a : -1000
}
export function fallbackMove(p0: Position, level: number): number {
	const p = p0.clone(), ms = p.legal()
	const depth = level <= 2 ? 1 : 2
	let best = ms[0], bv = -Infinity
	for (const m of ms) {
		const u = p.make(m)
		const v = -ab(p, depth - 1, -Infinity, Infinity) + Math.random() * (level <= 2 ? 3 : 0.5)
		p.unmake(m, u)
		if (v > bv) { bv = v; best = m }
	}
	void base
	return best
}
