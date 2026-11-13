// Runs a TypeScript tool: node tools/run.mjs <name> [args]  (bundles tools/<name>.ts with esbuild, then runs it)
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
const name = process.argv[2]
await build({ entryPoints: [`tools/${name}.ts`], bundle: true, platform: 'node', format: 'esm', outfile: `tools/.out/${name}.mjs`, logLevel: 'warning', loader: { '.json': 'json' } })
const r = spawnSync(process.execPath, [`tools/.out/${name}.mjs`, ...process.argv.slice(3)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
