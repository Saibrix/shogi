// Shogi rules. Board: 81 squares, index = row * 9 + col; row 0 is rank "a" (Gote's back rank, at the top), col 0 is file 9.
// A square holds 0 (empty), +type (Sente, moves up) or -type (Gote). Moves are ints (see mv / mFrom / mTo / mPromo / mDrop).

export const P = 1, L = 2, N = 3, S = 4, G = 5, B = 6, R = 7, K = 8, TO = 9, NY = 10, NK = 11, NG = 12, UM = 13, RY = 14
export const HAND_TYPES = [R, B, G, S, N, L, P]          // order shown in the hand
export const PROMOTE: Record<number, number> = { [P]: TO, [L]: NY, [N]: NK, [S]: NG, [B]: UM, [R]: RY }
export const UNPROMOTE: Record<number, number> = { [TO]: P, [NY]: L, [NK]: N, [NG]: S, [UM]: B, [RY]: R }
export const base = (t: number): number => UNPROMOTE[t] ?? t
export const isPromoted = (t: number): boolean => t >= TO
// file names in lishogi's piece files
export const CODE: Record<number, string> = { [P]: 'FU', [L]: 'KY', [N]: 'KE', [S]: 'GI', [G]: 'KI', [B]: 'KA', [R]: 'HI', [K]: 'OU', [TO]: 'TO', [NY]: 'NY', [NK]: 'NK', [NG]: 'NG', [UM]: 'UM', [RY]: 'RY' }
export const LETTER: Record<number, string> = { [P]: 'P', [L]: 'L', [N]: 'N', [S]: 'S', [G]: 'G', [B]: 'B', [R]: 'R', [K]: 'K', [TO]: '+P', [NY]: '+L', [NK]: '+N', [NG]: '+S', [UM]: '+B', [RY]: '+R' }
export const NAME: Record<number, string> = { [P]: 'Pawn', [L]: 'Lance', [N]: 'Knight', [S]: 'Silver', [G]: 'Gold', [B]: 'Bishop', [R]: 'Rook', [K]: 'King', [TO]: 'Tokin', [NY]: 'Promoted lance', [NK]: 'Promoted knight', [NG]: 'Promoted silver', [UM]: 'Horse', [RY]: 'Dragon' }
const SFEN_CH: Record<number, string> = { [P]: 'p', [L]: 'l', [N]: 'n', [S]: 's', [G]: 'g', [B]: 'b', [R]: 'r', [K]: 'k' }
const SFEN_T: Record<string, number> = { p: P, l: L, n: N, s: S, g: G, b: B, r: R, k: K }
export const VALUE: Record<number, number> = { [P]: 1, [L]: 3, [N]: 4, [S]: 5, [G]: 6, [B]: 8, [R]: 10, [K]: 0, [TO]: 6, [NY]: 6, [NK]: 6, [NG]: 6, [UM]: 11, [RY]: 13 }

export const START_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'

// ---- moves as ints: to (7 bits) | from (7 bits, 81 + type for a drop) << 7 | promo << 14 ----
export const mv = (from: number, to: number, promo = false): number => to | (from << 7) | (promo ? 1 << 14 : 0)
export const dropMv = (type: number, to: number): number => to | ((81 + type) << 7)
export const mTo = (m: number): number => m & 127
export const mFrom = (m: number): number => { const f = (m >> 7) & 127; return f >= 81 ? -1 : f }
export const mDrop = (m: number): number => { const f = (m >> 7) & 127; return f >= 81 ? f - 81 : 0 }
export const mPromo = (m: number): boolean => ((m >> 14) & 1) === 1

// directions as [drow, dcol], seen from Sente (forward = row - 1)
const GOLD_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]]
const SILVER_D = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]]
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
const KING_D = [...ORTH, ...DIAG]
const STEPS: Record<number, number[][]> = { [P]: [[-1, 0]], [N]: [[-2, -1], [-2, 1]], [S]: SILVER_D, [G]: GOLD_D, [K]: KING_D, [TO]: GOLD_D, [NY]: GOLD_D, [NK]: GOLD_D, [NG]: GOLD_D, [UM]: ORTH, [RY]: DIAG, [L]: [], [B]: [], [R]: [] }
const SLIDES: Record<number, number[][]> = { [L]: [[-1, 0]], [B]: DIAG, [R]: ORTH, [UM]: DIAG, [RY]: ORTH }

