# split-check

These are the checks for splitting `game.html` into `src/1-config.js` … `src/9-main.js`. They're plain Node scripts with three pinned dev dependencies: acorn (the pipeline already uses it), acorn-walk, and eslint-scope, which resolves references so shadowed locals don't count.

```
cd tools/split-check && npm install
```

## inventory.mjs: the original against a placement

```
node inventory.mjs ../../game.html placement.json
```

`placement.json` maps every top-level identifier (and every other top-level statement, by line range) of the original to its module. It is the one copy of the placement; if a placement changes, edit it here and rerun.

The script reports five things:

- statements with no file (exit 1)
- upward references (EVAL marks ones that run while a module evaluates)
- bindings reassigned from another file
- eval-time reads of a higher file or a later declaration (class TDZ), following calls, `new`, `X.m()` and `this.m()`; callbacks other than synchronous array-method arguments are treated as deferred
- whether the statements that construct three objects keep their original order (three sorts opaque draws by material id)

It always analyses the original. So the upward references and cross-file writes that the required edits cut still show here. That's expected and doesn't fail.

## check-layers.mjs: the split modules' structure

```
node check-layers.mjs ../../src ../../game.html
```

These are errors (exit 1):

- an import from a same- or higher-numbered module or a non-src relative path (bare `three` and `three/...` are allowed)
- importing a name the target doesn't export
- re-exports, default exports or namespace imports between src modules
- a write to an imported binding (an `export let` another file reassigns, which would throw at runtime)
- a free name that no module declares or imports and that the original never used as a global, which most likely means a missing import (this one needs game.html)

These are notes:

- every `export let` and how often its own file writes it
- every top-level statement in files 1 to 8 that isn't a declaration, import or export, marked `[LISTENER]` or `[WAKE]` where it registers a listener or calls `wake`/`invalidate` (the "files 1 to 8 declare; main starts" rule)

## check-decls.mjs: nothing lost, nothing changed by accident

```
node check-decls.mjs ../../game.html ../../src edits/*.json
```

Every top-level declaration of the original must exist in exactly one module with the same code. Every other top-level statement must still appear somewhere in a module: a top-level match is preferred (a short statement like `wake();` also occurs inside function bodies), else it may sit inside a `bind()`/`init()` body.

Code is compared as token streams, so whitespace, indentation and `export` don't count. Comments are compared separately. A template literal that differs only in leading whitespace (a dedent) is reported as whitespace-only.

Each edits file lists what its phase may change (all keys optional). Against game.html every phase is compared with the original, so pass all the edits files so far; they are merged. That cumulative run cannot see a second change to a name an earlier phase already listed, so each phase is also checked against the previous phase's modules:

```
node check-decls.mjs --base <previous src> - ../../src edits/phaseN.json
```

With `--base`, the edits file must list exactly what this phase changed. `changed` may name a renamed declaration by its old or new name. In base mode a changed non-declaration statement is named `file:line` in the previous phase's modules (for example `9-main.js:3343`), and `statementsChanged` takes that form.

The edits file format:

```json
{
  "changed": ["Ecosystem", "Animal"],
  "removed": ["sceneDirty", "rafId", "last"],
  "added": ["loop"],
  "statementsChanged": [13863],
  "renamed": { "world": "ecosystem", "NpcWorld": "Ecosystem" },
  "commentsChanged": ["Animal"]
}
```

`changed` and `removed` take original names; `added` takes new declaration names; `statementsChanged` takes original start lines of non-declaration statements that the phase edits. `renamed` is applied to the original's identifier tokens before comparing, so a pure rename passes as unchanged. A string, shader or comment that a blind text replace touched still shows up: tested with a plain `sed` of `world`, it flagged `HUMAN_VERTEX_PARS`, `debugReadout` and `loadWilderness`, whose string text contains the word. `commentsChanged` lists declarations whose comments the phase edits (for example the three instance comments of the rename).

