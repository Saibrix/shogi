// Opens the page in headless Edge, runs steps and takes screenshots: node tools/shot.mjs <name> [w] [h] [script.js]
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const [name = 'shot', w = '430', hgt = '900', script = ''] = process.argv.slice(2)
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => { try { readFileSync(p); return true } catch { return false } })
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
await page.setViewport({ width: Number(w), height: Number(hgt), deviceScaleFactor: Number(process.env.DSF || 1) })
const logs = []
page.on('console', (m) => logs.push(m.text()))
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 4).join(' | ')))
await page.goto(process.env.URL || 'http://localhost:8788/', { waitUntil: 'load' })

await new Promise((r) => setTimeout(r, 600))
const out = process.env.SHOT_DIR || 'C:/Users/oztur/AppData/Local/Temp/claude/60d8c521320e44a2/8633ac13-4b15-4461-921e-72c799699f7a/scratchpad'
if (script) {
	const steps = readFileSync(script, 'utf8')
	const fn = new (Object.getPrototypeOf(async function () {}).constructor)('page', 'shot', 'sleep', steps)
	try { await fn(page, async (n) => { await page.screenshot({ path: `${out}/${name}_${n}.png` }); console.log('shot', n) }, (ms) => new Promise((r) => setTimeout(r, ms))) } catch (e) { logs.push('SCRIPT ERROR ' + e.message) }
} else {
	await page.screenshot({ path: `${out}/${name}.png` })
}
console.log(logs.join('\n'))
await browser.close()




