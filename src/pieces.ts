// The piece pictures (lishogi's piece sets, see CREDITS.md) and tinted sprites of them.
// The SVGs are loaded with a big size of their own (some browsers draw an SVG picture at its own size and scale that, which blurs),
// then made smaller in halves for each sprite (sharp edges).
import { CODE } from './rules'
import { settings, onSettings } from './settings'

const BIG = 512
const imgs = new Map<string, HTMLImageElement>()
let loadedSet = ''
const waiters: (() => void)[] = []
export function onPiecesLoaded(f: () => void): void { waiters.push(f) }
function loadSet(set: string): void {
	if (loadedSet === set) return
	loadedSet = set
	let left = 0
	const done = () => { if (--left === 0) { sprites.clear(); for (const w of waiters) w() } }
	for (const side of [0, 1]) for (const t of Object.keys(CODE)) {
		const key = `${set}/${side}${CODE[+t]}`
		if (imgs.has(key)) continue
		const im = new Image()
		imgs.set(key, im)
		left++
		im.onload = done
		im.onerror = done
		fetch(`pieces/${key}.svg`).then((r) => r.text()).then((svg) => {
			// give the picture a size of its own
			const sized = svg.replace(/<svg\b([^>]*)>/, (m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${BIG}" height="${BIG}">`)
			im.src = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
		}).catch(() => { im.src = `pieces/${key}.svg` })
	}
	if (!left) for (const w of waiters) w()
}
loadSet(settings.pieceSet)
onSettings(() => { if (settings.pieceSet !== loadedSet) loadSet(settings.pieceSet) })

export function pieceImage(type: number, down: number): HTMLImageElement | null {
	const im = imgs.get(`${settings.pieceSet}/${down}${CODE[type]}`)
	return im && im.complete && im.naturalWidth ? im : null
}

// draws the picture at px pixels: first in halves down to twice the size, then the last step (smooth and sharp)
function drawSharp(c: CanvasRenderingContext2D, im: HTMLImageElement, px: number): void {
	let src: CanvasImageSource = im
	let size = Math.max(im.naturalWidth, 1)
	while (size / 2 >= px * 2) {
		const half = Math.round(size / 2)
		const t = document.createElement('canvas'); t.width = t.height = half
		const tc = t.getContext('2d')!
		tc.imageSmoothingQuality = 'high'
		tc.drawImage(src, 0, 0, half, half)
		src = t; size = half
	}
	c.imageSmoothingQuality = 'high'
	c.drawImage(src, 0, 0, px, px)
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
	drawSharp(c, im, px)
	if (color) {
		const plain = document.createElement('canvas'); plain.width = plain.height = px
		plain.getContext('2d')!.drawImage(s, 0, 0)
		c.globalCompositeOperation = 'multiply'
		c.fillStyle = color; c.fillRect(0, 0, px, px)
		c.globalCompositeOperation = 'destination-in'
		c.drawImage(plain, 0, 0)
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
