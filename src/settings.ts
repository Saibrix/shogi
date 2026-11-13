// Player settings, kept in the browser: name, piece set, board, sounds and the own look of every piece kind (colour + capture effect).
import { K, R, B, G, S, N, L, P } from './rules'

export const PIECE_SETS: { id: string; name: string; credit: string }[] = [
	{ id: 'ryoko_1kanji', name: 'Ryoko 1-kanji', credit: 'Ryoko_1Kanji by nexxogen, CC BY-SA 4.0' },
	{ id: 'kanji_light', name: 'Kanji light', credit: 'kanji_light by Ka-hu, CC BY 4.0' },
	{ id: '2kanji_3d', name: '2-kanji 3D', credit: '2Kanji_3D by Little-Mage and orangain, CC BY-SA 3.0' },
	{ id: 'international', name: 'International', credit: 'international by CouchTomato87, CC BY 4.0' },
]
export const BOARDS: { id: string; name: string; a: string; b: string; line: string }[] = [
	{ id: 'kaya', name: 'Kaya', a: '#f2cf86', b: '#e3b765', line: '#5c3d17' },
	{ id: 'light', name: 'Light wood', a: '#f6e2b3', b: '#ecd197', line: '#6d5634' },
	{ id: 'dark', name: 'Dark wood', a: '#b98a4e', b: '#9c6f38', line: '#2e1d0a' },
	{ id: 'slate', name: 'Slate', a: '#5b6578', b: '#4a5366', line: '#1d2230' },
	{ id: 'green', name: 'Green', a: '#9fbf8f', b: '#87aa77', line: '#2c3d22' },
]
export const KINDS = [K, R, B, G, S, N, L, P]
export interface PieceLook { color: string | null; hit: number }
export type Looks = Record<number, PieceLook>
export type EffectsMode = 'all' | 'mine' | 'simple' | 'off'

export interface Settings {
	name: string
	pieceSet: string
	board: string
	sound: boolean
	volume: number
	effects: EffectsMode
	coords: boolean
	looks: Looks
	confirmResign: boolean
}
const DEFAULT_LOOKS = (): Looks => Object.fromEntries(KINDS.map((k) => [k, { color: null, hit: 0 }])) as Looks
const KEY = 'shogi.settings.v1'
function load(): Settings {
	const d: Settings = { name: '', pieceSet: 'ryoko_1kanji', board: 'kaya', sound: true, volume: 0.8, effects: 'all', coords: true, looks: DEFAULT_LOOKS(), confirmResign: true }
	try {
		const raw = localStorage.getItem(KEY)
		if (raw) { const s = JSON.parse(raw); Object.assign(d, s); d.looks = { ...DEFAULT_LOOKS(), ...(s.looks ?? {}) } }
	} catch { /* private mode */ }
	return d
}
export const settings: Settings = load()
const listeners: (() => void)[] = []
export function onSettings(f: () => void): void { listeners.push(f) }
export function saveSettings(): void {
	try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* ignore */ }
	for (const f of listeners) f()
}
// small persistent values (ratings, stats, the device id)
export function store<T>(key: string, fallback: T): T { try { const v = localStorage.getItem('shogi.' + key); return v === null ? fallback : JSON.parse(v) } catch { return fallback } }
export function keep(key: string, v: unknown): void { try { localStorage.setItem('shogi.' + key, JSON.stringify(v)) } catch { /* ignore */ } }
export function deviceId(): string {
	let id = store<string>('device', '')
	if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); keep('device', id) }
	return id
}