It fails (exit 1) on a declaration that's missing, declared in more than one module, or changed without being listed; on a statement not found without being listed; on a new declaration not listed under `added`; and on comments changed inside a declaration listed under neither `changed` nor `commentsChanged`. Items that are listed but turn out unchanged are reported, so the edits file stays honest.

## cut-phase1.mjs: the phase 1 cut

```
node cut-phase1.mjs ../../game.html ../..
```

Writes `index.html` (game.html's markup, CSS and importmap, with the inline module replaced by `<script type="module" src="src/9-main.js">`) and `src/9-main.js` (every script line, moved as is, plus the module-map header). The `<script>` block's 4-space indent comes off every line except those that start inside a template literal, so shader strings stay byte-identical. CRLF line endings are kept.

## cut-phase2.mjs: the phase 2 cut

```
node cut-phase2.mjs ../..
```

It runs on the phase 1 `src/9-main.js` and moves the config and core statements, each with the comment and blank lines above it, into `src/1-config.js` and `src/2-core.js` in their original order. It applies the phase's edits on the AST:

- the `loop` object (references resolved through scope, so a local `last` is untouched)
- `wrapAngle`, `turnToward` and `TWO_PI` moved out of Animal
- `GROWTH_MIN_SCALE`

It then exports every declaration in files 1 and 2 and writes each file's import list from the names it actually uses. The allowed changes are recorded in `edits/phase2.json`, which is what `check-decls.mjs` gets for this phase.

## lib/cut.mjs and cut-phase3.mjs onward

`lib/cut.mjs` is the shared engine for phases 3 to 7. It reads `src/9-main.js` and decides where each statement goes: by its declared names in `placement.json`, or, for a non-declaration, by matching its tokens to the original statement. New or already-edited statements stay in main. It moves the chosen files' statements out whole and in order, runs the phase's AST edits, exports every declaration of files 1 to 8, and rebuilds every module's imports. Run on the phase 2 output with nothing to move, it reproduces all three files byte for byte.

```
node cut-phase3.mjs ../..
```

Phase 3 extracts `3-gfx-io.js` (the gfx half, then the io half; the script stops if either half references the other) and `4-provider.js` (with the `providers` object and the provider contract comment). `edits/phase3.json` was generated from the original: the declarations that reference `activeWorld` or `perf.terrainVersion`, plus `perf` and `fetchBuildings`.

`ownerObject()` in the engine turns a file's module-level `let`s into fields of one exported object declared where the first of them was, and rewrites every reference in every file. Phase 4 uses it for `collision`.

```
node cut-phase4.mjs ../..
```

Phase 4 extracts `5-collision.js`, with `collision = { wallGrid, gridWalls, shellGrid, shells, solidStamp, stampNo, obstacleThroats }`.

`ownerObject()` also takes `rename` (a let becomes a differently named field) and `extra` (methods after the fields); it collects every reference before it inserts the object, so the object may reuse a let's name (`shelters` -> `shelters.list`). `addMember()` inserts a method before a named member of an object literal or class. `placement.json` has an `added` map for declarations created since phase 0 (for example `foodBoxView` -> 8), which the engine honours like the original identifiers.

```
node cut-phase5.mjs ../..
```

Phase 5 extracts `6-worlds.js` with these edits:

- `isOpen` moves to collision, reading `collision.openBounds`, which `initialize` copies from the provider's bounds.
- `foodBoxes` owns its sight grid (`foodBoxes.sight`, filled by `buildSight`).
- `foodBoxView` takes over the food-box render cull.
- `IntroWorld.drive` only moves walkers; `frame` draws them.
- The intro's clock is handed in (`iw.clock`).
- The owners `groundMatch.half` and `shelters.list` (with `reset()`).
- Each system `teardownWorld` touches gets a `reset()` entry, including `resetGroundPlane()` in 3.
```
node cut-phase6.mjs ../.. --record
```

Phase 6 extracts `7-sim.js`:

- `step` stops drawing: main's `drawEcosystem` runs the same calls, then `ecosystem.endTick()`.
- `clear` and `initialize` stop drawing and resetting the player: main's `clearEcosystem` and `populate` wrap them.
- `syncPopulation` becomes `populationChanged()`.
- The game registers `afterContacts` and `avatar`.
- Plants report through `plantView`.
- `simSky` owns `site` and `sunAltDeg`, with `onSkyStep` and `onMinute` hooks.
- `world` -> `ecosystem` and `NpcWorld` -> `Ecosystem`, using the engine's `renameBinding()` (scope-aware; it stops if the new name is already bound where it lands) and `letsIntoObject()`.
- `--record` writes the renames and the new names into `placement.json`.

VR was skipped on request.

```
node cut-phase7.mjs ../.. --record
```

Phase 7 extracts `8-render-player-game.js`; what is left is `9-main.js`.

- A pre-pass wraps file 8's listener registrations into `bindInventory`, `bindKeys`, `bindMouseLook`, `bindTouch` and `bindCar`. Each bind is one run of registrations with no main side effect between them. Main calls each bind where its run's last statement stood.
- The four listeners that use main's functions (runNew, the pointer-lock pair, Escape) stay in main.
- Owners: `play { active, locked }`, `skyChoice { time, sky }`, `touchKnob { dx, dy, dirty }`, `rainClock { drawn }` (`ownerObject` now accepts `let a, b, c` statements).
- `cat`, `car` and `labels` get `reset()` methods.
- `vr.start` runs `loop.frame`.

## listeners.mjs: listener order

```
node listeners.mjs ../.. game.html a.txt; node listeners.mjs ../.. index.html b.txt; diff a.txt b.txt
```

This lists every event listener on `window`, `document` and the canvas after the intro loads, in registration order, with each handler's first source line. Positions are corrected for the original's inline script. The phase 7 owners are normalized. Diffing two pages' lists checks that the listener order survived.
## edits/

One edits file per phase (`phase2.json`, ...), the record of what that phase was allowed to change.

## smoke.mjs: load the page and read the game's own Debug readout

```
node smoke.mjs ../.. index.html [--wild] [--low] [--walk] [--survivor] [--fast] [--three <local three dir>]
```

This serves the folder from a local static server and opens the page in headless Chromium (SwiftShader). It reads the Debug readout (graphics, shader programs and failed links, people, script errors) on the intro scene; with `--wild` it does the same after a City-off wilderness load and Observer, Go. `--low` starts on Graphics low. `--fast` sets Custom size (map level 1, the people slider's minimum), a 480x300 viewport, shorter waits and a shorter walk, and reads the Debug readout only at the last stage (each readout waits on the page's long software-rendered frames). A run takes about 40 to 120 s instead of 2.5 to 4 min, and high graphics stops crashing the headless renderer. `--survivor` chooses Survivor instead of Observer; each readout prints the mode in play (the needs panel and the New game / New ecosystem button). `--walk` (with `--wild`) then walks, jumps and sprints on the keyboard for about 9 s and reads the readout again, which exercises the player's collision and footing. `--three` serves `https://unpkg.com/three@0.160.0/...` from a local copy for machines that can't reach unpkg; the page itself is unchanged. Exit 1 on any script error, failed request, renderer crash or failed shader program.

Run one page at a time. Two high-graphics wilderness runs in parallel crashed the renderer for both the original and the split (it's a SwiftShader memory limit, not the code); run sequentially, both pass. Playwright comes from `PLAYWRIGHT_PATH` or a normal `require('playwright')`.

Modules don't load from `file://` (Chromium blocks them under CORS, confirmed), so open `index.html` through any static server, for example `npx serve` or `python3 -m http.server` from the project folder.

## What these don't check

- Runtime behaviour, shader compiles, listener order, or the in-game checklist.
- TDZ on the split modules themselves. `inventory.mjs` covers it through the original plus `placement.json`, as long as each file keeps the original relative order of what it receives.
- `node --check` per module and the local static server run are separate steps.