export const sqName = (sq: number): string => `${9 - (sq % 9)}${'abcdefghi'[Math.floor(sq / 9)]}`
export const sqOf = (s: string): number => (s.charCodeAt(1) - 97) * 9 + (9 - Number(s[0]))
const inZone = (side: number, row: number): boolean => (side === 0 ? row <= 2 : row >= 6)
// a piece that could never move again on this row (must promote / cannot be dropped there)
export function deadEnd(t: number, side: number, row: number): boolean {
	const r = side === 0 ? row : 8 - row
	if ((t === P || t === L) && r === 0) return true
	if (t === N && r <= 1) return true
	return false
}

export class Position {
	board = new Int8Array(81)
	hands: number[][] = [new Array(9).fill(0), new Array(9).fill(0)]
	turn = 0
	ply = 0
	private kings = [-1, -1]

	static start(): Position { return Position.fromSfen(START_SFEN) }
	static fromSfen(sfen: string): Position {
		const p = new Position()
		const [bd, side, hand, num] = sfen.trim().split(/\s+/)
		let row = 0, col = 0, promo = false
		for (const ch of bd) {
			if (ch === '/') { row++; col = 0; continue }
			if (ch === '+') { promo = true; continue }
			if (ch >= '1' && ch <= '9') { col += Number(ch); continue }
			let t = SFEN_T[ch.toLowerCase()]
			if (promo) t = PROMOTE[t]
			promo = false
			p.board[row * 9 + col] = ch === ch.toUpperCase() ? t : -t
			col++
		}
		p.turn = side === 'w' ? 1 : 0
		if (hand && hand !== '-') {
			let n = 0
			for (const ch of hand) {
				if (ch >= '0' && ch <= '9') { n = n * 10 + Number(ch); continue }
				const t = SFEN_T[ch.toLowerCase()]
				p.hands[ch === ch.toUpperCase() ? 0 : 1][t] += n || 1
				n = 0
			}
		}
		p.ply = Math.max(0, (Number(num) || 1) - 1)
		p.findKings()
		return p
	}
	private findKings(): void { this.kings = [-1, -1]; for (let i = 0; i < 81; i++) { const v = this.board[i]; if (v === K) this.kings[0] = i; else if (v === -K) this.kings[1] = i } }
	king(side: number): number { return this.kings[side] }

	sfen(withPly = true): string {
		let s = ''
		for (let r = 0; r < 9; r++) {
			let empty = 0
			for (let c = 0; c < 9; c++) {
				const v = this.board[r * 9 + c]
				if (!v) { empty++; continue }
				if (empty) { s += empty; empty = 0 }
				const t = Math.abs(v), b0 = base(t)
				const ch = (t !== b0 ? '+' : '') + SFEN_CH[b0]
				s += v > 0 ? ch.toUpperCase() : ch
			}
			if (empty) s += empty
			if (r < 8) s += '/'
		}
		let hand = ''
		for (const side of [0, 1]) for (const t of HAND_TYPES) {
			const n = this.hands[side][t]
			if (!n) continue
			hand += (n > 1 ? n : '') + (side === 0 ? SFEN_CH[t].toUpperCase() : SFEN_CH[t])
		}
		return `${s} ${this.turn ? 'w' : 'b'} ${hand || '-'}${withPly ? ' ' + (this.ply + 1) : ''}`
	}
	key(): string { return this.sfen(false) }

	clone(): Position {
		const p = new Position()
		p.board.set(this.board); p.hands = [this.hands[0].slice(), this.hands[1].slice()]; p.turn = this.turn; p.ply = this.ply; p.kings = this.kings.slice()
		return p
	}

	pieceSide(sq: number): number { const v = this.board[sq]; return v > 0 ? 0 : v < 0 ? 1 : -1 }

	// is square sq attacked by a piece of `by`?
	attacked(sq: number, by: number): boolean {
		const b = this.board, r0 = Math.floor(sq / 9), c0 = sq % 9
		const sgn = by === 0 ? 1 : -1
		const fw = by === 0 ? 1 : -1          // an attacker of `by` stands "behind" in its own forward direction: rows grow for Sente's attackers
		// knights
		for (const dc of [-1, 1]) {
			const r = r0 + 2 * fw, c = c0 + dc
			if (r >= 0 && r < 9 && c >= 0 && c < 9 && b[r * 9 + c] === sgn * N) return true
		}
		for (const [dr, dc] of KING_D) {
			let r = r0 + dr, c = c0 + dc, dist = 1
			while (r >= 0 && r < 9 && c >= 0 && c < 9) {
				const v = b[r * 9 + c]
				if (v) {
					if ((v > 0) === (by === 0)) {
						const t = Math.abs(v)
						// the attacker moves from (r, c) by (-dr, -dc); in its own view that is (-dr * fw', ...)
						const ar = by === 0 ? -dr : dr, ac = by === 0 ? -dc : dc
						if (dist === 1 && STEPS[t].some((d) => d[0] === ar && d[1] === ac)) return true
						if (SLIDES[t] && SLIDES[t].some((d) => d[0] === ar && d[1] === ac)) return true
					}
					break
				}
				r += dr; c += dc; dist++
			}
		}
		return false
	}
	inCheck(side = this.turn): boolean { const k = this.kings[side]; return k >= 0 && this.attacked(k, 1 - side) }

