// Tiny DOM helpers.
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag)
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined || v === null || v === false) continue
		if (k === 'class') e.className = v
		else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) e.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(sv)) }
		else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v)
		else if (k === 'html') e.innerHTML = v
		else e.setAttribute(k, v === true ? '' : String(v))
	}
	for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c)
	return e
}
export const $ = (sel: string, root: ParentNode = document): HTMLElement => root.querySelector(sel) as HTMLElement
export function clear(e: HTMLElement): HTMLElement { e.innerHTML = ''; return e }
export function toast(text: string, ms = 2600): void {
	const t = h('div', { class: 'toast' }, text)
	document.body.append(t)
	requestAnimationFrame(() => t.classList.add('show'))
	setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400) }, ms)
}
// a modal box; returns a close function
export function modal(content: HTMLElement, onClose?: () => void, closable = true): () => void {
	const ov = h('div', { class: 'overlay' }, h('div', { class: 'dialog' }, content))
	const close = () => { ov.remove(); onClose?.() }
	if (closable) ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close() })
	document.body.append(ov)
	return close
}
export function fmtClock(ms: number): string {
	ms = Math.max(0, ms)
	const s = Math.ceil(ms / 1000)
	if (ms < 10000) return (ms / 1000).toFixed(1)
	const m = Math.floor(s / 60), r = s % 60
	if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`
	return `${m}:${String(r).padStart(2, '0')}`
}
