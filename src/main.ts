// The page: a small router (#/...) over the screens: home, online lobby + game, computer, puzzles, analysis, piece looks, settings, about.
import './style.css'
import { Game, Position, START_SFEN, K, R, B, G, S, N, L, P, NAME, base, mTo } from './rules'
import { GameView, resultText } from './gameview'
import { ShogiBoard, HIT, HIT_NAMES } from './board'
import { h, clear, toast, modal, refreshTheme } from './ui'
import { settings, saveSettings, PIECE_SETS, BOARDS, KINDS, store, keep, Looks, EffectsMode, myLooks, Settings } from './settings'
import { online } from './online'
import { botMove, LEVELS } from './bot'
import { Analyzer, gameFromText, fmtEval } from './analysis'
import { puzzleScreen } from './puzzles'
import { startEngine, engineAvailable } from './engine'
import { unlockAudio, playSound } from './sfx'
import { pieceImage, onPiecesLoaded, clearSprites } from './pieces'

const app = document.getElementById('app')!
let cleanup: (() => void) | null = null

// ---- header ----
const nav = h('nav', { class: 'top' },
	h('a', { href: '#/', class: 'logo' }, h('span', { class: 'logomark' }, '将'), h('span', { class: 'logotext' }, 'Shogi')),
	h('div', { class: 'links' },
		h('a', { href: '#/play' }, 'Play'),
		h('a', { href: '#/bot' }, 'Computer'),
		h('a', { href: '#/puzzles' }, 'Puzzles'),
		h('a', { href: '#/analysis' }, 'Analysis'),
		h('a', { href: '#/looks' }, 'Pieces'),
		h('a', { href: '#/settings', title: 'Settings' }, '⚙')),
	h('button', { class: 'themebtn', title: 'Light / dark', onClick: () => { settings.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; saveSettings(); applyTheme(); if (location.hash.startsWith('#/settings')) route() } }, '◐'),
	h('span', { class: 'netdot', title: 'online' }))
document.body.prepend(nav)
online.on('status', () => updateNet())
online.on('welcome', () => updateNet())
function updateNet(): void { nav.querySelector('.netdot')!.classList.toggle('on', online.connected) }

// ---- light / dark ----
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyTheme(): void {
	const t = settings.theme === 'system' ? (darkQuery?.matches === false ? 'light' : 'dark') : settings.theme
	document.documentElement.dataset.theme = t
	document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f2efe9' : '#161512')
	refreshTheme()
	for (const v of [(window as any).__view]) v?.board?.redraw()
}
darkQuery?.addEventListener?.('change', () => { if (settings.theme === 'system') applyTheme() })
applyTheme()

// ---- looks seen in a game (the setting "effects") ----
function looksFor(mySide: number, oppLooks: Looks | null): [Looks | null, Looks | null] {
	const out: [Looks | null, Looks | null] = [null, null]
	out[mySide] = myLooks()
	out[1 - mySide] = settings.effects === 'all' ? oppLooks : null
	return out
}

// ---- router ----
const routes: Record<string, (root: HTMLElement, arg: string) => (() => void) | void> = {
	'': home, play: lobby, game: onlineGame, bot: botScreen, puzzles: puzzleScreen, analysis: analysisScreen, looks: looksScreen, settings: settingsScreen, about: aboutScreen,
}
function route(): void {
	const [, name = '', arg = ''] = location.hash.replace(/^#/, '').split('/')
	cleanup?.(); cleanup = null
	clear(app)
	const root = h('main', { class: 'screen screen-' + (name || 'home') })
	app.append(root)
	for (const a of nav.querySelectorAll('.links a')) a.classList.toggle('active', a.getAttribute('href') === '#/' + name)
	cleanup = (routes[name] ?? home)(root, decodeURIComponent(arg)) || null
	window.scrollTo(0, 0)
}
window.addEventListener('hashchange', route)

// ---- name ----
function askName(then: () => void): void {
	if (settings.name) { then(); return }
	const inp = h('input', { type: 'text', maxlength: 20, placeholder: 'Your name', value: '' }) as HTMLInputElement
	const box = h('div', { class: 'col' }, h('h3', {}, 'Choose a name'), h('p', { class: 'muted' }, 'Other players see it in the list. No account needed.'), inp)
	const go = () => { const v = inp.value.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 20); if (!v) { inp.focus(); return } settings.name = v; saveSettings(); online.send({ t: 'name', name: v }); close(); then() }
	box.append(h('button', { class: 'primary', onClick: go }, 'OK'))
	inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })
	const close = modal(box)
	setTimeout(() => inp.focus(), 50)
}