	// all moves without the king-safety test
	pseudo(out: number[] = [], onlyChecks = false): number[] {
		const b = this.board, side = this.turn, sgn = side === 0 ? 1 : -1, fl = side === 0 ? 1 : -1
		for (let sq = 0; sq < 81; sq++) {
			const v = b[sq]
			if (!v || (v > 0) !== (side === 0)) continue
			const t = Math.abs(v), r0 = Math.floor(sq / 9), c0 = sq % 9
			const canP = PROMOTE[t] !== undefined
			const add = (to: number) => {
				const tr = Math.floor(to / 9)
				if (canP && (inZone(side, r0) || inZone(side, tr))) {
					out.push(mv(sq, to, true))
					if (!deadEnd(t, side, tr)) out.push(mv(sq, to, false))
				} else out.push(mv(sq, to, false))
			}
			for (const [dr0, dc0] of STEPS[t]) {
				const r = r0 + dr0 * fl, c = c0 + dc0 * fl
				if (r < 0 || r > 8 || c < 0 || c > 8) continue
				const w = b[r * 9 + c]
				if (w && (w > 0) === (side === 0)) continue
				add(r * 9 + c)
			}
			const sl = SLIDES[t]
			if (sl) for (const [dr0, dc0] of sl) {
				const dr = dr0 * fl, dc = dc0 * fl
				let r = r0 + dr, c = c0 + dc
				while (r >= 0 && r < 9 && c >= 0 && c < 9) {
					const w = b[r * 9 + c]
					if (w && (w > 0) === (side === 0)) break
					add(r * 9 + c)
					if (w) break
					r += dr; c += dc
				}
			}
		}
		const hand = this.hands[side]
		let pawnFiles = 0
		if (hand[P]) for (let sq = 0; sq < 81; sq++) if (b[sq] === sgn * P) pawnFiles |= 1 << (sq % 9)
		for (const t of HAND_TYPES) {
			if (!hand[t]) continue
			for (let sq = 0; sq < 81; sq++) {
				if (b[sq]) continue
				const row = Math.floor(sq / 9)
				if (deadEnd(t, side, row)) continue
				if (t === P && pawnFiles & (1 << (sq % 9))) continue
				out.push(dropMv(t, sq))
			}
		}
		if (onlyChecks) return out
		return out
	}

	// make a move; returns what is needed to take it back
	make(m: number): number {
		const b = this.board, side = this.turn, sgn = side === 0 ? 1 : -1, to = mTo(m)
		const d = mDrop(m)
		let undo = 0
		if (d) {
			b[to] = sgn * d
			this.hands[side][d]--
		} else {
			const from = mFrom(m), v = b[from], cap = b[to]
			if (cap) { this.hands[side][base(Math.abs(cap))]++; undo = cap + 64 }
			const t = Math.abs(v)
			b[to] = mPromo(m) ? sgn * PROMOTE[t] : v
			b[from] = 0
			if (t === K) this.kings[side] = to
			if (cap === K || cap === -K) this.kings[1 - side] = -1
		}
		this.turn = 1 - side
		this.ply++
		return undo
	}
	unmake(m: number, undo: number): void {
		this.turn = 1 - this.turn
		this.ply--
		const b = this.board, side = this.turn, to = mTo(m), d = mDrop(m)
		if (d) { b[to] = 0; this.hands[side][d]++; return }
		const from = mFrom(m), v = b[to], sgn = side === 0 ? 1 : -1
		b[from] = mPromo(m) ? sgn * UNPROMOTE[Math.abs(v)] : v
		const cap = undo ? undo - 64 : 0
		b[to] = cap
		if (cap) this.hands[side][base(Math.abs(cap))]--
		if (Math.abs(b[from]) === K) this.kings[side] = from
		if (cap === K || cap === -K) this.kings[1 - side] = to
	}

