// The Worker: serves the page (static files from ../dist) and the online part (/ws) through one Durable Object "Lobby".
// The Lobby knows who is online, passes challenges on, runs the games with the clock and checks every move with the same rules as the page.
//
// client -> server: hello {id, name, looks} | name {name} | looks {looks} | seek {time} | unseek | challenge {to, time, color} | cancel {cid}
//                   accept {cid} | decline {cid} | move {gid, usi, ply} | resign {gid} | draw {gid} | abort {gid} | rematch {gid} | ping
// server -> client: welcome {you, rating} | lobby {players, seeks} | challenge {...} | challengeGone {cid, why} | game {...} | move {...}
//                   end {gid, result, ratings} | opp {gid, online} | drawOffer {gid} | rematchOffer {gid} | error {text} | pong
import { Game } from '../../src/rules'

export interface Env { ASSETS: { fetch: (r: Request) => Promise<Response> }; LOBBY: DurableObjectNamespace }

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url)
		if (url.pathname === '/ws') {
			const id = env.LOBBY.idFromName('lobby')
			return env.LOBBY.get(id).fetch(req)
		}
		if (url.pathname === '/health') return new Response('ok')
		return env.ASSETS.fetch(req)
	},
}

interface TimeCtl { base: number; inc: number; byo: number }          // minutes, seconds, seconds
interface Player { id: string; name: string; looks: unknown; ws: WebSocket | null; rating: number; games: number; seen: number; game: string | null }
interface Challenge { cid: string; from: string; to: string | null; time: TimeCtl; color: string; at: number }
interface Live {
	gid: string; ids: [string, string]; names: [string, string]; time: TimeCtl; usi: string[]
	clocks: [number, number]; turnStart: number; result: { winner: number; reason: string } | null
	drawOffer: number; rematch: number; rated: boolean; created: number; gone: [number, number]
}

const clean = (s: unknown, n = 20) => String(s ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, n)
const rid = () => Math.random().toString(36).slice(2, 10)
const DISCONNECT_LOSS_MS = 90_000
const FIRST_MOVE_MS = 40_000

export class Lobby {
	state: DurableObjectState
	players = new Map<string, Player>()
	challenges = new Map<string, Challenge>()
	games = new Map<string, Live>()
	timers = new Map<string, ReturnType<typeof setTimeout>>()
	loaded: Promise<void>

	constructor(state: DurableObjectState) {
		this.state = state
		this.loaded = (async () => {
			const g = await state.storage.list<Live>({ prefix: 'game:' })
			for (const [, v] of g) if (!v.result) { this.games.set(v.gid, v); this.arm(v) }
		})()
	}

	async fetch(req: Request): Promise<Response> {
		await this.loaded
		if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
		const pair = new WebSocketPair()
		const ws = pair[1]
		ws.accept()
		let me: Player | null = null
		let count = 0, windowStart = Date.now()
		ws.addEventListener('message', async (e) => {
			const now = Date.now()
			if (now - windowStart > 10_000) { windowStart = now; count = 0 }
			if (++count > 80) return          // too many messages
			let m: any
			try { m = JSON.parse(String(e.data)) } catch { return }
			if (m.t === 'ping') { this.send(ws, { t: 'pong' }); return }
			if (m.t === 'hello') { me = await this.hello(ws, m); return }
			if (!me) return
			try { await this.handle(me, m) } catch (err) { this.send(ws, { t: 'error', text: String(err) }) }
		})
		const bye = () => {
			if (!me || me.ws !== ws) return
			me.ws = null; me.seen = Date.now()
			for (const [cid, c] of this.challenges) if (c.from === me.id) { this.challenges.delete(cid); if (c.to) this.toId(c.to, { t: 'challengeGone', cid, why: 'gone' }) }
			if (me.game) { const g = this.games.get(me.game); if (g && !g.result) { const s = g.ids.indexOf(me.id); g.gone[s] = Date.now(); this.toId(g.ids[1 - s], { t: 'opp', gid: g.gid, online: false }); this.arm(g) } }
			this.broadcastLobby()
		}
		ws.addEventListener('close', bye)
		ws.addEventListener('error', bye)
		return new Response(null, { status: 101, webSocket: pair[0] })
	}

	send(ws: WebSocket | null, m: unknown): void { try { ws?.send(JSON.stringify(m)) } catch { /* closed */ } }
	toId(id: string, m: unknown): void { this.send(this.players.get(id)?.ws ?? null, m) }