// ---- home ----
function home(root: HTMLElement): () => void {
	const count = h('span', { class: 'muted' }, '')
	const tile = (href: string, icon: string, title: string, text: string) => h('a', { class: 'tile', href }, h('div', { class: 'ticon' }, icon), h('div', {}, h('b', {}, title), h('div', { class: 'muted' }, text)))
	root.append(
		h('section', { class: 'hero' }, h('h1', {}, 'Shogi'), h('p', { class: 'muted' }, 'Japanese chess, with your own piece colours and capture effects.')),
		h('div', { class: 'tiles' },
			tile('#/play', '⚔', 'Play online', 'Challenge someone from the list, with a clock.'),
			tile('#/bot', '🤖', 'Play the computer', '10 levels like lishogi, YaneuraOu engine.'),
			tile('#/puzzles', '🧩', 'Tsume puzzles', 'Mate in 1 to 7, with a rating.'),
			tile('#/analysis', '📈', 'Analysis board', 'Engine, evaluation graph, your games.'),
			tile('#/looks', '🎨', 'Your pieces', 'A colour and a capture effect for every piece.'),
			tile('#/settings', '⚙', 'Settings', 'Piece set, board, sounds, effects.')),
		h('p', { class: 'center' }, count))
	const showCount = (m: any) => { if (m) count.textContent = `${m.players.length} player${m.players.length === 1 ? '' : 's'} online` }
	showCount(online.lastLobby)
	const off = online.on('lobby', showCount)
	online.connect()
	const past = store<SavedGame[]>('games', [])
	if (past.length) {
		const list = h('div', { class: 'pastgames' }, h('h3', {}, 'Your recent games'))
		for (const g of past.slice(-8).reverse()) list.append(h('a', { class: 'pg', href: '#/analysis/' + encodeURIComponent(g.id) }, h('span', {}, `${g.names[0]} vs ${g.names[1]}`), h('span', { class: 'muted' }, `${g.result} · ${g.moves.length} moves · ${new Date(g.at).toLocaleDateString()}`)))
		root.append(list)
	}
	return off
}

// ---- saved games (for analysis) ----
interface SavedGame { id: string; at: number; names: [string, string]; start: string; moves: string[]; result: string; mode: string }
function saveGame(g: Game, names: [string, string], mode: string): string {
	const list = store<SavedGame[]>('games', [])
	const id = Date.now().toString(36)
	list.push({ id, at: Date.now(), names, start: g.start, moves: g.usi.slice(), result: g.result ? resultText(g.result) : 'unfinished', mode })
	while (list.length > 60) list.shift()
	keep('games', list)
	return id
}

// ---- time controls ----
interface TimeCtl { base: number; inc: number; byo: number }
const PRESETS: TimeCtl[] = [{ base: 1, inc: 0, byo: 10 }, { base: 3, inc: 0, byo: 10 }, { base: 5, inc: 3, byo: 0 }, { base: 10, inc: 0, byo: 30 }, { base: 15, inc: 10, byo: 0 }, { base: 30, inc: 0, byo: 60 }]
const timeText = (t: TimeCtl) => `${t.base}${t.inc ? '+' + t.inc : ''}${t.byo ? '|' + t.byo + 's' : ''}`
function timePicker(initial: TimeCtl): { el: HTMLElement; get: () => TimeCtl } {
	let cur = { ...initial }
	const custom = h('div', { class: 'customtime' })
	const num = (label: string, key: keyof TimeCtl, max: number) => { const i = h('input', { type: 'number', min: 0, max, value: cur[key] }) as HTMLInputElement; i.addEventListener('input', () => { cur[key] = Math.max(0, Math.min(max, Number(i.value) || 0)); mark() }); return h('label', {}, label, i) }
	custom.append(num('Minutes', 'base', 180), num('Increment s', 'inc', 60), num('Byoyomi s', 'byo', 120))
	const chips = PRESETS.map((t) => h('button', { class: 'chip', onClick: () => { cur = { ...t }; (custom.querySelectorAll('input')[0] as HTMLInputElement).value = String(t.base); (custom.querySelectorAll('input')[1] as HTMLInputElement).value = String(t.inc); (custom.querySelectorAll('input')[2] as HTMLInputElement).value = String(t.byo); mark() } }, timeText(t)))
	const mark = () => chips.forEach((c, i) => c.classList.toggle('on', JSON.stringify(PRESETS[i]) === JSON.stringify(cur)))
	mark()
	return { el: h('div', { class: 'timepick' }, h('div', { class: 'chips' }, ...chips), custom), get: () => ({ ...cur }) }
}

