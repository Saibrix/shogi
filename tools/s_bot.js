// the bot: start level 5, play three moves, see that the engine answers; then the analysis
await page.evaluate(() => { localStorage.setItem('shogi.botSeen', 'true'); localStorage.setItem('shogi.botLevel', '5'); location.hash = '#/bot' })
await sleep(3000)
const iso = await page.evaluate(() => ({ iso: self.crossOriginIsolated, sab: typeof SharedArrayBuffer }))
console.log('isolated', JSON.stringify(iso))
for (const u of ['7g7f', '2g2f', '2f2e']) {
	await page.evaluate((u) => { const v = window.__view; v.board.onUserMove(v.game.pos.fromUsi(u)) }, u)
	await page.waitForFunction(() => window.__view.game.pos.turn === 0 || window.__view.game.result, { timeout: 30000 }).catch(() => console.log('bot did not answer'))
	await sleep(500)
}
console.log('moves', await page.evaluate(() => window.__view.game.usi.join(' ')))
await shot('bot')
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Analyse'); b.click() })
await sleep(4000)
await shot('analysis_live')
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Analyse whole game'); b.click() })
await page.waitForFunction(() => document.querySelector('.summary')?.textContent, { timeout: 60000 }).catch(() => console.log('no summary'))
console.log('summary', await page.evaluate(() => document.querySelector('.summary')?.textContent))
await shot('analysis')
