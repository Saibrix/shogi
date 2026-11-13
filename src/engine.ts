// YaneuraOu (WebAssembly build by mizar, NNUE K-P evaluation built in, GPLv3) as a USI engine in the page.
// It needs SharedArrayBuffer (the page is cross-origin isolated by the Worker's headers). If it cannot start, the small own bot (bot.ts) plays.
export interface Info { depth: number; multipv: number; cp: number; mate: number | null; pv: string[]; nodes: number }
export interface SearchResult { best: string; infos: Info[] }
export interface Limits { movetime?: number; depth?: number; nodes?: number; multipv?: number }

let mod: any = null
let starting: Promise<boolean> | null = null
let listeners: ((line: string) => void)[] = []
let busy: Promise<unknown> = Promise.resolve()
let searching = false
export let engineName = 'YaneuraOu'
export let engineError = ''

function loadScript(src: string): Promise<void> {
	return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + src)); document.head.append(s) })
}
function waitFor(prefix: string, send?: string): Promise<string> {
	return new Promise((res) => {
		const f = (line: string) => { if (line.startsWith(prefix)) { listeners = listeners.filter((x) => x !== f); res(line) } }
		listeners.push(f)
		if (send) mod.postMessage(send)
	})
}
export function engineAvailable(): boolean { return typeof SharedArrayBuffer !== 'undefined' && (self as any).crossOriginIsolated !== false && typeof WebAssembly === 'object' }
export function startEngine(): Promise<boolean> {
	if (starting) return starting
	starting = (async () => {
		if (!engineAvailable()) { engineError = 'This browser cannot run the engine (no SharedArrayBuffer).'; return false }
		try {
			await loadScript('engine/yaneuraou.k-p.js')
			const factory = (self as any).YaneuraOu_K_P
			mod = await Promise.race([factory({ locateFile: (f: string) => 'engine/' + f }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))])
			mod.addMessageListener((line: string) => { for (const f of listeners.slice()) f(line) })
			const threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
			await waitFor('usiok', 'usi')
			mod.postMessage('setoption name USI_Hash value 64')
			mod.postMessage(`setoption name Threads value ${threads}`)
			mod.postMessage('setoption name PvInterval value 0')
			mod.postMessage('setoption name NetworkDelay value 0')
			mod.postMessage('setoption name NetworkDelay2 value 0')
			mod.postMessage('setoption name MinimumThinkingTime value 0')
			mod.postMessage('setoption name BookFile value no_book')
			mod.postMessage('setoption name ConsiderationMode value true')
			mod.postMessage('setoption name OutputFailLHPV value false')
			await waitFor('readyok', 'isready')
			mod.postMessage('usinewgame')
			return true
		} catch (e) {
			engineError = 'The engine could not start: ' + (e as Error).message
			console.warn(engineError)
			return false
		}
	})()
	return starting
}

function parseInfo(line: string): Info | null {
	if (!line.startsWith('info ') || !line.includes(' pv ')) return null
	const t = line.split(' ')
	const i: Info = { depth: 0, multipv: 1, cp: 0, mate: null, pv: [], nodes: 0 }
	for (let k = 1; k < t.length; k++) {
		const w = t[k]
		if (w === 'depth') i.depth = Number(t[++k])
		else if (w === 'multipv') i.multipv = Number(t[++k])
		else if (w === 'nodes') i.nodes = Number(t[++k])
		else if (w === 'score') {
			const kind = t[++k], v = t[++k]
			if (kind === 'cp') i.cp = Number(v)
			else if (kind === 'mate') { const n = v === '+' || v === '+0' ? 1 : v === '-' || v === '-0' ? -1 : Number(v); i.mate = n; i.cp = n > 0 ? 30000 - n : -30000 - n }
			if (t[k + 1] === 'lowerbound' || t[k + 1] === 'upperbound') k++
		} else if (w === 'pv') { i.pv = t.slice(k + 1); break }
	}
	return i
}

// One search at a time; a new one stops the old one first. onInfo gets every PV line while it thinks.
export function search(position: string, lim: Limits, onInfo?: (i: Info) => void): Promise<SearchResult | null> {
	const run = async (): Promise<SearchResult | null> => {
		if (!(await startEngine())) return null
		const infos: Info[] = []
		const f = (line: string) => { const i = parseInfo(line); if (i) { infos[i.multipv - 1] = i; onInfo?.(i) } }
		listeners.push(f)
		mod.postMessage(`setoption name MultiPV value ${lim.multipv ?? 1}`)
		await waitFor('readyok', 'isready')
		mod.postMessage(position)
		let go = 'go'
		if (lim.depth) go += ` depth ${lim.depth}`
		if (lim.nodes) go += ` nodes ${lim.nodes}`
		if (lim.movetime) go += ` movetime ${lim.movetime}`
		if (!lim.depth && !lim.nodes && !lim.movetime) go += ' infinite'
		searching = true
		const line = await waitFor('bestmove', go)
		searching = false
		listeners = listeners.filter((x) => x !== f)
		return { best: line.split(' ')[1], infos: infos.filter(Boolean) }
	}
	if (searching && mod) mod.postMessage('stop')
	const p = busy.then(run, run)
	busy = p.catch(() => null)
	return p
}
export function stopSearch(): void { if (searching && mod) mod.postMessage('stop') }