// ---- online lobby ----
function lobby(root: HTMLElement): () => void {
	const offs: (() => void)[] = []
	const me = h('div', { class: 'me' })
	const tp = timePicker(store<TimeCtl>('time', { base: 10, inc: 0, byo: 30 }))
	const colorSel = h('select', {}, h('option', { value: 'random' }, 'Random colour'), h('option', { value: 'sente' }, 'I play Sente ☗'), h('option', { value: 'gote' }, 'I play Gote ☖')) as HTMLSelectElement
	const seekBtn = h('button', { class: 'primary', onClick: () => { keep('time', tp.get()); if (mySeek) { online.send({ t: 'unseek' }); mySeek = false; renderMe() } else askName(() => { online.send({ t: 'seek', time: tp.get(), color: colorSel.value }); mySeek = true; renderMe() }) } }, 'Create open game')
	const players = h('div', { class: 'plist' })
	const seeks = h('div', { class: 'slist' })
	let mySeek = false
	let last: any = online.lastLobby
	const renderMe = () => {
		clear(me).append(h('div', {}, h('b', {}, settings.name || '(no name yet)'), ' ', h('span', { class: 'muted' }, `rating ${online.rating} · ${online.games} games`)), h('button', { class: 'link', onClick: () => { const n = prompt('Your name', settings.name); if (n !== null) { settings.name = n.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 20); saveSettings(); online.send({ t: 'name', name: settings.name }); renderMe() } } }, 'change'))
		seekBtn.textContent = mySeek ? 'Cancel my open game' : 'Create open game'
	}
	const render = () => {
		const m = last
		if (!m) { clear(players).append(h('p', { class: 'muted' }, online.connected ? 'Loading…' : 'Connecting…')); return }
		clear(seeks)
		const others = m.seeks.filter((s: any) => s.from !== online.you)
		mySeek = m.seeks.some((s: any) => s.from === online.you)
		renderMe()
		if (!others.length) seeks.append(h('p', { class: 'muted' }, 'No open games right now. Create one, or challenge a player below.'))
		for (const s of others) seeks.append(h('div', { class: 'srow' }, h('span', {}, h('b', {}, s.name), ` (${s.rating})`), h('span', {}, timeText(s.time)), h('span', { class: 'muted' }, s.color === 'random' ? 'random' : s.color === 'sente' ? 'they play ☗' : 'they play ☖'), h('button', { class: 'primary small', onClick: () => askName(() => online.send({ t: 'accept', cid: s.cid })) }, 'Join')))
		clear(players)
		const list = m.players.slice().sort((a: any, b: any) => (a.id === online.you ? -1 : b.id === online.you ? 1 : b.rating - a.rating))
		for (const p of list) {
			const isMe = p.id === online.you
			players.append(h('div', { class: 'prow' + (isMe ? ' meh' : '') },
				h('span', { class: 'odot on' }), h('b', {}, p.name), h('span', { class: 'muted' }, ` ${p.rating}`), p.playing ? h('span', { class: 'tag' }, 'playing') : '',
				isMe ? h('span', { class: 'muted' }, ' (you)') : h('button', { class: 'small', disabled: p.playing ? true : undefined, onClick: () => askName(() => { keep('time', tp.get()); online.send({ t: 'challenge', to: p.id, time: tp.get(), color: colorSel.value }) }) }, 'Challenge')))
		}
	}
	root.append(h('div', { class: 'lobby' },
		h('section', { class: 'card' }, h('h2', {}, 'Play online'), me, h('h4', {}, 'Time'), tp.el, h('div', { class: 'row' }, colorSel, seekBtn)),
		h('section', { class: 'card' }, h('h3', {}, 'Open games'), seeks, h('h3', {}, 'Players online'), players)))
	offs.push(online.on('lobby', (m) => { last = m; render() }))
	offs.push(online.on('welcome', () => renderMe()))
	offs.push(online.on('challengeSent', (m) => { if (m.to) toast('Challenge sent') }))
	offs.push(online.on('challengeGone', (m) => { if (m.why === 'declined') toast('Your challenge was declined') }))
	online.connect()
	render(); renderMe()
	return () => { for (const o of offs) o() }
}

// incoming challenges and game starts, on every screen
let challengeBox: (() => void) | null = null
online.on('challenge', (m) => {
	playSound('bell', 0.5)
	const box = h('div', { class: 'col' }, h('h3', {}, 'Challenge!'), h('p', {}, h('b', {}, m.name), ` (${m.rating}) wants to play ${timeText(m.time)}${m.color === 'random' ? '' : m.color === 'sente' ? ', they play Sente' : ', they play Gote'}.`),
		h('div', { class: 'row' }, h('button', { class: 'primary', onClick: () => { online.send({ t: 'accept', cid: m.cid }); challengeBox?.() } }, 'Accept'), h('button', { onClick: () => { online.send({ t: 'decline', cid: m.cid }); challengeBox?.() } }, 'Decline')))
	challengeBox?.()
	challengeBox = modal(box, () => { challengeBox = null })
	const off = online.on('challengeGone', (x) => { if (x.cid === m.cid) { challengeBox?.(); off() } })
})
online.on('error', (m) => toast(m.text))
online.on('replaced', () => toast('You opened the game in another tab.', 5000))
let current: any = null          // the last 'game' message (online game)
online.on('game', (m) => {
	current = m
	if (!m.result && !location.hash.startsWith('#/game/' + m.gid)) location.hash = '#/game/' + m.gid
})

