// Tsume (mate problems): the attacker must give check with every move, the defender holds all remaining pieces in hand.
// mateIn(p, n): can the side to move mate within n of its own moves? Used to make the puzzles and to check the player's moves.
import { Position, mDrop, mTo, mFrom, P, K, base } from './rules'

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]

// the checking moves of the side to move that are legal
export function checks(p: Position): number[] {
	const side = p.turn, out: number[] = []
	for (const m of p.pseudo()) {
		const u = p.make(m)
		let ok = !p.inCheck(side) && p.inCheck(p.turn)
		if (ok && mDrop(m) === P && !hasReply(p)) ok = false          // mate by a dropped pawn is not allowed
		p.unmake(m, u)
		if (ok) out.push(m)
	}
	// captures and promotions first, drops last: finds mates sooner
	return out.sort((a, b) => score(p, b) - score(p, a))
}
function score(p: Position, m: number): number { return (p.board[mTo(m)] ? 4 : 0) + ((m >> 14) & 1 ? 2 : 0) - (mDrop(m) ? 1 : 0) }

// squares between the defending king and the pieces that check it along a line (the only places a drop can help)
function blockSquares(p: Position): Set<number> {
	const side = p.turn, k = p.king(side), out = new Set<number>()
	if (k < 0) return out
	const r0 = Math.floor(k / 9), c0 = k % 9
	for (const [dr, dc] of DIRS) {
		let r = r0 + dr, c = c0 + dc
		const path: number[] = []
		while (r >= 0 && r < 9 && c >= 0 && c < 9) {
			const v = p.board[r * 9 + c]
			if (v) { if ((v > 0) !== (side === 0) && path.length) for (const s of path) out.add(s); break }
			path.push(r * 9 + c); r += dr; c += dc
		}
	}
	return out
}
// the legal replies of the defender (in check), drops only where they block
export function replies(p: Position): number[] {
	const side = p.turn, out: number[] = [], blocks = blockSquares(p)
	for (const m of p.pseudo()) {
		if (mDrop(m) && !blocks.has(mTo(m))) continue
		const u = p.make(m)
		const ok = !p.inCheck(side)
		p.unmake(m, u)
		if (ok) out.push(m)
	}
	// king moves and captures first (they refute most often)
	return out.sort((a, b) => rscore(p, b) - rscore(p, a))
}
function rscore(p: Position, m: number): number { const f = mFrom(m); return (f >= 0 && Math.abs(p.board[f]) === K ? 4 : 0) + (p.board[mTo(m)] ? 3 : 0) - (mDrop(m) ? 2 : 0) }
function hasReply(p: Position): boolean {
	const side = p.turn, blocks = blockSquares(p)
	for (const m of p.pseudo()) {
		if (mDrop(m) && !blocks.has(mTo(m))) continue
		const u = p.make(m)
		const ok = !p.inCheck(side)
		p.unmake(m, u)
		if (ok) return true
	}
	return false
}

export class Solver {
	nodes = 0
	limit = Infinity
	private tt = new Map<string, number>()          // >0: mate in at most that many; <0: no mate in -value
	mateIn(p: Position, n: number): boolean {
		if (n <= 0) return false
		if (++this.nodes > this.limit) throw new Error('limit')
		const key = p.key()
		const e = this.tt.get(key)
		if (e !== undefined) { if (e > 0 && e <= n) return true; if (e < 0 && -e >= n) return false }
		let found = false
		for (const m of checks(p)) {
			const u = p.make(m)
			const rs = replies(p)
			let ok = rs.length === 0
			if (!ok && n > 1) {
				ok = true
				for (const r of rs) { const u2 = p.make(r); const sub = this.mateIn(p, n - 1); p.unmake(r, u2); if (!sub) { ok = false; break } }
			}
			p.unmake(m, u)
			if (ok) { found = true; break }
		}
		if (found) { if (e === undefined || e < 0 || e > n) this.tt.set(key, n) }
		else if (e === undefined || (e < 0 && -e < n)) this.tt.set(key, -n)
		return found
	}
	// the smallest n <= max with a mate, or 0
	length(p: Position, max: number): number { for (let n = 1; n <= max; n++) if (this.mateIn(p, n)) return n; return 0 }
	// all first moves that mate within n
	winning(p: Position, n: number): number[] {
		const out: number[] = []
		for (const m of checks(p)) {
			const u = p.make(m)
			const rs = replies(p)
			let ok = rs.length === 0
			if (!ok && n > 1) { ok = true; for (const r of rs) { const u2 = p.make(r); const s = this.mateIn(p, n - 1); p.unmake(r, u2); if (!s) { ok = false; break } } }
			p.unmake(m, u)
			if (ok) out.push(m)
		}
		return out
	}
	// the defender's best reply: the one that lasts longest (no pointless drops when a plain move lasts as long)
	defend(p: Position, n: number): number {
		const rs = replies(p)
		let best = rs[0] ?? 0, bestLen = -1
		for (const r of rs) {
			const u = p.make(r)
			let len = 0
			for (let k = 1; k <= n; k++) if (this.mateIn(p, k)) { len = k; break }
			if (!len) len = 99
			p.unmake(r, u)
			const better = len > bestLen || (len === bestLen && mDrop(best) && !mDrop(r))
			if (better) { best = r; bestLen = len }
		}
		return best
	}
}

// the full count of each piece kind (for the defender's hand)
export const TOTAL: Record<number, number> = { 1: 18, 2: 4, 3: 4, 4: 4, 5: 4, 6: 2, 7: 2 }
// fill the defender's hand with every piece that is not on the board or in the attacker's hand
export function fillDefenderHand(p: Position, defender = 1): void {
	const used: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
	for (let i = 0; i < 81; i++) { const v = p.board[i]; if (v) { const t = base(Math.abs(v)); if (t !== K) used[t]++ } }
	for (let t = 1; t <= 7; t++) used[t] += p.hands[1 - defender][t]
	for (let t = 1; t <= 7; t++) p.hands[defender][t] = Math.max(0, TOTAL[t] - used[t])
}
