// The piece pictures (lishogi's piece sets, see CREDITS.md) and tinted sprites of them.
import { CODE } from './rules'
import { settings, onSettings } from './settings'

const imgs = new Map<string, HTMLImageElement>()
let loadedSet = ''
const waiters: (() => void)[] = []
export function onPiecesLoaded(f: () => void): void { waiters.push(f) }
function loadSet(set: string): void {
	if (loadedSet === set) return
	loadedSet = set
	let left = 0
	for (const side of [0, 1]) for (const t of Object.keys(CODE)) {
		const key = `${set}/${side}${CODE[+t]}`
		if (imgs.has(key)) continue
		const im = new Image()
		left++
		im.onload = im.onerror = () => { if (--left === 0) { sprites.clear(); for (const w of waiters) w() } }
		im.src = `pieces/${key}.svg`
		imgs.set(key, im)
	}
	if (!left) for (const w of waiters) w()
}
loadSet(settings.pieceSet)
onSettings(() => { if (settings.pieceSet !== loadedSet) loadSet(settings.pieceSet) })

// the picture of a piece kind as seen pointing up (up = 0) or down (1)
export function pieceImage(type: number, down: number): HTMLImageElement | null {
	const im = imgs.get(`${settings.pieceSet}/${down}${CODE[type]}`)
	return im && im.complete && im.naturalWidth ? im : null
}

const sprites = new Map<string, HTMLCanvasElement>()
// a piece drawn at `px` device pixels, optionally tinted with a colour (the wood takes the colour, the ink stays dark)
export function pieceSprite(type: number, down: number, px: number, color: string | null): HTMLCanvasElement | null {
	const im = pieceImage(type, down)
	if (!im) return null
	px = Math.max(8, Math.round(px))
	const key = `${settings.pieceSet}|${type}|${down}|${px}|${color ?? ''}`
	let s = sprites.get(key)
	if (s) return s
	s = document.createElement('canvas')
	s.width = s.height = px
	const c = s.getContext('2d')!
	c.drawImage(im, 0, 0, px, px)
	if (color) {
		c.globalCompositeOperation = 'multiply'
		c.fillStyle = color; c.fillRect(0, 0, px, px)
		c.globalCompositeOperation = 'destination-in'
		c.drawImage(im, 0, 0, px, px)
		// a soft glow of the colour over the top, so light colours show on light wood too
		c.globalCompositeOperation = 'source-atop'
		c.globalAlpha = 0.18; c.fillStyle = color; c.fillRect(0, 0, px, px)
		c.globalAlpha = 1
	}
	c.globalCompositeOperation = 'source-over'
	if (sprites.size > 600) sprites.clear()
	sprites.set(key, s)
	return s
}
export function clearSprites(): void { sprites.clear() }