// ---- online game ----
function onlineGame(root: HTMLElement, gid: string): () => void {
	const offs: (() => void)[] = []
	let view: GameView | null = null, you = 0, data: any = null
	let clocks: [number, number] = [0, 0], clockAt = 0, timer = 0, saved = false
	const oppOnline = h('span', { class: 'muted' })
	const btnResign = h('button', { onClick: () => { if (!data) return; if (!settings.confirmResign || confirm('Resign this game?')) online.send({ t: 'resign', gid: data.gid }) } }, 'Resign')
	const btnDraw = h('button', { onClick: () => { if (data) { online.send({ t: 'draw', gid: data.gid }); toast('Draw offer sent') } } }, 'Offer draw')
	const btnAbort = h('button', { onClick: () => { if (data) online.send({ t: 'abort', gid: data.gid }) } }, 'Abort')
	const btnRematch = h('button', { class: 'primary', onClick: () => { if (data) { online.send({ t: 'rematch', gid: data.gid }); toast('Rematch offered') } } }, 'Rematch')
	const btnAnalyse = h('button', { onClick: () => { if (view) { const id = saved ? store<SavedGame[]>('games', []).slice(-1)[0]?.id : saveGame(view.game, data.names, 'online'); saved = true; location.hash = '#/analysis/' + id } } }, 'Analyse')
	const btnLobby = h('a', { class: 'btn', href: '#/play' }, 'Back to lobby')
	const setup = (m: any) => {
		data = m; you = m.you
		const g = Game.fromUsi(START_SFEN, m.usi)
		if (!view) {
			view = new GameView(g)
			view.board.onUserMove = (mv) => {
				if (!view || !data || data.result) return
				const before = view.game.pos.clone()
				if (!view.game.play(mv)) return
				view.pushed()
				online.send({ t: 'move', gid: data.gid, usi: before.toUsi(mv), ply: view.game.moves.length - 1 })
				if (view.game.moves.length > 2) { clocks[you] = Math.max(0, clocks[you] - (Date.now() - clockAt)) + data.time.inc * 1000; clockAt = Date.now() }
				updateButtons()
			}
			clear(root).append(view.el)
			view.side.prepend(h('div', { class: 'gameinfo' }, h('div', {}, `${timeText(m.time)} · rated`), oppOnline))
		} else view.reset(g)
		view.setOrientation(you)
		view.board.looks = looksFor(you, m.looks[1 - you])
		view.board.effects = settings.effects
		for (const s of [0, 1]) { view.barOf(s).name.textContent = (s === 0 ? '☗ ' : '☖ ') + m.names[s]; view.barOf(s).sub.textContent = ` ${m.ratings[s]}` }
		clocks = m.clocks; clockAt = Date.now()
		oppOnline.textContent = m.online[1 - you] ? '' : 'Opponent disconnected…'
		view.setMovable(m.result ? -1 : you)
		if (m.result) ended(m.result, null)
		updateButtons(); tick()
	}
	const updateButtons = () => {
		if (!view || !data) return
		const over = !!data.result
		clear(view.buttons)
		if (!over) view.buttons.append(...(view.game.moves.length < 2 ? [btnAbort] : [btnDraw, btnResign]))
		else view.buttons.append(btnRematch, btnAnalyse, btnLobby)
		const turn = view.game.pos.turn
		view.setStatus(over ? `<b>${resultText(data.result)}</b>` : turn === you ? '<b>Your turn</b>' : 'Waiting for your opponent…')
	}
	const tick = () => {
		clearTimeout(timer)
		if (!view || !data) return
		const turn = view.game.moves.length % 2, running = !data.result && view.game.moves.length >= 2
		for (const s of [0, 1]) {
			let ms = clocks[s]
			if (running && s === turn) ms -= Date.now() - clockAt
			let byo = 0
			if (ms <= 0 && data.time.byo) { byo = data.time.byo * 1000 + ms; ms = 0 }
			view.setClock(s, ms, running && s === turn, byo)
		}
		timer = window.setTimeout(tick, 100)
	}
	const ended = (result: any, ratings: number[] | null) => {
		if (!view || !data) return
		data.result = result
		view.game.result = result
		view.setMovable(-1)
		view.renderMoves()
		if (ratings) for (const s of [0, 1]) view.barOf(s).sub.textContent = ` ${ratings[s]} (${ratings[s] - data.ratings[s] >= 0 ? '+' : ''}${ratings[s] - data.ratings[s]})`
		if (ratings) { online.rating = ratings[you]; online.games++ }
		if (!saved && view.game.moves.length) { saveGame(view.game, data.names, 'online'); saved = true }
		updateButtons()
		playSound(result.winner === you ? 'fanfare' : 'bell', 0.5)
	}
	offs.push(online.on('game', (m) => { if (m.gid === gid || !data || (data.result && !m.result)) { if (m.gid !== gid) { location.hash = '#/game/' + m.gid; return } saved = false; setup(m) } }))
	offs.push(online.on('move', (m) => {
		if (!view || !data || m.gid !== data.gid) return
		if (m.ply === view.game.moves.length + 1) { view.game.play(view.game.pos.fromUsi(m.usi)); view.pushed() }
		else if (m.ply !== view.game.moves.length) { online.send({ t: 'hello' }); return }
		clocks = m.clocks; clockAt = Date.now()
		updateButtons()
	}))
	offs.push(online.on('end', (m) => { if (data && m.gid === data.gid) { clocks = m.clocks; ended(m.result, m.ratings) } }))
	offs.push(online.on('opp', (m) => { if (data && m.gid === data.gid) oppOnline.textContent = m.online ? '' : 'Opponent disconnected… (they lose after 90 s)' }))
	offs.push(online.on('looks', (m) => { if (view && data && m.gid === data.gid) { data.looks[m.side] = m.looks; view.board.looks = looksFor(you, data.looks[1 - you]); clearSprites(); view.board.redraw() } }))
	offs.push(online.on('drawOffer', (m) => { if (!data || m.gid !== data.gid) return; const close = modal(h('div', { class: 'col' }, h('p', {}, 'Your opponent offers a draw.'), h('div', { class: 'row' }, h('button', { class: 'primary', onClick: () => { online.send({ t: 'draw', gid: data.gid }); close() } }, 'Accept'), h('button', { onClick: () => { online.send({ t: 'declineDraw', gid: data.gid }); close() } }, 'Decline')))) }))
	offs.push(online.on('drawDeclined', () => toast('Draw declined')))
	offs.push(online.on('rematchOffer', (m) => { if (data && m.gid === data.gid) { toast('Your opponent wants a rematch'); btnRematch.textContent = 'Accept rematch' } }))
	offs.push(online.on('status', (s) => { if (!s.connected) oppOnline.textContent = 'Reconnecting…' }))
	if (current && current.gid === gid) setup(current)
	else { root.append(h('p', { class: 'muted center' }, 'Connecting to the game…')); setTimeout(() => { if (!data) { clear(root).append(h('div', { class: 'card center' }, h('p', {}, 'This game is not running any more.'), h('a', { class: 'btn', href: '#/play' }, 'Back to the lobby'))) } }, 6000) }
	online.connect()
	return () => { clearTimeout(timer); for (const o of offs) o(); view?.destroy() }
}

