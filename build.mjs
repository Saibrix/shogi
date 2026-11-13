// Builds the page into dist/: node build.mjs [--dev]
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const prod = !process.argv.includes('--dev')
rmSync('dist', { recursive: true, force: true })
mkdirSync('dist/engine', { recursive: true })
const BUILD = String(Date.now())
const common = { define: { __BUILD__: JSON.stringify(BUILD) }, bundle: true, minify: prod, target: ['es2020'], loader: { '.css': 'css' }, logLevel: 'info', sourcemap: false }
await build({ ...common, entryPoints: { app: 'src/main.ts' }, outdir: 'dist', format: 'esm', entryNames: '[name]-[hash]' , metafile: false })
await build({ ...common, entryPoints: ['src/sfxworker.ts'], outfile: 'dist/sfxgen.js', format: 'iife' })
// the hashed names of app.js / app.css
const files = (await import('node:fs')).readdirSync('dist')
const js = files.find((f) => /^app-.*\.js$/.test(f)), css = files.find((f) => /^app-.*\.css$/.test(f))
writeFileSync('dist/index.html', readFileSync('src/index.html', 'utf8').replace('app.js', js).replace('app.css', css))
cpSync('src/icon.svg', 'dist/icon.svg')
cpSync('assets/pieces', 'dist/pieces', { recursive: true })
cpSync('src/gen/tsume.json', 'dist/tsume.json')
// the lishogi userscript (install link: /lishogi-fx.user.js, see userscript/NOTES.md)
cpSync('userscript/lishogi-fx.user.js', 'dist/lishogi-fx.user.js')
// the engine (YaneuraOu, GPLv3): the files of the npm package as they are
const eng = 'node_modules/@mizarjp/yaneuraou.k-p/lib/'
for (const f of ['yaneuraou.k-p.js', 'yaneuraou.k-p.wasm', 'yaneuraou.k-p.worker.js']) cpSync(eng + f, 'dist/engine/' + f)
// headers: cross-origin isolation (the engine needs SharedArrayBuffer), long cache for hashed files
writeFileSync('dist/_headers', [
	'/*', '  Cross-Origin-Opener-Policy: same-origin', '  Cross-Origin-Embedder-Policy: require-corp', '  Cross-Origin-Resource-Policy: same-origin',
	'/app-*', '  Cache-Control: public, max-age=31536000, immutable',
	'/engine/*', '  Cache-Control: public, max-age=604800',
	'/pieces/*', '  Cache-Control: public, max-age=604800', '',
].join('\n'))
if (!existsSync('dist/index.html')) throw new Error('no index')
console.log('built dist/')
