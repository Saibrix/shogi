# Shogi

A small shogi site: play online with a clock, play the computer (YaneuraOu), solve tsume puzzles with a rating, analyse games.
Every piece kind can have its own colour and capture effect (taken from the game Hex Chaos).

Live: https://shogi.hexchaos.workers.dev

## How it is built
- `src/` TypeScript page (no framework), bundled by esbuild (`node build.mjs` -> `dist/`).
  - `rules.ts` shogi rules (perft-checked), `tsume.ts` mate solver, `board.ts` canvas board with the move animation and the 16 capture effects,
    `engine.ts` YaneuraOu in the browser, `bot.ts` levels, `analysis.ts`, `puzzles.ts`, `online.ts`, `main.ts` screens.
- `server/` Cloudflare Worker + one Durable Object (`Lobby`): player list, challenges, games with server clocks and move checking, reconnect, Elo.
- `tools/` tests and generators: `node tools/run.mjs test_rules` (perft and special rules), `node tools/run.mjs gen_tsume 240` (makes `src/gen/tsume.json`),
  `node tools/online_test.mjs` (two browsers against `wrangler dev --port 8788 --local`), `node tools/shot.mjs <name> <w> <h> tools/s_*.js` (screenshots).
- Deploy: `powershell -File deploy.ps1 -Msg "..."` (build, `wrangler deploy`, commit, push).


## Licence
GPL v3 (see LICENSE), because the engine is GPL. See CREDITS.md for the piece sets and the engine.