// ---- against the computer ----
function botScreen(root: HTMLElement): () => void {
	let level = Math.min(10, store<number>('botLevel', 3)), color = store<string>('botColor', 'sente')
	let view: GameView | null = null, alive = true, mySide = 0, thinking = false
	const start = () => {
		mySide = color === 'random' ? (Math.random() < 0.5 ? 0 : 1) : color === 'gote' ? 1 : 0
		const g = new Game()
		if (!view) {
			view = new GameView(g)
			view.board.onUserMove = (m) => { if (!view || thinking) return; if (view.game.play(m)) { view.pushed(); after() } }
			clear(root).append(view.el)
		} else view.reset(g)
		view.setOrientation(mySide)
		view.board.looks = [null, null]; view.board.looks[mySide] = myLooks()
		view.board.effects = settings.effects
		view.barOf(mySide).name.textContent = (mySide ? '☖ ' : '☗ ') + (settings.name || 'You')
		view.barOf(1 - mySide).name.textContent = (mySide ? '☗ ' : '☖ ') + `Computer · ${LEVELS[level - 1].name}`
		view.barOf(1 - mySide).sub.textContent = ''
		view.barOf(mySide).sub.textContent = ''
		view.setClock(0, null, false); view.setClock(1, null, false)
		clear(view.buttons).append(
			h('button', { onClick: () => takeBack() }, 'Take back'),
			h('button', { onClick: () => { if (view && !view.game.result) { view.game.result = { winner: 1 - mySide, reason: 'resignation' }; view.renderMoves(); after() } } }, 'Resign'),
			h('button', { class: 'primary', onClick: () => setupBox() }, 'New game'),
			h('button', { onClick: () => { if (view) { const id = saveGame(view.game, names(), 'bot'); location.hash = '#/analysis/' + id } } }, 'Analyse'))
		after()
	}
	const names = (): [string, string] => { const n: [string, string] = ['', '']; n[mySide] = settings.name || 'You'; n[1 - mySide] = `Computer L${level}`; return n }
	const after = async () => {
		if (!view || !alive) return
		const g = view.game
		if (g.result) { view.setStatus(`<b>${resultText(g.result)}</b>`); view.setMovable(-1); saveGame(g, names(), 'bot'); playSound(g.result.winner === mySide ? 'fanfare' : 'bell', 0.5); return }
		if (g.pos.turn === mySide) { view.setMovable(mySide); view.setStatus('<b>Your turn</b>'); return }
		view.setMovable(-1)
		view.setStatus('Computer is thinking… <span class="spin"></span>')
		thinking = true
		const m = await botMove(g, level)
		thinking = false
		if (!alive || !view || view.game !== g || g.result) return
		while (view.board.animating()) await new Promise((r) => setTimeout(r, 50))
		if (m && g.play(m)) view.pushed()
		after()
	}
	const takeBack = () => {
		if (!view || thinking) return
		const g = view.game
		let n = g.moves.length - (g.pos.turn === mySide ? 2 : 1)
		if (g.result && g.pos.turn !== mySide) n = g.moves.length - 1
		n = Math.max(0, n)
		const ng = new Game(g.start)
		for (let i = 0; i < n; i++) ng.play(g.moves[i])
		view.reset(ng)
		after()
	}
	const setupBox = () => {
		const lv = h('div', { class: 'levels' }, ...LEVELS.map((L, i) => h('button', { class: 'chip' + (i + 1 === level ? ' on' : ''), onClick: (e: Event) => { level = i + 1; for (const b of lv.children) b.classList.remove('on'); (e.target as HTMLElement).classList.add('on') } }, String(i + 1))))
		const cs = h('div', { class: 'chips' }, ...['sente', 'random', 'gote'].map((c) => h('button', { class: 'chip' + (c === color ? ' on' : ''), onClick: (e: Event) => { color = c; for (const b of cs.children) b.classList.remove('on'); (e.target as HTMLElement).classList.add('on') } }, c === 'sente' ? '☗ Sente (first)' : c === 'gote' ? '☖ Gote' : 'Random')))
		const close = modal(h('div', { class: 'col' }, h('h3', {}, 'Play the computer'), h('div', { class: 'muted' }, 'Strength'), lv, h('div', { class: 'muted' }, 'Your colour'), cs,
			h('p', { class: 'muted small' }, engineAvailable() ? 'Engine: YaneuraOu (NNUE). It runs in your browser.' : 'Your browser cannot run the engine; a simple bot plays instead.'),
			h('button', { class: 'primary', onClick: () => { keep('botLevel', level); keep('botColor', color); close(); start() } }, 'Start')))
	}
	startEngine()
	start()
	if (!store<boolean>('botSeen', false)) { keep('botSeen', true); setupBox() }
	return () => { alive = false; view?.destroy() }
}

