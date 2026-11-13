// solve two puzzles with the stored solution, fail one: node tools/shot.mjs pz 430 900 tools/s_puzzle.js
await page.evaluate(() => { localStorage.setItem('shogi.puzzleLen', '3'); location.hash = '#/puzzles' })
await sleep(1500)
const bank = await page.evaluate(() => fetch('tsume.json').then((r) => r.json()))
const solve = async () => {
	const sfen = await page.evaluate(() => window.__view.game.start)
	const pz = bank.find((b) => b[0] === sfen)
	for (let i = 0; i < pz[1].length; i += 2) {
		await page.evaluate((u) => { const v = window.__view; v.board.onUserMove(v.game.pos.fromUsi(u)) }, pz[1][i])
		await sleep(900)
	}
	return pz
}
const p1 = await solve()
console.log('solved?', await page.evaluate(() => document.querySelector('.pzinfo').textContent), p1[1].join(' '))
await shot('solved')
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Next puzzle').click())
await sleep(800)
// a wrong move: any legal non-solution move that is a check... just take the first legal move
await page.evaluate(() => { const v = window.__view; const ms = v.game.pos.legal(); v.board.onUserMove(ms[ms.length - 1]) })
await sleep(600)
console.log('wrong:', await page.evaluate(() => document.querySelector('.pzinfo').textContent))
console.log('rating:', await page.evaluate(() => document.querySelector('.pzrating').textContent))
await shot('wrong')