	async hello(ws: WebSocket, m: any): Promise<Player> {
		const id = String(m.id ?? '').replace(/[^a-f0-9]/g, '').slice(0, 32) || rid()
		let p = this.players.get(id)
		if (!p) {
			const saved = await this.state.storage.get<{ rating: number; games: number }>('p:' + id)
			p = { id, name: '', looks: null, ws: null, rating: saved?.rating ?? 1500, games: saved?.games ?? 0, seen: Date.now(), game: null }
			this.players.set(id, p)
		}
		if (p.ws && p.ws !== ws) { try { p.ws.close(4000, 'opened elsewhere') } catch { /* ignore */ } }
		p.ws = ws
		p.name = clean(m.name) || 'Guest' + id.slice(0, 4)
		p.looks = sanitizeLooks(m.looks)
		this.send(ws, { t: 'welcome', you: id, name: p.name, rating: Math.round(p.rating), games: p.games })
		// a running game: back into it
		for (const g of this.games.values()) if (!g.result && g.ids.includes(id)) {
			p.game = g.gid
			const s = g.ids.indexOf(id)
			g.gone[s] = 0
			this.sendGame(g, id)
			this.toId(g.ids[1 - s], { t: 'opp', gid: g.gid, online: true })
		}
		this.broadcastLobby()
		return p
	}

	lobbyView(): unknown {
		const players = [...this.players.values()].filter((p) => p.ws).map((p) => ({ id: p.id, name: p.name, rating: Math.round(p.rating), games: p.games, playing: !!(p.game && this.games.get(p.game) && !this.games.get(p.game)!.result) }))
		const seeks = [...this.challenges.values()].filter((c) => !c.to).map((c) => ({ cid: c.cid, from: c.from, name: this.players.get(c.from)?.name ?? '?', rating: Math.round(this.players.get(c.from)?.rating ?? 1500), time: c.time, color: c.color }))
		return { t: 'lobby', players, seeks }
	}
	broadcastLobby(): void {
		const v = JSON.stringify(this.lobbyView())
		for (const p of this.players.values()) if (p.ws) { try { p.ws.send(v) } catch { /* closed */ } }
	}

	async handle(me: Player, m: any): Promise<void> {
		switch (m.t) {
			case 'name': me.name = clean(m.name) || me.name; this.broadcastLobby(); return
			case 'looks': me.looks = sanitizeLooks(m.looks); if (me.game) { const g = this.games.get(me.game); if (g) this.toId(g.ids[1 - g.ids.indexOf(me.id)], { t: 'looks', gid: g.gid, side: g.ids.indexOf(me.id), looks: me.looks }) } return
			case 'seek': case 'challenge': {
				if (me.game && this.games.get(me.game) && !this.games.get(me.game)!.result) { this.send(me.ws, { t: 'error', text: 'Finish your game first.' }); return }
				const time = sanitizeTime(m.time)
				const to = m.t === 'challenge' ? String(m.to) : null
				if (to && (!this.players.get(to)?.ws || to === me.id)) { this.send(me.ws, { t: 'error', text: 'That player is not online.' }); return }
				for (const [cid, c] of this.challenges) if (c.from === me.id && c.to === to) this.challenges.delete(cid)
				const c: Challenge = { cid: rid(), from: me.id, to, time, color: ['sente', 'gote'].includes(m.color) ? m.color : 'random', at: Date.now() }
				this.challenges.set(c.cid, c)
				this.send(me.ws, { t: 'challengeSent', cid: c.cid, to, time })
				if (to) this.toId(to, { t: 'challenge', cid: c.cid, from: me.id, name: me.name, rating: Math.round(me.rating), time, color: c.color })
				this.broadcastLobby()
				return
			}
			case 'unseek': for (const [cid, c] of this.challenges) if (c.from === me.id && !c.to) this.challenges.delete(cid); this.broadcastLobby(); return
			case 'cancel': { const c = this.challenges.get(m.cid); if (c && c.from === me.id) { this.challenges.delete(c.cid); if (c.to) this.toId(c.to, { t: 'challengeGone', cid: c.cid, why: 'cancelled' }); this.broadcastLobby() } return }
			case 'decline': { const c = this.challenges.get(m.cid); if (c && c.to === me.id) { this.challenges.delete(c.cid); this.toId(c.from, { t: 'challengeGone', cid: c.cid, why: 'declined' }) } return }
			case 'accept': {
				const c = this.challenges.get(m.cid)
				if (!c || (c.to && c.to !== me.id) || c.from === me.id) { this.send(me.ws, { t: 'error', text: 'That challenge is gone.' }); return }
				const other = this.players.get(c.from)
				if (!other?.ws) { this.challenges.delete(c.cid); this.send(me.ws, { t: 'error', text: 'The other player left.' }); return }
				this.challenges.delete(c.cid)
				// no other challenges of these two any more
				for (const [cid, x] of this.challenges) if (x.from === me.id || x.from === other.id) this.challenges.delete(cid)
				let senteIsFrom = c.color === 'sente' ? true : c.color === 'gote' ? false : Math.random() < 0.5
				await this.startGame(senteIsFrom ? other : me, senteIsFrom ? me : other, c.time)
				return
			}
			case 'move': return this.move(me, m)
			case 'resign': { const g = this.mine(me, m.gid); if (g) await this.finish(g, { winner: 1 - g.ids.indexOf(me.id), reason: 'resignation' }); return }
			case 'abort': { const g = this.mine(me, m.gid); if (g && g.usi.length < 2) await this.finish(g, { winner: -1, reason: 'aborted' }); return }
			case 'draw': {
				const g = this.mine(me, m.gid); if (!g) return
				const s = g.ids.indexOf(me.id)
				if (g.drawOffer === (1 - s) + 1) await this.finish(g, { winner: -1, reason: 'agreement' })
				else { g.drawOffer = s + 1; this.toId(g.ids[1 - s], { t: 'drawOffer', gid: g.gid }) }
				return
			}
			case 'declineDraw': { const g = this.mine(me, m.gid); if (g) { g.drawOffer = 0; this.toId(g.ids[1 - g.ids.indexOf(me.id)], { t: 'drawDeclined', gid: g.gid }) } return }
			case 'rematch': {
				const g = this.games.get(m.gid) ?? (await this.state.storage.get<Live>('game:' + m.gid))
				if (!g || !g.result || !g.ids.includes(me.id)) return
				const s = g.ids.indexOf(me.id)
				const other = this.players.get(g.ids[1 - s])
				if (!other?.ws) { this.send(me.ws, { t: 'error', text: 'Your opponent left.' }); return }
				if (g.rematch === (1 - s) + 1) { g.rematch = 0; await this.startGame(this.players.get(g.ids[1])!, this.players.get(g.ids[0])!, g.time) }
				else { g.rematch = s + 1; this.games.set(g.gid, g); this.toId(other.id, { t: 'rematchOffer', gid: g.gid }) }
				return
			}
		}
	}