// ---- analysis board ----
function analysisScreen(root: HTMLElement, arg: string): () => void {
	let g = new Game()
	if (arg) {
		const sg = store<SavedGame[]>('games', []).find((x) => x.id === arg)
		if (sg) { g = new Game(sg.start); for (const u of sg.moves) if (!g.play(g.pos.fromUsi(u))) break }
		else { const x = gameFromText(arg); if (x) g = x }
	}
	const view = new GameView(g)
	const an = new Analyzer(view)
	view.board.looks = [myLooks(), myLooks()]
	view.board.effects = settings.effects
	view.setClock(0, null, false); view.setClock(1, null, false)
	view.barOf(0).name.textContent = '☗ Sente'; view.barOf(1).name.textContent = '☖ Gote'
	const evalEl = h('span', { class: 'evalnow' })
	const progress = h('div', { class: 'muted small' })
	// free play: moves made on the board start a new line from the shown position
	view.setMovable(2)
	view.board.movable = 2
	view.board.onUserMove = (m) => {
		const ply = view.ply
		if (ply < view.game.moves.length) {
			if (view.game.moves[ply] === m) { view.go(ply + 1); return }
			const ng = new Game(view.game.start)
			for (let i = 0; i < ply; i++) ng.play(view.game.moves[i])
			view.game = ng; an.evals.length = ply + 1; an.mates.length = ply + 1; an.best.length = ply + 1
		}
		view.game.play(m)
		view.ply = view.game.moves.length - 1
		view.pushed()
		view.board.movable = 2
		after()
	}
	view.onNavigate = () => { view.board.movable = 2; after() }
	const after = () => {
		const e = an.evals[view.ply]
		evalEl.textContent = e == null ? '' : fmtEval(e, an.mates[view.ply] ?? null)
		an.draw()
		an.think()
		view.setStatus(view.game.pos.hasLegal() || view.ply < view.game.moves.length ? `Move ${view.ply} · ${view.shownPosition().turn === 0 ? '☗ Sente' : '☖ Gote'} to play` : `<b>${view.game.result ? resultText(view.game.result) : 'Game over'}</b>`)
	}
	const engineToggle = h('input', { type: 'checkbox' }) as HTMLInputElement
	engineToggle.checked = store<boolean>('liveEngine', true)
	an.liveOn = engineToggle.checked
	engineToggle.addEventListener('change', () => { an.liveOn = engineToggle.checked; keep('liveEngine', an.liveOn); after() })
	const btnRun = h('button', { class: 'primary', onClick: () => {
		if (an.running) { an.stop(); btnRun.textContent = 'Analyse whole game'; return }
		btnRun.textContent = 'Stop'
		const wasLive = an.liveOn; an.liveOn = false
		an.analyzeGame((k, n) => {
			if (k < 0) { progress.textContent = 'The engine cannot run in this browser.'; btnRun.textContent = 'Analyse whole game'; return }
			progress.textContent = k >= n ? '' : `Analysing… ${k}/${n}`
			if (k >= n) {
				btnRun.textContent = 'Analyse whole game'
				an.liveOn = wasLive
				const sm = an.summary()
				clear(summary).append(...sm.map((s) => h('div', { class: 'sumrow' }, h('b', {}, s.side), ` ${s.inacc} inaccuracies · ${s.mist} mistakes · ${s.blun} blunders · avg. loss ${s.acpl}`)))
				after()
			}
		})
	} }, 'Analyse whole game')
	const summary = h('div', { class: 'summary' })
	const textIn = h('textarea', { rows: 2, placeholder: 'Paste an SFEN or USI moves (e.g. "startpos moves 7g7f 3c3d")' }) as HTMLTextAreaElement
	const load = h('button', { onClick: () => { const x = gameFromText(textIn.value); if (!x) { toast('Could not read that'); return } location.hash = '#/analysis/' + encodeURIComponent(textIn.value.trim()) } }, 'Load')
	const exportBtn = h('button', { onClick: () => { const t = view.game.usiPosition(); navigator.clipboard?.writeText(t).then(() => toast('Copied: position as USI'), () => prompt('Copy:', t)) } }, 'Copy USI')
	const sfenBtn = h('button', { onClick: () => { const t = view.shownPosition().sfen(); navigator.clipboard?.writeText(t).then(() => toast('Copied SFEN'), () => prompt('Copy:', t)) } }, 'Copy SFEN')
	clear(view.buttons).append(btnRun, exportBtn, sfenBtn)
	clear(view.extra).append(h('div', { class: 'row' }, h('label', { class: 'switch' }, engineToggle, ' Engine '), evalEl), an.live, an.graph, progress, summary, h('div', { class: 'row' }, textIn, load))
	clear(root).append(view.el)
	after()
	return () => { an.stop(); an.liveOn = false; view.destroy() }
}

