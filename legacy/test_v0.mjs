import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => { try { readFileSync(p); return true } catch { return false } })
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 })
const errs = []; page.on('pageerror', (e) => errs.push(e.message))
await page.goto('file:///C:/Users/oztur/Desktop/Claude/shogi/index.html')
const r = await page.evaluate(() => {
  const S = window.__shogi, out = {}
  out.start = S.legalMoves(S.state).length
  // play 40 random plies (both sides, not through the UI bot)
  let s = S.state
  for (let i = 0; i < 40; i++) { const ms = S.legalMoves(s); if (!ms.length) break; s = S.apply(s, ms[Math.floor(Math.random() * ms.length)]) }
  out.mid = S.legalMoves(s).length
  for (const lv of [1, 2, 3]) { const t = performance.now(); S.botMove(s, lv); out['lv' + lv] = Math.round(performance.now() - t) + ' ms' }
  return out
})
console.log(JSON.stringify(r))
await page.screenshot({ path: process.argv[2] + '/shogi_start.png' })
// click a pawn and a target via the UI
const box = await (await page.$('#board')).boundingBox()
const cell = (r, c) => [box.x + (c + 0.5) * box.width / 9, box.y + (r + 0.5) * box.height / 9]
await page.mouse.click(...cell(6, 2)); await new Promise((r) => setTimeout(r, 200))
await page.screenshot({ path: process.argv[2] + '/shogi_sel.png' })
await page.mouse.click(...cell(5, 2)); await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: process.argv[2] + '/shogi_after.png' })
console.log('log:', await page.evaluate(() => document.getElementById('log').textContent))
console.log(errs.join('\n'))
await browser.close()
