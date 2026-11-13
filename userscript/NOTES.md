# Lishogi FX (userscript): notes for changes

READ THIS FIRST when the user wants changes to the lishogi script. Everything needed is in this folder; Hex Chaos is NOT needed.

## What it is
- `lishogi-fx.user.js`: a Violentmonkey/Tampermonkey userscript for lishogi.org. Random capture effects (taken from Hex Chaos, already ported here).
- Purely cosmetic (user wish, lishogi's rules): no sounds, no piece colours, no hints, no evaluation, never makes or changes moves, sends nothing anywhere.
- The user tests it on Android: Firefox + Violentmonkey. Install/update link: https://shogi.saidozturk08.workers.dev/lishogi-fx.user.js
  (build.mjs copies the file into dist/; `powershell -File deploy.ps1 ...` uploads it). **Raise `@version` on every change**, otherwise Violentmonkey does not update.

## How it works
- Switch: a MutationObserver inserts `div.thick-switch.sgfx-switch` (label "Effects", input `#sgfx-toggle`) right after lishogi's "Thick" grid switch in the
  board theme menu (dasher, `.sub.theme .thick-switch`; lishogi source: ui/dasher/src/theme.ts). The menu is redrawn by snabbdom, so the observer adds it again.
  State: `localStorage['lishogiFx.on']` ('0' = off, default on).
- Capture detection (lishogi's board = shogiground, src/render.ts): every piece is `<piece class="sente pawn">` inside `<sg-pieces>`, placed with
  `transform: translate(X%, Y%)` (X/100 = column, Y/100 = row on screen). When a move animation ends, the taken piece's element is REMOVED.
  A capture = a removed piece whose square now holds a piece of the other colour (a promotion also removes an element, but the same colour stands there).
  More than 2 removals at once = a jump in the move list: ignored.
- Lishogi's squares are not square (taller than wide): use the `d-9x9` class of `.sg-wrap` and the sg-pieces rect for width and height separately.
- Piece pictures: lishogi uses CSS background images (data: URIs; gote pictures are already upside down). The script remembers the computed
  background-image of every piece kind while it is on the board (`imgCache`, key "orientation|color role"); the removed element has no style any more.
- Drawing: one fixed canvas over the whole window (z-index 2147483000, pointer-events none), only drawn while effects run.

## Effects
Random from: classic (knock-away + burst by the taker: pawn stomp, lance strike, knight bounce, silver/bishop/horse slice, gold/rook/dragon ram, king royal),
poof, flick, sink, splat, pixel, vortex, balloon, frost, confetti, abduct, zap (only the hit, no lightning from the mover).
LEFT OUT on purpose (they move the taking piece their own way and would fight lishogi's animation): slash, pancake, meteor, train, zap's teleport.
Also left out: hit-stop, board shake, board zoom (they would move lishogi's board).

## Testing
`node tools/fx_lishogi_test.mjs` (headless Edge, lishogi.org/analysis, plays 7g7f 3c3d Bx2b+, screenshots lfx_*.png in the scratchpad).
Only the analysis board is used for tests (never real games).
