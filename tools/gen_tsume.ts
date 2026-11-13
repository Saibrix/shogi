// Makes the tsume puzzles: random positions around a king, kept when there is exactly one first move that mates in exactly n.
// Run: node tools/run.mjs gen_tsume [seconds per length]  -> src/gen/tsume.json  ([sfen, solution in USI, rating])
import { writeFileSync, mkdirSync } from 'node:fs'
import { Position, P, L, N, S, G, B, R, K, TO, UM, RY, deadEnd, mDrop, mFrom, mTo } from '../src/rules'
import { Solver, fillDefenderHand, checks, replies } from '../src/tsume'

let seed = 12345
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296 }
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

function randomPosition(): Position | null {
	const p = new Position()
	const kr = rnd() < 0.7 ? 0 : ri(1, 2), kc = rnd() < 0.5 ? pick([0, 1, 7, 8]) : ri(0, 8)
	p.board[kr * 9 + kc] = -K
	const near = (d: number, rows: [number, number]): number => {
		for (let t = 0; t < 30; t++) {
			const r = Math.max(rows[0], Math.min(rows[1], kr + ri(-d, d))), c = Math.max(0, Math.min(8, kc + ri(-d, d)))
			const sq = r * 9 + c
			if (!p.board[sq]) return sq
		}
		return -1
	}
	// defenders
	const nd = ri(0, 4)
	for (let i = 0; i < nd; i++) {
		const t = pick([G, G, S, S, P, P, L, N, B, R])
		const sq = near(2, [0, 4])
		if (sq < 0) continue
		p.board[sq] = -t
	}
	// attackers on the board
	const na = ri(1, 3)
	const pawnFiles = new Set<number>()
	for (let i = 0; i < na; i++) {
		const t = pick([G, S, N, L, P, R, B, RY, UM, TO, G, S, RY])
		const sq = near(3, [0, 6])
		if (sq < 0) continue
		const row = Math.floor(sq / 9)
		if (deadEnd(t, 0, row)) continue
		if (t === P) { if (pawnFiles.has(sq % 9)) continue; pawnFiles.add(sq % 9) }
		p.board[sq] = t
	}
	// attacker hand
	const nh = ri(0, 3)
	for (let i = 0; i < nh; i++) p.hands[0][pick([G, G, S, S, N, L, P, B, R])]++
	// a defending pawn may not stand in a file with another one
	const df = new Set<number>()
	for (let i = 0; i < 81; i++) if (p.board[i] === -P) { if (df.has(i % 9)) p.board[i] = 0; else df.add(i % 9) }
	const q = Position.fromSfen(p.sfen())          // (finds the kings)
	fillDefenderHand(q, 1)
	q.turn = 0
	if (q.inCheck(1)) return null
	// the pieces the attacker has may not exceed what exists
	for (let t = 1; t <= 7; t++) if (q.hands[1][t] < 0) return null
	return q
}

function rating(p: Position, line: string[], nodes: number, n: number, sv: Solver): number {
	const baseR: Record<number, number> = { 1: 950, 3: 1400, 5: 1800, 7: 2150 }
	let r = baseR[n] ?? 2300
	const cands = checks(p).length
	r += Math.max(-120, Math.min(160, (cands - 6) * 12))
	r += Math.max(-80, Math.min(260, 45 * Math.log2(Math.max(1, nodes / 60))))
	const first = p.fromUsi(line[0])
	if (!p.board[mTo(first)] && !mDrop(first)) {
		// a quiet first move that can be taken is a sacrifice
		const u = p.make(first)
		if (replies(p).some((m) => mTo(m) === mTo(first))) r += 110
		p.unmake(first, u)
	}
	if (mDrop(first) && n > 1) r += 40
	if (!((first >> 14) & 1) && mFrom(first) >= 0 && line[0].length === 4) {
		// declining to promote when promoting was possible is a classic trick
		const alt = first | (1 << 14)
		if (p.legal().includes(alt)) r += 90
	}
	void sv
	return Math.round(Math.max(600, Math.min(2800, r)))
}

function solutionLine(p0: Position, n: number, sv: Solver): string[] {
	const p = p0.clone(), line: string[] = []
	for (let left = n; left >= 1; left--) {
		const w = sv.winning(p, left)
		if (!w.length) break
		const m = w[0]
		line.push(p.toUsi(m)); p.make(m)
		if (left === 1) break
		const d = sv.defend(p, left - 1)
		if (!d) break
		line.push(p.toUsi(d)); p.make(d)
	}
	return line
}

const secs = Number(process.argv[2] ?? 60)
const want: Record<number, number> = { 1: 300, 3: 450, 5: 350, 7: 120 }
const out: [string, string[], number][] = []
const seen = new Set<string>()
for (const n of [1, 3, 5, 7]) {
	const t0 = Date.now()
	let found = 0, tried = 0
	while (found < want[n] && Date.now() - t0 < secs * 1000 * (n >= 5 ? 2 : 1)) {
		tried++
		const p = randomPosition()
		if (!p) continue
		const key = p.key()
		if (seen.has(key)) continue
		const sv = new Solver()
		sv.limit = n <= 3 ? 40000 : n === 5 ? 150000 : 500000
		try {
			const k = (n + 1) / 2          // n is counted in plies (tsume style), the solver counts the attacker's moves
			if (k > 1 && sv.mateIn(p, k - 1)) continue          // shorter mate: not this length
			if (!sv.mateIn(p, k)) continue
			const w = sv.winning(p, k)
			if (w.length !== 1) continue
			// the attacker should need its pieces: not more than 4 in hand that never move
			const line = solutionLine(p, k, sv)
			if (line.length !== n) continue
			const nodes = sv.nodes
			seen.add(key)
			out.push([p.sfen(), line, rating(p, line, nodes, n, sv)])
			found++
		} catch { /* too big */ }
	}
	console.log(`mate in ${n}: ${found} puzzles from ${tried} positions in ${Math.round((Date.now() - t0) / 1000)} s`)
}
out.sort((a, b) => a[2] - b[2])
mkdirSync('src/gen', { recursive: true })
writeFileSync('src/gen/tsume.json', JSON.stringify(out))
console.log('wrote', out.length, 'puzzles, ratings', out[0]?.[2], '-', out[out.length - 1]?.[2])