// ---- piece looks ----
const PALETTE = [null, '#ff5a5a', '#ff9a3c', '#ffd24a', '#7ddc6f', '#3ec7b5', '#4aa3ff', '#6c6cff', '#b46cff', '#ff6fc8', '#9b7b5a', '#c9ccd6', '#404654']
function looksScreen(root: HTMLElement): () => void {
	const preview = new ShogiBoard()
	preview.el.classList.add('previewboard')
	preview.looks = [myLooks(), null]
	preview.effects = 'all'
	preview.setCoords(false)
	let demoTimer = 0
	const demo = (kind: number) => {
		// the chosen piece takes an enemy piece in front of it
		clearTimeout(demoTimer)
		const pos = Position.fromSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1')
		const from = 6 * 9 + 4, to = 4 * 9 + 4
		pos.board.fill(0)
		pos.board[0] = -K; pos.board[80] = K
		const reach: Record<number, number> = { [N]: 4 * 9 + 3, [B]: 4 * 9 + 2, [K]: 5 * 9 + 4, [S]: 5 * 9 + 3, [G]: 5 * 9 + 4, [P]: 5 * 9 + 4 }
		const tgt = reach[kind] ?? to
		const fromSq = kind === K ? 6 * 9 + 4 : from
		pos.board[80] = kind === K ? 0 : K
		pos.board[fromSq] = kind
		pos.board[tgt] = -G
		const p0 = Position.fromSfen(pos.sfen())
		preview.setPosition(p0)
		demoTimer = window.setTimeout(() => {
			const m = p0.legal().find((x) => mTo(x) === tgt && !((x >> 14) & 1)) ?? p0.legal().find((x) => mTo(x) === tgt)
			if (!m) return
			const after = p0.clone(); after.make(m)
			preview.playMove(p0, m, after)
		}, 350)
	}
	const rows = h('div', { class: 'looks' })
	const render = () => {
		clear(rows)
		for (const k of KINDS) {
			const look = settings.looks[k]
			const img = h('canvas', { class: 'lookimg', width: 96, height: 96 }) as HTMLCanvasElement
			const drawImg = () => { const c = img.getContext('2d')!; c.clearRect(0, 0, 96, 96); preview.drawPc(c, k, 48, 48, 54, 1) }
			drawImg()
			const sw = h('div', { class: 'swatches' }, ...PALETTE.map((c) => h('button', { class: 'sw' + (look.color === c ? ' on' : ''), title: c ?? 'none', style: { background: c ?? 'transparent' }, onClick: () => { look.color = c; saveSettings(); clearSprites(); online.send({ t: 'looks', looks: myLooks() }); render(); demo(k) } }, c ? '' : '∅')))
			const custom = h('input', { type: 'color', value: look.color ?? '#ffffff', title: 'Any colour', onChange: (e: Event) => { look.color = (e.target as HTMLInputElement).value; saveSettings(); clearSprites(); online.send({ t: 'looks', looks: myLooks() }); render(); demo(k) } })
			const sel = h('select', { onChange: (e: Event) => { look.hit = Number((e.target as HTMLSelectElement).value); saveSettings(); online.send({ t: 'looks', looks: myLooks() }); demo(k) } },
				...HIT_NAMES.map((n, i) => h('option', { value: i, selected: look.hit === i }, n)), h('option', { value: -1, selected: look.hit === -1 }, 'Random'))
			rows.append(h('div', { class: 'lookrow' }, img, h('div', { class: 'lookctl' }, h('b', {}, NAME[k] + (k !== K && k !== G ? ' (and promoted)' : '')), h('div', { class: 'row' }, sw, custom), h('div', { class: 'row' }, 'Capture effect ', sel, h('button', { class: 'small', onClick: () => demo(k) }, '▶ Preview')))))
		}
		void HIT
	}
	render()
	onPiecesLoaded(() => render())
	const rnd = h('input', { type: 'checkbox' }) as HTMLInputElement
	rnd.checked = settings.randomHits
	rnd.addEventListener('change', () => { settings.randomHits = rnd.checked; saveSettings(); preview.looks = [myLooks(), null]; online.send({ t: 'looks', looks: myLooks() }); demo(R) })
	const rndRow = h('label', { class: 'setrow randomrow' }, h('span', {}, h('b', {}, 'Random effect at every capture'), h('div', { class: 'muted small' }, 'Every capture picks one of the 16 effects by chance (for all your pieces).')), rnd)
	const reset = h('button', { onClick: () => { if (!confirm('Reset all piece looks?')) return; for (const k of KINDS) settings.looks[k] = { color: null, hit: 0 }; saveSettings(); clearSprites(); online.send({ t: 'looks', looks: myLooks() }); render() } }, 'Reset all')
	root.append(h('div', { class: 'lookspage' },
		h('section', { class: 'card' }, h('h2', {}, 'Your pieces'), h('p', { class: 'muted' }, 'Give every kind of piece its own colour and capture effect. Your opponent sees them too (unless they turned it off in the settings).'), rndRow, rows, reset),
		h('section', { class: 'card sticky' }, h('h3', {}, 'Preview'), preview.el)))
	demo(R)
	return () => clearTimeout(demoTimer)
}

