// Rule tests: perft from the start (known numbers) and a few special rules. Run: node tools/run.mjs test_rules
import { Position, Game, START_SFEN } from '../src/rules'

function perft(p: Position, d: number): number {
	if (d === 0) return 1
	const ms = p.legal()
	if (d === 1) return ms.length
	let n = 0
	for (const m of ms) { const u = p.make(m); n += perft(p, d - 1); p.unmake(m, u) }
	return n
}
const want = [30, 900, 25470, 719731]
const p = Position.start()
for (let d = 1; d <= 4; d++) {
	const t = Date.now(), n = perft(p, d)
	console.log(`perft ${d}: ${n} ${n === want[d - 1] ? 'ok' : 'WRONG (want ' + want[d - 1] + ')'} ${Date.now() - t} ms`)
}
console.log('sfen round trip', p.sfen() === START_SFEN ? 'ok' : 'WRONG ' + p.sfen())
// pawn drop mate is illegal: gote king 1a, sente gold 1c? -> P*1b would be mate if protected
const q = Position.fromSfen('7nk/9/8G/9/9/9/9/9/K8 b P 1')
const pd = q.legal().map((m) => q.toUsi(m))
console.log('no pawn-drop mate', !pd.includes('P*1b') ? 'ok' : 'WRONG')
const q2 = Position.fromSfen('8k/9/9/9/9/9/9/9/K8 b P 1')
console.log('pawn drop check allowed', q2.legal().map((m) => q2.toUsi(m)).includes('P*1b') ? 'ok' : 'WRONG')
// nifu
const q3 = Position.fromSfen('4k4/9/9/9/9/9/4P4/9/4K4 b P 1')
console.log('nifu', !q3.legal().map((m) => q3.toUsi(m)).includes('P*5e') ? 'ok' : 'WRONG')
// a mate: fool's-mate-like position
const g = Game.fromUsi('8k/9/7G1/9/9/9/9/9/K8 b G 1', ['G*1b'])
console.log('mate detected', g.result?.reason === 'checkmate' && g.result.winner === 0 ? 'ok' : 'WRONG ' + JSON.stringify(g.result))
// notation
const s = Position.start()
console.log('notation', s.notation(s.fromUsi('7g7f')), s.notation(s.fromUsi('2h2f')))
// repetition: kings shuffle
const r = new Game('4k4/9/9/9/9/9/9/9/4K4 b - 1')
for (let i = 0; i < 3; i++) for (const u of ['5i5h', '5a5b', '5h5i', '5b5a']) r.play(r.pos.fromUsi(u))
console.log('repetition', r.result?.reason === 'repetition' ? 'ok' : 'WRONG ' + JSON.stringify(r.result))