	mine(me: Player, gid: string): Live | null { const g = this.games.get(gid); return g && !g.result && g.ids.includes(me.id) ? g : null }

	async startGame(sente: Player, gote: Player, time: TimeCtl): Promise<void> {
		const ms = time.base * 60_000
		const g: Live = { gid: rid(), ids: [sente.id, gote.id], names: [sente.name, gote.name], time, usi: [], clocks: [ms, ms], turnStart: Date.now(), result: null, drawOffer: 0, rematch: 0, rated: true, created: Date.now(), gone: [0, 0] }
		this.games.set(g.gid, g)
		sente.game = g.gid; gote.game = g.gid
		await this.state.storage.put('game:' + g.gid, g)
		for (const id of g.ids) this.sendGame(g, id)
		this.arm(g)
		this.broadcastLobby()
	}
	sendGame(g: Live, to: string): void {
		const ps = g.ids.map((id) => this.players.get(id))
		this.toId(to, { t: 'game', gid: g.gid, you: g.ids.indexOf(to), names: g.names, ratings: ps.map((p) => Math.round(p?.rating ?? 1500)), looks: ps.map((p) => p?.looks ?? null), time: g.time, usi: g.usi, clocks: this.clocksNow(g), turn: g.usi.length % 2, result: g.result, online: g.ids.map((id) => !!this.players.get(id)?.ws) })
	}
	clocksNow(g: Live): [number, number] {
		const c: [number, number] = [g.clocks[0], g.clocks[1]]
		if (!g.result && g.usi.length >= 2) c[g.usi.length % 2] -= Date.now() - g.turnStart
		return c
	}

