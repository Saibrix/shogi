// Tests the userscript on lishogi's analysis board (no game, nothing is sent anywhere): a capture must start an effect.
// node tools/fx_lishogi_test.mjs [width height]
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const OUT = 'C:/Users/oztur/AppData/Local/Temp/claude/60d8c521320e44a2/8633ac13-4b15-4461-921e-72c799699f7a/scratchpad'
const [w = '412', hgt = '860'] = process.argv.slice(2)
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => { try { readFileSync(p); return true } catch { return false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: Number(w), height: Number(hgt), deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.setBypassCSP(true)
await page.goto('https://lishogi.org/analysis', { waitUntil: 'networkidle2' })
await page.addScriptTag({ content: readFileSync('userscript/lishogi-fx.user.js', 'utf8') })
await sleep(800)
console.log('script ran:', await page.evaluate(() => !!document.querySelector('canvas') || 'unknown'))
// clicks a square: file 9..1, rank 1..9 (sente at the bottom)
const click = async (file, rank) => {
	const r = await page.evaluate(() => { const b = document.querySelector('sg-pieces').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
	const sq = r.w / 9
	const x = r.x + (9 - file + 0.5) * sq, y = r.y + (rank - 0.5) * r.h / 9
	await page.mouse.move(x, y); await page.mouse.down(); await sleep(40); await page.mouse.up()
	await sleep(250)
}
await click(7, 7)
console.log('selected:', await page.evaluate(() => document.querySelectorAll('sq.selected, sq.dest').length + ' ' + JSON.stringify(document.querySelector('sg-pieces')?.getBoundingClientRect()) + ' n=' + document.querySelectorAll('sg-pieces').length))
await click(7, 6)          // 7g7f
await sleep(600)
await click(3, 3); await click(3, 4)          // 3c3d
await sleep(600)
await click(8, 8); await click(2, 2)          // 8h2b (bishop takes bishop)
await sleep(300)
const promo = await page.$('sg-promotion piece')
if (promo) { await promo.click(); console.log('promotion chosen') }
const shots = [120, 250, 450]
let t = 0
for (const at of shots) { await sleep(at - t); t = at; await page.screenshot({ path: `${OUT}/lfx_${at}.png` }) }
const fx = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].find((x) => x.style.zIndex === '2147483000'); return c ? 'effect canvas present' : 'no effect canvas' })
console.log(fx)
console.log('moves:', await page.evaluate(() => [...document.querySelectorAll('move, .move')].map((m) => m.textContent).join(' ').slice(0, 120)))
await browser.close()
