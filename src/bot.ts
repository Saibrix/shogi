// The computer opponent: YaneuraOu with limits and a little chance per level; a small own search when the engine cannot run.
import { Game, Position, VALUE, base, K, mTo, mDrop } from './rules'
import { search, startEngine } from './engine'

// The 10 levels of lishogi (shoginet's server-config.json): 1-4 there are Fairy-Stockfish with "Skill Level" -9/-5/-1/3 at depth 5,
// here YaneuraOu at depth 5 that picks among its best moves by chance (the lower the level, the more often a weaker one);
// 5-10 are YaneuraOu with the same depth and time limits as on lishogi.
export const LEVELS: { name: string; lim: { depth?: number; nodes?: number; movetime?: number }; multipv: number; temp: number }[] = [
	{ name: 'Level 1', lim: { depth: 5, movetime: 300 }, multipv: 10, temp: 520 },
	{ name: 'Level 2', lim: { depth: 5, movetime: 300 }, multipv: 8, temp: 320 },
	{ name: 'Level 3', lim: { depth: 5, movetime: 300 }, multipv: 6, temp: 180 },
	{ name: 'Level 4', lim: { depth: 5, movetime: 300 }, multipv: 4, temp: 90 },
	{ name: 'Level 5', lim: { depth: 2, movetime: 300 }, multipv: 1, temp: 0 },
	{ name: 'Level 6', lim: { depth: 4, movetime: 400 }, multipv: 1, temp: 0 },
	{ name: 'Level 7', lim: { depth: 8, movetime: 500 }, multipv: 1, temp: 0 },
	{ name: 'Level 8', lim: { depth: 13, movetime: 1000 }, multipv: 1, temp: 0 },
	{ name: 'Level 9', lim: { depth: 17, movetime: 1500 }, multipv: 1, temp: 0 },
	{ name: 'Level 10', lim: { depth: 22, movetime: 2500 }, multipv: 1, temp: 0 },
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
	// at least a second, so a fast bot does not answer in the same instant
	const wait = 1000 - (performance.now() - t0)
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