	async move(me: Player, m: any): Promise<void> {
		const g = this.mine(me, m.gid)
		if (!g) return
		const side = g.usi.length % 2
		if (g.ids[side] !== me.id || Number(m.ply) !== g.usi.length) return
		const now = Date.now()
		// the clock (it starts with the second move, like lishogi)
		if (g.usi.length >= 2) {
			const used = now - g.turnStart
			if (!this.spend(g, side, used)) { await this.finish(g, { winner: 1 - side, reason: 'time' }); return }
		}
		const game = Game.fromUsi('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1', g.usi)
		let mv = 0
		try { mv = game.pos.fromUsi(String(m.usi)) } catch { return }
		if (!game.play(mv)) { this.send(me.ws, { t: 'error', text: 'Illegal move.' }); this.sendGame(g, me.id); return }
		g.usi.push(game.usi[game.usi.length - 1])
		if (g.usi.length > 2) g.clocks[side] += g.time.inc * 1000
		g.turnStart = now
		g.drawOffer = 0
		const msg = { t: 'move', gid: g.gid, usi: g.usi[g.usi.length - 1], ply: g.usi.length, clocks: this.clocksNow(g) }
		for (const id of g.ids) this.toId(id, msg)
		if (game.result) { await this.finish(g, game.result); return }
		await this.state.storage.put('game:' + g.gid, g)
		this.arm(g)
	}
	// takes the used time off a clock; with byoyomi the main time may run out, then each move must fit into the period
	spend(g: Live, side: number, used: number): boolean {
		const byo = g.time.byo * 1000
		if (g.clocks[side] >= used) { g.clocks[side] -= used; return true }
		const over = used - g.clocks[side]
		g.clocks[side] = 0
		return byo > 0 && over <= byo + 600          // (a little grace for the network)
	}
	// the timer of a game: flag, no first move, a player gone too long
	arm(g: Live): void {
		const old = this.timers.get(g.gid)
		if (old) clearTimeout(old)
		if (g.result) return
		const side = g.usi.length % 2
		let at: number
		if (g.usi.length < 2) at = g.turnStart + FIRST_MOVE_MS
		else at = g.turnStart + Math.max(0, g.clocks[side]) + g.time.byo * 1000 + 800
		for (const s of [0, 1]) if (g.gone[s]) at = Math.min(at, g.gone[s] + DISCONNECT_LOSS_MS)
		this.timers.set(g.gid, setTimeout(() => this.check(g), Math.max(50, at - Date.now())))
	}
	async check(g: Live): Promise<void> {
		if (g.result) return
		const now = Date.now(), side = g.usi.length % 2
		for (const s of [0, 1]) if (g.gone[s] && now - g.gone[s] >= DISCONNECT_LOSS_MS) { await this.finish(g, { winner: g.usi.length < 2 ? -1 : 1 - s, reason: g.usi.length < 2 ? 'aborted' : 'left the game' }); return }
		if (g.usi.length < 2) { if (now - g.turnStart >= FIRST_MOVE_MS) { await this.finish(g, { winner: -1, reason: 'aborted' }); return } }
		else if (now - g.turnStart > g.clocks[side] + g.time.byo * 1000 + 500) { g.clocks[side] = 0; await this.finish(g, { winner: 1 - side, reason: 'time' }); return }
		this.arm(g)
	}

	async finish(g: Live, result: { winner: number; reason: string }): Promise<void> {
		if (g.result) return
		g.result = result
		const t = this.timers.get(g.gid); if (t) clearTimeout(t)
		let ratings: number[] | null = null
		if (g.rated && result.reason !== 'aborted' && g.usi.length >= 2) {
			const ps = await Promise.all(g.ids.map(async (id) => this.players.get(id) ?? { id, rating: (await this.state.storage.get<{ rating: number }>('p:' + id))?.rating ?? 1500, games: 0 } as Player))
			const ea = 1 / (1 + Math.pow(10, (ps[1].rating - ps[0].rating) / 400))
			const sa = result.winner === 0 ? 1 : result.winner === 1 ? 0 : 0.5
			const k = (p: Player) => (p.games < 15 ? 40 : 24)
			const d0 = k(ps[0]) * (sa - ea), d1 = k(ps[1]) * ((1 - sa) - (1 - ea))
			ps[0].rating += d0; ps[1].rating += d1
			for (const p of ps) { p.games++; await this.state.storage.put('p:' + p.id, { rating: p.rating, games: p.games }) }
			ratings = ps.map((p) => Math.round(p.rating))
		}
		for (const id of g.ids) { const p = this.players.get(id); if (p && p.game === g.gid) p.game = null; this.toId(id, { t: 'end', gid: g.gid, result, clocks: g.clocks, ratings }) }
		await this.state.storage.put('game:' + g.gid, g)
		// finished games are kept a while for rematch, then dropped
		setTimeout(() => { this.games.delete(g.gid); this.state.storage.delete('game:' + g.gid) }, 10 * 60_000)
		this.broadcastLobby()
	}
}

function sanitizeTime(t: any): TimeCtl {
	const base = Math.max(0, Math.min(180, Number(t?.base) || 0)), inc = Math.max(0, Math.min(60, Number(t?.inc) || 0)), byo = Math.max(0, Math.min(120, Number(t?.byo) || 0))
	if (base === 0 && inc === 0 && byo === 0) return { base: 10, inc: 0, byo: 30 }
	return { base, inc, byo }
}
function sanitizeLooks(l: any): unknown {
	if (!l || typeof l !== 'object') return null
	const out: Record<string, { color: string | null; hit: number }> = {}
	for (const k of Object.keys(l).slice(0, 16)) {
		const v = l[k]
		const color = typeof v?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : null
		out[String(Number(k))] = { color, hit: Math.max(-1, Math.min(31, Math.floor(Number(v?.hit) || 0))) }
	}
	return out
}