	// legal moves (own king safe; no mate by a dropped pawn)
	legal(): number[] {
		const out: number[] = []
		const side = this.turn
		for (const m of this.pseudo()) {
			const u = this.make(m)
			let ok = !this.inCheck(side)
			if (ok && mDrop(m) === P && this.inCheck(this.turn) && !this.hasLegal()) ok = false
			this.unmake(m, u)
			if (ok) out.push(m)
		}
		return out
	}
	hasLegal(): boolean {
		const side = this.turn
		for (const m of this.pseudo()) {
			const u = this.make(m)
			const ok = !this.inCheck(side)
			this.unmake(m, u)
			if (ok) return true          // (a pawn-drop mate would only matter for the side that is mated here: their pawn drop cannot mate us back in one)
		}
		return false
	}
	isLegal(m: number): boolean { return this.legal().includes(m) }
	givesCheck(m: number): boolean { const u = this.make(m); const c = this.inCheck(this.turn); this.unmake(m, u); return c }
	captured(m: number): number { return mDrop(m) ? 0 : this.board[mTo(m)] }

	// ---- USI ----
	toUsi(m: number): string {
		const d = mDrop(m)
		if (d) return `${SFEN_CH[d].toUpperCase()}*${sqName(mTo(m))}`
		return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? '+' : '')
	}
	fromUsi(u: string): number {
		if (u[1] === '*') return dropMv(SFEN_T[u[0].toLowerCase()], sqOf(u.slice(2, 4)))
		return mv(sqOf(u.slice(0, 2)), sqOf(u.slice(2, 4)), u[4] === '+')
	}

	// Western notation like lishogi: P-7f, Bx2b+, S*5e, G73-7b (origin only when needed)
	notation(m: number): string {
		const d = mDrop(m), to = mTo(m)
		if (d) return `${LETTER[d]}*${sqName(to)}`
		const from = mFrom(m), v = this.board[from], t = Math.abs(v)
		const cap = this.board[to] !== 0
		let amb = false
		for (const o of this.legal()) if (mFrom(o) >= 0 && mFrom(o) !== from && mTo(o) === to && this.board[mFrom(o)] === v) amb = true
		let s = LETTER[t] + (amb ? sqName(from) : '') + (cap ? 'x' : '-') + sqName(to)
		const tr = Math.floor(to / 9), fr = Math.floor(from / 9)
		if (mPromo(m)) s += '+'
		else if (PROMOTE[t] !== undefined && (inZone(this.turn, tr) || inZone(this.turn, fr))) s += '='
		return s
	}
}

// ---- a game: positions, moves, end ----
export type Result = { winner: number; reason: string } | null          // winner -1 = draw
export class Game {
	start: string
	pos: Position
	moves: number[] = []
	usi: string[] = []
	sans: string[] = []
	keys: string[] = []
	checks: boolean[] = []          // after move i, was the side to move in check
	result: Result = null
	constructor(sfen = START_SFEN) { this.start = sfen; this.pos = Position.fromSfen(sfen); this.keys.push(this.pos.key()) }
	static fromUsi(sfen: string, usi: string[]): Game { const g = new Game(sfen); for (const u of usi) g.play(g.pos.fromUsi(u)); return g }
	play(m: number): boolean {
		if (this.result || !this.pos.isLegal(m)) return false
		this.sans.push(this.pos.notation(m))
		this.usi.push(this.pos.toUsi(m))
		this.pos.make(m)
		this.moves.push(m)
		const chk = this.pos.inCheck()
		this.checks.push(chk)
		this.keys.push(this.pos.key())
		if (!this.pos.hasLegal()) this.result = { winner: 1 - this.pos.turn, reason: chk ? 'checkmate' : 'no moves' }
		else this.checkRepetition()
		return true
	}
	// four times the same position: draw, unless one side checked all the time (that side loses)
	private checkRepetition(): void {
		const k = this.keys[this.keys.length - 1]
		const idx: number[] = []
		this.keys.forEach((x, i) => { if (x === k) idx.push(i) })
		if (idx.length < 4) return
		const first = idx[idx.length - 4], last = this.keys.length - 1
		// positions first..last; moves first..last-1 (move j leads to keys[j + 1])
		const checker = [true, true]
		for (let j = first; j < last; j++) {
			// side that made move j: the side to move at keys[j]
			const sideToMoveAtJ = (this.pos.turn + (last - j)) % 2          // pos.turn is the side to move at `last`
			if (!this.checks[j]) checker[sideToMoveAtJ] = false
		}
		if (checker[0] && !checker[1]) this.result = { winner: 1, reason: 'perpetual check' }
		else if (checker[1] && !checker[0]) this.result = { winner: 0, reason: 'perpetual check' }
		else this.result = { winner: -1, reason: 'repetition' }
	}
	positionAt(ply: number): Position { const p = Position.fromSfen(this.start); for (let i = 0; i < ply; i++) p.make(this.moves[i]); return p }
	usiPosition(ply = this.moves.length): string {
		const mv = this.usi.slice(0, ply)
		return (this.start === START_SFEN ? 'position startpos' : `position sfen ${this.start}`) + (mv.length ? ' moves ' + mv.join(' ') : '')
	}
}
