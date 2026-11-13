// The connection to the server (/ws): connects again by itself after a drop, says hello with the device id, name and piece looks.
import { settings, deviceId } from './settings'

type Handler = (m: any) => void
class Online {
	ws: WebSocket | null = null
	connected = false
	you = ''
	rating = 1500
	games = 0
	lastLobby: any = null
	private handlers = new Map<string, Set<Handler>>()
	private retry = 0
	private ping = 0
	private wanted = false
	private queue: unknown[] = []

	connect(): void {
		this.wanted = true
		if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
		const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
		let ws: WebSocket
		try { ws = new WebSocket(url) } catch { this.later(); return }
		this.ws = ws
		ws.onopen = () => {
			this.retry = 0
			ws.send(JSON.stringify({ t: 'hello', id: deviceId(), name: settings.name, looks: settings.looks }))
			clearInterval(this.ping)
			this.ping = window.setInterval(() => this.send({ t: 'ping' }), 25000)
		}
		ws.onmessage = (e) => {
			let m: any
			try { m = JSON.parse(e.data) } catch { return }
			if (m.t === 'welcome') {
				this.you = m.you; this.rating = m.rating; this.games = m.games; this.connected = true
				for (const q of this.queue.splice(0)) this.send(q)
			}
			if (m.t === 'lobby') this.lastLobby = m
			this.emit(m.t, m)
			this.emit('*', m)
		}
		ws.onclose = (e) => {
			this.connected = false
			clearInterval(this.ping)
			this.emit('status', { connected: false })
			if (e.code === 4000) { this.wanted = false; this.emit('replaced', {}); return }
			this.later()
		}
		ws.onerror = () => { /* onclose follows */ }
	}
	private later(): void {
		if (!this.wanted) return
		const wait = Math.min(8000, 500 * Math.pow(1.7, this.retry++))
		setTimeout(() => this.connect(), wait)
	}
	send(m: unknown): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN && (this.connected || (m as any).t === 'hello')) this.ws.send(JSON.stringify(m))
		else { this.queue.push(m); this.connect() }
	}
	on(t: string, f: Handler): () => void {
		let s = this.handlers.get(t)
		if (!s) { s = new Set(); this.handlers.set(t, s) }
		s.add(f)
		return () => s!.delete(f)
	}
	private emit(t: string, m: unknown): void { for (const f of this.handlers.get(t) ?? []) f(m) }
}
export const online = new Online()
// reconnect quickly when the tab comes back or the network returns
document.addEventListener('visibilitychange', () => { if (!document.hidden && (online as any).wanted) online.connect() })
window.addEventListener('online', () => { if ((online as any).wanted) online.connect() })