// ---- settings ----
function settingsScreen(root: HTMLElement): void {
	const sel = (label: string, opts: [string, string][], val: string, set: (v: string) => void) => h('label', { class: 'setrow' }, h('span', {}, label), h('select', { onChange: (e: Event) => { set((e.target as HTMLSelectElement).value); saveSettings(); clearSprites() } }, ...opts.map(([v, t]) => h('option', { value: v, selected: v === val }, t))))
	const chk = (label: string, val: boolean, set: (v: boolean) => void) => { const i = h('input', { type: 'checkbox' }) as HTMLInputElement; i.checked = val; i.addEventListener('change', () => { set(i.checked); saveSettings() }); return h('label', { class: 'setrow' }, h('span', {}, label), i) }
	const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings.volume, onInput: (e: Event) => { settings.volume = Number((e.target as HTMLInputElement).value); saveSettings() }, onChange: () => playSound('move', 0.63) })
	const nameIn = h('input', { type: 'text', maxlength: 20, value: settings.name, onChange: (e: Event) => { settings.name = (e.target as HTMLInputElement).value.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 20); saveSettings(); online.send({ t: 'name', name: settings.name }) } })
	const sets = h('div', { class: 'setpreview' })
	const showSets = () => { clear(sets); for (const s of PIECE_SETS) { const b = h('button', { class: 'setbtn' + (s.id === settings.pieceSet ? ' on' : ''), onClick: () => { settings.pieceSet = s.id; saveSettings(); clearSprites(); showSets() } }, h('img', { src: `pieces/${s.id}/0HI.svg`, alt: '' }), h('img', { src: `pieces/${s.id}/0KA.svg`, alt: '' }), h('img', { src: `pieces/${s.id}/0OU.svg`, alt: '' }), h('span', {}, s.name)); sets.append(b) } }
	showSets()
	root.append(h('section', { class: 'card settings' }, h('h2', {}, 'Settings'),
		h('label', { class: 'setrow' }, h('span', {}, 'Your name'), nameIn),
		h('div', { class: 'setrow col' }, h('span', {}, 'Piece set'), sets),
		sel('Theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'Like my device']], settings.theme, (v) => { settings.theme = v as Settings['theme']; applyTheme() }),
		sel('Board', BOARDS.map((b) => [b.id, b.name]), settings.board, (v) => (settings.board = v)),
		sel('Capture effects', [['all', 'All (mine and my opponent\'s)'], ['mine', 'Only my own'], ['simple', 'Simple (a short flash)'], ['off', 'Off']], settings.effects, (v) => (settings.effects = v as EffectsMode)),
		chk('Sound', settings.sound, (v) => (settings.sound = v)),
		h('label', { class: 'setrow' }, h('span', {}, 'Volume'), vol),
		chk('Coordinates on the board', settings.coords, (v) => (settings.coords = v)),
		chk('Ask before resigning', settings.confirmResign, (v) => (settings.confirmResign = v)),
		h('p', { class: 'muted small' }, h('a', { href: '#/about' }, 'About, credits and source code'))))
}

function aboutScreen(root: HTMLElement): void {
	root.append(h('section', { class: 'card about' }, h('h2', {}, 'About'),
		h('p', {}, 'A small shogi site: play online with a clock, against the computer, solve tsume puzzles and analyse games. Every piece kind can have its own colour and capture effect.'),
		h('h3', {}, 'Source code'),
		h('p', {}, 'This site is free software under the GNU GPL v3. ', h('a', { href: 'https://github.com/Saibrix/shogi', target: '_blank', rel: 'noopener' }, 'Source code on GitHub'), '.'),
		h('h3', {}, 'Credits'),
		h('ul', {},
			h('li', {}, 'Engine: ', h('a', { href: 'https://github.com/yaneurao/YaneuraOu', target: '_blank' }, 'YaneuraOu'), ' (GPLv3), WebAssembly build ', h('a', { href: 'https://www.npmjs.com/package/@mizarjp/yaneuraou.k-p', target: '_blank' }, '@mizarjp/yaneuraou.k-p'), ' with its built-in NNUE K-P evaluation.'),
			...PIECE_SETS.map((s) => h('li', {}, 'Pieces: ', s.credit, ' (from ', h('a', { href: 'https://github.com/WandererXII/lishogi', target: '_blank' }, 'lishogi'), ').')),
			h('li', {}, 'Capture effects, move animation and sounds: from the game Hex Chaos.'),
			h('li', {}, 'Tsume puzzles: generated and checked by this site\'s own mate solver.'))))
}

// ---- start ----
;(window as any).__shogi = { online }
document.addEventListener('pointerdown', unlockAudio, { once: true })
route()
online.connect()
void [L, base, pieceImage, R]
