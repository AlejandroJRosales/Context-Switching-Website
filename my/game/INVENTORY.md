# Nova Orbis module split: Phase 0 inventory

No code changed. Source: `game.html`, 16,548 lines; the module script is lines 1404 to 16544, with 1,056 top-level statements (2 imports, 942 declarations naming 967 identifiers, 112 other statements).

Method: acorn parse, eslint-scope for reference resolution (so shadowed locals don't count), and a reachability pass that follows calls and `new` from each top-level statement (callbacks such as listeners and rAF are treated as deferred). The full placement is in `tools/split-check/placement.json` (identifier to file plus original line range) and listed per file in section 9.

Every claim below is from that analysis plus reading the code at the cited lines. Where I say "worth checking", I haven't proved the issue, only found the path to it.

One note on "Record it": there is no ARCHITECTURE block in this game.html (no match for "architecture" in any case). So the module headers will be new text rather than a replacement.

---

## Decisions (approved 2026-10-26)

These settle the questions in section 8; later phases follow them.

- **Q1:** the class is renamed too. `NpcWorld` becomes `Ecosystem` and the instance `world` becomes `ecosystem` (code and the 3 instance comments in E14).
- **Q2 (exact):** `updateSky` keeps computing the sun altitude and writes it to `simSky.sunAltDeg`; sim reads `night` from there. The `let sunAltDeg` binding goes away.
- **Q3:** `step` ends before `this.ticks++`; main renders, then calls `ecosystem.endTick()`. The drive path renders its two calls only and skips `endTick()`.
- **Q4:** `loadIntroScene` sets `iw.clock = simSky` next to `iw.prevHour`; `IntroWorld.teardown` restores through `this.clock`.
- **Q5:** listener registration keeps the exact original order (main's init sequence in section 5, input bind split in three).
- **Q6:** the section 1 placements stand: look helpers in 7, `WILD_GROVES` and the loading-step tables in config.
- **Q7:** each system gets a `reset()` doing what `teardownWorld` does to it today; existing `clear()`/`dispose()` stay for their other callers.
- **Q8:** `isOpen` reads `collision.openBounds`, written by `initialize` where it sets `minX..maxZ` today.

Check tools: `tools/split-check/` (see its README). `tools/split-check/placement.json` is the one copy of the placement; update it there if a placement changes, then rerun `inventory.mjs`.

**For phase 1 (found while testing the checks):** moving the script into `src/9-main.js` with its 4-space indent removed also changes the text of 13 multi-line template literals (the facade, human, billboard, water-clip, indoor-clip, lamp and rain shaders). GLSL ignores the whitespace and the pipeline's GLSL pass strips it, but the strings would no longer be byte-identical. Recommendation: dedent every line except those inside template literals (the cut script can use acorn's token ranges), so `check-decls.mjs` reports 0 whitespace-only changes.


## Phase log

- **Phase 1 (2026-10-26), shell:** `index.html` and `src/9-main.js` cut by `tools/split-check/cut-phase1.mjs`. Every one of the 15,141 script lines is either identical or identical minus the 4-space block indent; the 305 lines inside template literals are untouched.
  - The markup, CSS and importmap lines are byte-identical to game.html.
  - `node --check` ok; `check-layers` 0 errors; `check-decls` with no edits file: 0 changed declarations, 0 comment changes, 0 whitespace-only template changes, 0 errors.
  - `smoke.mjs`, intro plus a City-off wilderness load, Observer: game.html and index.html both report 0 failed shader programs (intro 8 to 10 programs, wilderness 38 on low and 44 on high), 3,000 people, no script errors on high and on low.
  - Modules don't load from `file://` (confirmed), so the game now needs a local static server during development.

- **Phase 2 (2026-10-26), config and core:** `tools/split-check/cut-phase2.mjs` moved 446 identifiers (447 exports with `GROWTH_MIN_SCALE`) and the 3 table-filling loops to `src/1-config.js`, and 26 identifiers to `src/2-core.js` (27 exports after the edits: the 3 loop lets became `loop`, plus `TWO_PI`, `wrapAngle`, `turnToward`), each with the comment lines above it, in original order. Everything in 1 and 2 is exported; 9-main and 2-core import exactly the names they use.
  - Edits (`tools/split-check/edits/phase2.json`):
    - `loop` in core replaces `let last`/`rafId`/`sceneDirty`; every scope-resolved reference becomes `loop.<name>`; core's `wake` schedules `loop.frame`, which main sets first thing (`loop.frame = frame`).
    - `TWO_PI`, `wrapAngle` and `turnToward` move to core from Animal's statics; `Animal.TWO_PI` aliases core's.
    - `GROWTH_MIN_SCALE` (0.25) moves to config, from AnimalRenderer's `this.MIN_SCALE`, and is read at all 4 former sites.
    - `playerPlantFood` moves to config verbatim.
  - The 12 changed declarations are exactly the listed ones: `wake`, `invalidate`, `frame`, `vr`, `CatCompanion`, `pov`, `syncCarMesh`, `Animal`, `AnimalRenderer`, `BlobShadows`, `HealthBars`, `IntroWorld`, plus the visibility statement (15357). There are 0 comment or whitespace changes.
  - `node --check` ok for all three files, `check-layers` 0 errors, `check-decls` 0 errors.
  - `smoke.mjs`, intro plus wilderness Observer: low passed; high passed 2 of 3 runs. One high run of the split crashed the headless renderer after the load; four further high runs (2 original, 2 split) passed, and the parallel runs in phase 1 crashed the original too. I read it as SwiftShader instability, but it is worth watching on real hardware.
  - Section-header comments travel with the statement below them, so a few headers now sit in a different file than the code they used to introduce. For example, "BUILDING SHELLS" now heads `dedupeRing` in core.

- **Phase 3 (2026-10-26), gfx-io and provider:** cut by `tools/split-check/cut-phase3.mjs` on the shared engine `lib/cut.mjs`; 89 statements went to `src/3-gfx-io.js` and 7 to `src/4-provider.js`.
  - Placement changes (recorded in placement.json `changes`):
    - `wallColorOf` and `roofColorOf` go to 6, since only `buildCity` uses them.
    - The canvas append (1761) stays in main, at its original place among main's statements (DOM building).
    - `_col` and `cssColor` stay in the gfx half, because `rgb` uses `_col`.
  - Edits (`edits/phase3.json`):
    - `providers = { active, version }` in 4 replaces `let activeWorld` and `perf.terrainVersion`; perf loses that field.
    - `fetchBuildings` drops `onNote = say`.
    - 3-gfx-io.js is laid out as the gfx half then the io half (each in original order); the cut stops if either half references the other.
    - The provider contract is written as a comment in 4's header.
  - 23 changed declarations, exactly the ones that reference `activeWorld` or `perf.terrainVersion` plus `perf` and `fetchBuildings`, and the game-mode statement (16382).
  - `check-decls` now merges every phase's edits file, since each phase is compared against the original.
  - `node --check` ok on all five files; `check-layers` 0 errors (4 imports nothing from 3); `check-decls edits/*.json` 0 errors; `inventory.mjs` unchanged (0 unplaced, 0 TDZ, construction order unchanged).
  - `smoke.mjs`, intro plus wilderness Observer: passed on low and twice on high, 0 failed shader programs, no script errors.

- **Phase 4 (2026-10-26), collision:** `tools/split-check/cut-phase4.mjs` moved 26 statements to `src/5-collision.js`.
  - Edit (`edits/phase4.json`): `collision = { wallGrid, gridWalls, shellGrid, shells, solidStamp, stampNo, obstacleThroats }` in 5 replaces the seven lets, declared where the first one was, with each initializer kept. Every reference in every file now goes through `collision.` (scope-resolved). Resets still assign new arrays and maps, so rain's identity check on `shells` keeps working.
  - 22 changed declarations, exactly the ones that reference those seven names. The engine gained `ownerObject()` for this; phases 5 to 7 use it again.
  - `node --check` ok on all six files; `check-layers` 0 errors (5 imports only 1, 2 and 4); `check-decls edits/*.json` 0 errors; `inventory.mjs` unchanged.
  - `smoke.mjs` gained `--walk` (walk, jump and sprint after Go). Results: intro plus wilderness passed on low and twice on high. Of the walk runs on low, the split crashed the headless renderer in 2 of 7 and the original in 0 of 7.
  - Memory, measured after a forced GC at intro, wilderness and walk: the same for both pages (JS heap 5, 70, 70 MB; renderer 350 to 425 MB). So the split retains no extra memory.
  - The 1.2 to 2.7 GB renderer peaks appear only while the Debug readout is open (it renders a probe and relinks programs each second). Every crash happened inside that readout call. The split's peaks ran higher in some runs, and I can't tell from 14 runs whether that is the split or chance in SwiftShader. Worth watching on real hardware with the Debug readout open.

- **Phase 5 (2026-10-26), worlds:** `tools/split-check/cut-phase5.mjs` moved 93 statements to `src/6-worlds.js`, which imports only files 1 to 5. Edits (`edits/phase5.json`):
  - `isOpen` is now collision's `isOpen(x, z)` over `collision.openBounds`. `initialize` copies `openBounds` from the provider's bounds, on the line after it sets `minX..maxZ`. All callers (`plantSpot`, `wildPoint`, Animal, `spawn`) call it directly.
  - `foodBoxes.sight`, built by `buildSight(spanX, spanZ)` at the same point of `initialize`, replaces the ecosystem's `foodSight`. Animal, `touching` and `eat` read it.
  - `foodBoxView` (placed in 8 via placement.json `added`) holds the former `foodBoxes.render`; `foodBoxes` keeps the data and the mesh it draws.
  - `IntroWorld.drive` only moves walkers. `frame` calls `animalRenderer.update` and `blobShadows.update` right after the step on that path (after drive's tick, as before). `IntroWorld.teardown` restores the hour through `this.clock`, which `loadIntroScene` sets to `simSky`.
  - `groundMatch.half` and `shelters.list` with `shelters.reset()`.
  - `reset()` entries for `cityWater`, `streets`, `elevation`, `occ`, `cover`, `wildWater` and `pebbles`, plus `resetGroundPlane()` in 3; `teardownWorld` calls them. Provider teardowns are unchanged.
  - 24 changed declarations, all listed; comments changed only in listed ones (the added lines). `check-layers` 0 errors; `check-decls edits/*.json` 0 errors; `inventory.mjs` unchanged.
  - `smoke.mjs`: low with walk passed (intro 6 detailed walkers, so the drive path draws).
  - High: one crash, then a comparison of 3 high wilderness runs each. The original crashed 1 of 3, phase 4 1 of 3, phase 5 0 of 3. The headless renderer crashes the original as often as the split.
  - This corrects phase 4's reading: its 2-of-7 versus 0-of-7 walk split was chance, not a difference between the builds.
  - Not testable here: a City load, the only place food boxes exist. Overpass and the hosted city files are unreachable from this sandbox, so `buildSight` and `foodBoxView` ran only with no crates. Worth checking on a suggested-place load.

- **Phase 6 (2026-10-26), sim:** `tools/split-check/cut-phase6.mjs` moved 21 statements to `src/7-sim.js`, which imports only files 1 to 6 and calls nothing above it. Edits (`edits/phase6.json`):
  - `step` returns before its tick advances; `frame` calls `drawEcosystem(npcElapsed)` (the nine former tail calls of step, same order, `this` read as `ecosystem`), then `ecosystem.endTick()`. The intro's drive path draws only its walkers and skips `endTick`.
  - `initialize` no longer resets the player or touches renderers. `populate(provider)` does: `game.reset`, `pov.newBody`, `animalRenderer.init`, `plantRenderer.init(provider.bounds)`, `initialize`, the four instance writes, then the HUD if the population changed. `clear` is wrapped the same way by `clearEcosystem()`. `syncPopulation` is now `populationChanged()`, and main refreshes the HUD on it.
  - `game.update(dt)` runs from `this.afterContacts`, at the same point in step. `ecosystem.avatar` is registered by the game after `game` is declared, and Animal's three reads use it.
  - `plantView = { add, remove, touch, pending }`, filled after `plantRenderer` is constructed.
  - `simSky.site`, and `simSky.sunAltDeg`, still written by `updateSky` (exact option); `simSky.onSkyStep = updateSky` and `simSky.onMinute = refreshHud`.
  - Renames: `world` -> `ecosystem` and `NpcWorld` -> `Ecosystem` (scope-resolved: declaration, references and class-scope self-references). In comments, `NpcWorld` everywhere, the three instance comments, and the section header.
  - **VR skipped, as asked:** `vr.poll`'s B button still calls `ecosystem.initialize(providers.active)` directly, so in VR a new population skips the game reset, the new player body, renderer init and the instance writes. This differs from the original; route it through `populate` when VR is taken up.
  - `check-decls --base` (new, against the phase 5 modules) with `edits/phase6.json`: exactly the 13 listed code changes and 2 comment-only changes, 0 errors. The cumulative run against game.html: 0 errors. `check-layers` 0 errors; `inventory.mjs` unchanged.
  - `smoke.mjs`: Observer low with walk, high, and high with walk passed.
  - Survivor (new `--survivor`, mode confirmed by the needs panel): the original passed 2 of 2, the split 1 of 3 (2 crashes inside the Debug readout).
  - Without the readout, 4 Survivor runs measured the same JS heap (70 MB) for both builds, with no growth over 20 s, and no crashes.
  - A logpoint on `game.update` counted 6 calls in 10 s in the split against 8 in the original, with the avatar alive in each, so the after-contacts hook and the avatar registration work. The sim ticks under 1 Hz in this sandbox with 3,000 people, so need bars barely move there.

- **Phase 7 (2026-10-27), render, player and game:** `tools/split-check/cut-phase7.mjs` moved 190 statements to `src/8-render-player-game.js`; `src/9-main.js` is what remains (its header lists what it owns). Edits (`edits/phase7.json`):
  - **Binds (Q5).** A pre-pass wrapped file 8's listener runs into `bindInventory` (13335 to 13342), `bindKeys` (13854 to 13861), `bindMouseLook` (13877), `bindTouch` (13946 to 14098) and `bindCar` (14547 to 14674). Main calls each where its run's last statement stood.
    - Runs end only at main's own side effects; the script stops if a main statement falls inside one.
    - runNew (13343), the canvas pointer-lock request (13863), `pointerlockchange` (13869) and Escape (13895) moved to main (placement.json `changes`).
    - The car mesh block and the sun and moon canvases stay top-level in 8 as construction.
  - **Owners:** `play { active, locked }`, `skyChoice { time, sky }`, `touchKnob { dx, dy, dirty }`, `rainClock { drawn }`.
  - **Resets (Q7):** `cat.reset()`, `car.reset()` and `labels.reset()`, which `teardownWorld` now calls; `disposeRain()` and `skyFade.reset()` already were reset entries.
  - **VR:** `vr.start` drives the XR loop with `loop.frame` instead of importing main's `frame` (the same function, registered in core). That is the only VR change; the populate hook stays skipped.
- **Phase 7 checks:**
  - **Static:**
    - `check-layers`: 0 errors. No upward import, no write to an imported binding, no missing import; file 8's top-level statements are the four construction blocks only.
    - `check-decls --base` (phase 6 modules) with `edits/phase7.json`: the 18 changed declarations and 11 changed statements, 0 errors. A token diff of each shows only owner-field rewrites, the three new reset methods and `teardownWorld` calling them, and `vr`'s `loop.`.
    - Cumulative against game.html: 0 errors. `inventory.mjs`: 0 unplaced, 0 TDZ, construction order unchanged; upward references in the original down to 27, since the four main-bound listeners left 8.
  - **Browser:** `smoke.mjs` passed Observer on low with walk, Observer on high with walk, and Survivor on low with walk (needs panel on, button "New game"). One high run crashed in the Debug readout, which the original also does about one time in three.
  - **Listener order:** the new `listeners.mjs` compared every listener on window, document and the canvas after the intro, in order with handler source. 34 of 35 are identical in both builds, including the five window `keydown` handlers.
  - **The one difference:** the canvas's two `webglcontextrestored` listeners swapped. Main's `() => invalidate()` (game.html 1905) used to register before AnimalRenderer's billboard rebake; now `animalRenderer` is constructed while file 8 loads, before main runs. Both run in the same event before the next frame, so the drawn result should not change. Restoring the exact order would mean registering that one listener at file 3's top level, an exception to the declare-only rule.

- **Phase 8 (2026-10-27), bundle:** `tools/bundle.mjs` (esbuild 0.28.2, pinned in `tools/package.json`) bundles `src/9-main.js` and its 8 imports as one ES module. Format esm, three and `three/*` external (the importmap resolves them as before), no minify. It inlines the result into index.html's module tag, giving `dist/game.html`.
  - esbuild turns top-level `const`/`let`/`class` into `var`. That behaves the same for code that never reads a binding before it is set, which the inventory's TDZ check found to hold.
  - esbuild renames the merged three imports (`THREE5`, `mergeGeometries3`). The pipeline still sees `from "three"` and turns `booleans_as_integers` off as for the original.
  - It keeps only legal comments, so the `/* glsl */` markers go; the pipeline finds shaders by content and counts the same 23.
  - `production-pipeline.mjs` (as attached, with terser 5.51.2, acorn 8.19.0, @shaderfrog/glsl-parser 7.0.1), `--domains contextswitching.org`:

| | input raw | input gzip | production raw | production gzip |
|---|---|---|---|---|
| original game.html | 741.5 KB | 219.0 KB | 353.2 KB | 130.2 KB |
| bundle dist/game.html | 623.9 KB | 182.6 KB | 355.3 KB | 129.0 KB |

  - Both runs report the same stages: 23 shader literals (5.7 KB saved), every shader token-identical after terser (2 constant interpolations folded), 32 GL names kept, 13 shaders parsed (10 fragments skipped), domain lock present.
  - The production bundle is 2.1 KB bigger raw (+0.6%) and 1.2 KB smaller gzipped. Counting the owner-object property accesses (`.shells`, `.active`, `.sceneDirty` and the rest) that terser cannot mangle, where the original's lets were mangled to one or two letters, gives 2.2 KB, which accounts for the raw difference.
  - `smoke.mjs` gained `--fast` (Custom size at map level 1 and 1,000 people, a 480x300 viewport, one readout at the last stage).
  - Fast matrix, low with walk, low with walk in Survivor, and high, over the original, the split, the unminified bundle and both production builds: 13 of 15 passed, all with 0 failed shader programs and no script errors. The two crashes were the original (Survivor) and the bundle's production build (Survivor). High passed on all five builds.
  - Both production builds register the same 35 listeners on window, document and the canvas, in the same order of type (`listeners.mjs`; handler text differs after mangling).

---

## 1. Placement decisions that are borderline or differ from the brief

| Identifier(s) | Proposed file | Why |
|---|---|---|
| `humanLook`, `packHumanLook`, `inheritHumanLook` | 7-sim | **Differs from the brief** ("look packing" in 8). `Animal`'s constructor calls `humanLook` (5325), mate calls `inheritHumanLook` (6200), and both call `packHumanLook`. With packing in 8, sim would import upward. AnimalRenderer (7162) and `pov` (11075) import them from 7 instead. |
| `presetHour` | 7-sim | `simSky.start` calls it (14753); it is `FALLBACK_HOURS[name]`. `skyHour` in 8 imports it. |
| `tools` (the `MathTools` instance) | 2-core | `foodBoxes.touching` (file 6) uses `tools.distSq`. |
| `fightEase`, `fightClamp01` | 2-core | Arrow functions used by 7 (fight moves) and 8 (`petQuant`); they're math, not data. |
| `playerPlantFood` | 1-config | `SURVIVOR_CONFIG.items.plant` has a getter that calls it (12821), and it is a pure function of config numbers. |
| `WorldConfig`, `CONFIG` | 1-config | A class of world tunables. `CONFIG.applySize` mutates fields from main's loads; the binding itself is never reassigned. |
| `SURVIVOR_ACTIONS`, `SURVIVOR_FIELD_ACTIONS` | 8 | Behaviour tables (`run`/`find` functions). `FIELD_ACTIONS` reads `foodBoxes`, `cat`, `petting`. Only `SURVIVOR_CONFIG` goes to config. |
| `WILD_GROVES` (241 lines) | 1-config | Pure data. It could sit with the wilderness in 6, like `INTRO_SCENE`. Your call. |
| `CITY_STEPS`, `WILDERNESS_STEPS` | 1-config | Loading-step text tables; only main uses them. They could stay in main. |
| `INTRO_SCENE` | 6-worlds | As the brief says, even though it is pure data. |
| `MOON_FALLBACK` (3), `LAMP_COLOR` (6), `OVERCAST`, `FOGGY`, `BRAIN_NODE_GEO` (8), `DEBUG_PROBE_BG` (9) | owners | Tunables that construct three objects, so they can't live in a no-import config. Splitting each into a raw number in config plus construction in the owner would be a non-verbatim edit; I can offer it later. |
| `RAIN_MAX` (8), `MSAA_SAMPLES` (3) | owners | They read `matchMedia` and `renderer.capabilities`. |
| `HUMAN_VERTEX_PARS/MAIN`, `BB_VERTEX_PARS/MAIN`, `BB_BAKE_OUT` | 8 | Shaders stay with their owners. These are the only five `/* glsl */` strings, and all land in 8. |
| `UP`, `NO_WIN` | 3 | Buffer-helper constants, not tunables. |
| `perf` | 3, minus `terrainVersion` | The brief puts the version counter in 4. `perf.lowPower`, the LOD distances and `instances`/`setText` stay in 3. `terrainVersion` (7851; read 4285/4287; bumped 12012, 15997) becomes `providers.version`. |
| `layers` | 6 | The city layer list (`clearLayers`, `addLayer`, `foodBoxes.draw`). It is declared among the gfx lines (1842). |
| `pointInShell` | 5 | `supportAt`, `ceilingAt`, `buildShellRaster` and `shellAtExact` call it. |
| `placeKindOf` | 3 | A parser helper over config tables. |
| `poleSolid` | 6 | Builds solids for lamps and trees. |
| `populationText` | 8 | `vr.updateHud` calls it (11213); main's `refreshHud` imports it. |
| `avgFps` | 8 | `graphics` resets it on a quality change; `frame` reads it. |
| `returnToIntro` | 9 | Uses `panel` and `showControls`. |
| `wake`, plus `last`/`rafId` | 2 | As fields of a core loop object (section 4), because `invalidate` (core) calls `wake`, and `vr` (8) writes `rafId`/`last` and calls `frame`. |
| DOM lookups | 8 or 9, by user | `dotEl`, `stickEl`, `knobEl`, `flyEl`, `climbEl`, `upEl`, `downEl`, `povEl`, `raysEl`, `gfxEl`, `vrEl`, `vrOverlayEl`, `vrStatsEl` and `avgFpsEl` go to 8, along with the car, pedal and Survivor elements. `panel`, `addrEl`, `statEl`, `hudEl`, `gearEl`, `settingsEl`, `timesEl`, `skiesEl` and the rest stay in 9. |
| `timeMode`, `skyHour`, `skyInstant`, `conditions`, `zoneOffset`, `cityNow`, `clockText`, `site`, `skyFade` | 8 (sky drawing) | Depends on question Q2 (night). Under option B, the time-selection chain moves to 7. |

THREE is imported by files 3, 6, 7, 8 and 9; `mergeGeometries` by 6 and 8.

---

## 2. Upward calls beyond the brief's list

| # | Where (line) | Call | Proposed fix |
|---|---|---|---|
| U1 | `invalidate` 15366, 2 to 9 | `wake()`, which uses `rafId` and `frame` | A core loop object holds `rafId`, `last`, `sceneDirty` and a `frame` slot that main fills; `wake`/`invalidate` live in 2. No eval-time code in files 1 to 8 reaches `wake` or `invalidate` (checked), so `loop.frame` is set before any call. |
| U2 | `fetchBuildings` 2000, 3 to 9 | default parameter `onNote = say` | The only caller (16213) passes its own callback, so dropping the default changes nothing. |
| U3 | `IntroWorld.teardown` 12242, 6 to 7 | `simSky.hour = this.prevHour` | See Q4. |
| U4 | `NpcWorld.clear` 12377-12382 | `animalRenderer.update`, `blobShadows.update`, `plantRenderer.rebuild` + `update`, `healthBars.update`, and the HUD refresh through `syncPopulation` | The same cut as `step`/`initialize`. `clear` is called from `teardownWorld` (15969) and from `loadPlace` when nothing spawns (16311), so main needs one helper for both. |
| U5 | `NpcWorld.step` 12666-12667 | reads and clears `plantRenderer.pending` | It belongs with the plant hook (section 3, E8). |
| U6 | `simSky.update` 14792, 14796 | `updateSky()`, `refreshHud()` | Hooks on `simSky` that main fills (for example `onSkyStep`, `onMinute`), called at the same two spots. Returning flags to `frame` would also work but moves the calls later. |
| U7 | `Animal.canHunt` 5734 | `game.avatar` | A third read site besides locate (5515) and searchDeer (5855). The avatar registration covers all three. |
| U8 | `vr.poll` 11201 | `world.initialize(activeWorld)` on the B button | Once `initialize` stops doing `game.reset`/`pov.newBody`/renderer init, this path would skip them. It has to go through main's populate helper via a hook on `vr`. |
| U9 | `vr.start`/`vr.end` 11221-11235 | writes `rafId`, `last`; calls `frame`, `wake` | The loop object (U1). |
| U10 | Listeners in the 8 range: 13343 (`newEcosystem`), 13863 (`panel`), 13869 (`setSettingsOpen`), 13895 (`settingsEl`, `setSettingsOpen`) | main functions and elements | These four registrations move into main. Every other input listener only needs `wake`, which is core after U1. |
| U11 | `CatCompanion` (10406), `pov` (11037), `syncCarMesh` (14310) | write `sceneDirty = true` directly | These become `loop.sceneDirty = true`. |
| note | `Entity.remove` 5285 | `scene.remove(this.mesh)` (7 to 3) | Downward, so allowed. `Animal` and `Plant` override `remove()` and `mesh` is always null, so sim imports `scene` only for a dead path. I'm not touching it, just noting it. |

The brief's listed calls were all found where expected: NpcWorld 7 to 8/9, Animal to `animalRenderer.MIN_SCALE`/`plantRenderer.touch`/`game.avatar`, `Plant` to `plantRenderer`, `foodBoxes` to `world.foodSight`/`npcOnScreen`, `IntroWorld.drive` to renderers, `world.isOpen` from `CityWorld.plantSpot` (11642) and `WildernessWorld.wildPoint` (12183), and `Animal.wrapAngle` from `IntroWorld`.

---

## 3. Things worth checking in the required edits

**E1. The tick counter versus renders moved to main (the biggest one).** In `step`, the renders run before `this.ticks++` (12705). They read the tick: `AnimalRenderer.update` uses `world.time` (7441) and `world.ticks` (7458); `BlobShadows` uses ticks (12777); `HealthBars` uses ticks (13635) and time (13706); the label and HUD modulo checks use ticks (12701, 12704). If main calls them after `ecosystem.step`, each one reads ticks + 1 and labels/HUD fire one tick later.

My proposal: `step` returns before `this.ticks++`, and main calls `ecosystem.endTick()` after the renders. See Q3.

**E2. The drive path.** `IntroWorld.drive` does `w.ticks++` first, then renders only `animalRenderer.update` and `blobShadows.update` (12290-12292), and `step` returns its result (12613). So on that path main must render just those two, after drive's increment as today, and must not call `endTick()`.

**E3. Early return.** `step` returns false when it isn't ready or has no animals (12611), and today nothing renders then. Main should render only when step returns true.

**E4. `initialize` order.** Today the order is: arrays cleared, `game.reset()`, `pov.newBody()`, bounds and grids, `foodSight`, `occ.build()`, `animalRenderer.init()`, `plantRenderer.init(b)`, spawns, `ready = true`, instance writes, HUD.

`plantRenderer.init` must run before the first `new Plant` (the constructor registers with the renderer). Proposed main order: `game.reset(); pov.newBody(); animalRenderer.init(); plantRenderer.init(provider.bounds); ecosystem.initialize(provider);` then the instance writes in today's order (`animalRenderer.update(…, 0)`, `blobShadows.update`, food-box render, `plantRenderer.update`), then the HUD.

What I checked: both renderer `init`s read no ecosystem state and `occ.build` creates no three objects (9159-9310), so object ids and scene child order stay the same; `game.reset` (12958) reads no ecosystem state; the `Math.random` draw order is unchanged.

**E5. Four `initialize` call sites.** They are `loadIntroScene` 12303, `loadWilderness` 16095, `loadPlace` 16301 and `vr.poll` 11201. One main helper (for example `populate(provider)`) should serve all four, with vr reaching it through a hook.

**E6. HUD refresh in `syncPopulation`.** To cut it, `syncPopulation` reports whether the count changed and main refreshes. Since that changes what it does, I'd rename it (for example `populationChanged()`).

**E7. `game.update(dt)` hook.** It runs at 12674, after `handleCollisions`, before the dead-removal pass, with step's `dt`. `game.bind()` registers it, and that has to happen before the first step.

**E8. Plant hook.** It covers `add` (constructor 7585 and `update` 7592), `remove` (7588), `touch` (`eatPlant` 6235) and the `pending` gate (set at 7658, read and cleared by step at 12666-12667). The flag would live on the sim-owned hook object that PlantRenderer writes. The renderer has to register before the first plant, so in main's init before `loadIntroScene()`.

**E9. `MIN_SCALE`.** It is an instance field (6915, `this.MIN_SCALE = 0.25`) read at 6143, 7459, 12778 (`r.MIN_SCALE`) and 13636. It becomes one config constant; name suggestion `GROWTH_MIN_SCALE`. `AnimalRenderer` also copies `MATURITY_TICKS = NPC_MATURITY_TICKS` (6914). That one is an alias, not a duplicate value, so I'm leaving it.

**E10. `isOpen` bounds.** It reads `this.minX..maxZ`, the ecosystem's copy of `provider.bounds`. In collision it needs its own source.

My proposal: `initialize` writes `collision.openBounds = b` at the moment it sets `minX` today (exact). The alternative is reading `providers.active.bounds`: the same values at every call I traced (spawn, regrow, `Animal` focus), but a different source. `CityWorld.plantSpot` must not use its own `this.bounds`, because the city is smaller than the wilderness that wraps it.

**E11. Food-box sight grid.** It is built in `initialize` with the ecosystem span (12415-12416). Keep that call site: `foodBoxes.buildSight(spanX, spanZ)`. `Animal` (5556) and `touching`/`eat` read `foodBoxes.sight`. `foodBoxes.clear()` doesn't drop the grid today (`touching` guards on `list.length`); keep it that way.

**E12. Food-box render split.** `render()` (8035-8054) moves to file 8 as a view function over `foodBoxes`' data. `draw()` (mesh creation, pushed into `layers` so `clearLayers` frees it) stays in 6.

**E13. Avatar registration.** It must exist before the first `Animal.update`, because sim dereferences it unguarded (`gp.isThreatTo`).

**E14. `world` to `ecosystem`.** There are 102 code references and no local or property named `world`. Of the 38 comments containing the word, 3 refer to the instance: 5346 (`world.time`), 11079 ("the world's ticks"), 12932 ("The NPC world's view"). The other 35 mean the map, the provider or world coordinates, and stay as they are.

**E15. `wrapAngle`/`turnToward`.** They have 8 call sites as `Animal.wrapAngle`/`Animal.turnToward` (in Animal and IntroWorld 12280). Those become the core functions and the two statics go away. `Animal.TWO_PI` stays.

**E16. Teardown.** `teardownWorld` clears every system unconditionally, which also covers a failed load where `activeWorld` is null or only the CityWorld, and the intro's `buildCity` pieces. So the resets stay unconditional in `teardownWorld`, and provider `teardown`s keep only what they do today. Some calls are duplicated today: `streets.clear`, `cover.clear` and `cityWater.clear` run in both `CityWorld.teardown` and `teardownWorld`, and `clearWildLayers`, `wildWater.dispose`, `pebbles.dispose` and `shelters = []` run in both `WildernessWorld.teardown` and `teardownWorld`. They are harmless and kept. `graphics.apply()` (15998) is neither a provider call nor a reset; I'd keep it as teardown's last line.

**E17. Identity check on `shelters` and `shells`.** The rain roof cache compares array identity (`rain.roofShells !== shells`, `rain.roofShelters !== shelters`, 15903). The owning-object fields must keep being reassigned to new arrays on reset, not emptied in place.

**E18. Night.** See Q2. `sunAltDeg` comes from `skyInstant()`, which depends on `game.on` and the Observer `timePreset`. It is set only when `updateSky` runs (each 0.25 s sky step, fades, preset clicks, loads) and is left at its old value when `site` is null.

---

## 4. Cross-file reassigned bindings and proposed owning objects

Field names keep the old binding names where possible, so the edits stay mechanical.

| Binding (decl line) | Reassigned by | Owner object |
|---|---|---|
| `sceneDirty` (15219), `rafId` (15218), `last` (15217) | `CatCompanion`, `pov`, `syncCarMesh`, `vr` (8); `frame`, visibility (9) | `loop` in 2: `{ sceneDirty, rafId, last, frame }` |
| `activeWorld` (4273) | main loads, `teardownWorld`, `loadIntroScene` | `providers.active` in 4 (48 references) |
| `perf.terrainVersion` | `WildernessWorld` 12012, teardown 15997 | `providers.version` in 4 |
| `shells`, `shellGrid` (4217-4218) | `buildCity` (6) | `collision.shells`, `collision.shellGrid` |
| `wallGrid`, `gridWalls`, `solidStamp`, `stampNo`, `obstacleThroats` | only inside 5 under this placement (`obstacleThroats` is read by 6) | `collision.*` as you listed. Not strictly required by the rule now, but it keeps one owner. |
| `shelters` (10196) | `teardownWorld` (9) and `WildernessWorld.teardown` | `shelters.list` (keep assigning new arrays, E17) |
| `groundMatchHalf` (1529) | `loadPlace` 16248 | `groundMatch.half` in 6 |
| `site` (15567) | main loads, teardown, intro | `simSky.site` in 7 (fits either night option) |
| `active` (13850) | `returnToIntro`, `finishLoad` (9) | `play.active` in 8 (31 references) |
| `locked` (13851) | the `pointerlockchange` listener, which moves to main (U10) | `play.locked` in 8 |
| `timePreset`, `skyPreset` (14736-14737) | settings chips (main) | `skyChoice.time`, `skyChoice.sky` in 8 (or on `simSky` under option B) |
| `knobDirty` (13944), with `knobDx`/`knobDy` read | `frame` 15311-15313 | `touchKnob = { dx, dy, dirty }` in 8 |
| `rainDrawn` (15677) | `frame` 15332 | `rainClock.drawn` in 8 |
| `sunAltDeg` (15568) | `updateSky` (8), read by sim | Q2 |

Read-only cross-file `let`s are fine as live bindings and get no owner: `flying`, `crouchY`, `knobDx`/`knobDy` (if not moved), `lastPointerType`.

New hook slots, each owned by the lower file:

- `loop.frame`, filled by main.
- `ecosystem.afterContacts`, filled by game.
- The avatar registration on the ecosystem, filled by game.
- The plant view hook (with `pending`), filled by PlantRenderer.
- `simSky`'s two hooks (U6), filled by main.
- The `vr` populate hook (U8), filled by main.

---

## 5. Top-level side effects in files 1 to 8 and where they go

- **1-config:** 1618 and 1623 (fill `PLACE_OF`/`PLACE_RE`) and 4654 (fill `NPC_TYPE_IDS`). Pure derivation over config's own tables. I'd keep them at the top level as construction of data.
- **3-gfx-io:**
  - Renderer, scene, camera, rig, lights, shadow and ground setup (1757-1840) stay. They construct and configure lower-file objects.
  - The shadow chunk patch block (1817-1826) stays and still runs before any material compiles.
  - `startGraphics` reads `localStorage` at eval, as today.
  - `document.body.appendChild(renderer.domElement)` (1761) is DOM building, so it moves to main's init as its first step. Nothing else is appended to `body` anywhere, so the child order is unchanged.
  - The `resize` listener (1898) moves to main.
  - The `webglcontextrestored` listener (1905) moves to `gfx.bind()`, or main.
- **6-worlds:** `signMeasure` (a 2D canvas context) stays.
- **8:**
  - `getElementById` lookups stay (lookups, not building).
  - Construction stays: `cat`, `visionRays`, the renderers, `blobShadows`, `healthBars`, the car mesh block (14209-14294), and the sun/moon canvases and discs (15486-15502).
  - Listener registrations move into bind functions that main calls: game inventory 13335-13342, input 13854-13861, 13877, the 13946 and 14016 blocks, fly 14077-14098, pedals 14547-14555, car/use/E 14659-14674.
  - 13343, 13863, 13869 and 13895 move into main (U10).

**Listener order.** Same-target, same-event listeners fire in registration order. Window `keydown` today runs in this order:

1. inventory (13335, 8)
2. keys (13856, 8)
3. Escape (13895, 9)
4. fly key (14096, 8)
5. KeyE (14668, 8)

The canvas has one `pointerdown` (13863, main); its `pointerup`/`click` come from `labels.bind()` (10827, 10832), called at the end. The window capture `pointerdown` order is 13854 and then 14020.

To keep the order exactly, main's init calls in this sequence:

1. resize
2. contextrestored
3. `game.bindInventory`
4. runNew
5. `input.bindKeys` (13854-13861)
6. main pointer-lock pair (13863, 13869)
7. `input.bindMouseLook` (13877)
8. main Escape (13895)
9. `input.bindTouch` (13946-14098)
10. `car.bind` (14547-14674)
11. the rest of main as today, ending with `labels.bind()`, `vr.bind()`

That splits the input bind into three. See Q5.

---

## 6. Class TDZ

With this placement, I found no case. Following calls and constructors from every top-level statement in files 1 to 8, nothing reads a binding in a higher file or one declared later in the same file. I checked that the pass catches a planted case (moving `scene` to 9 is reported).

Conditions that keep it that way:

- Each file keeps the original relative order of what it receives.
- Hooks are filled before first use (`loop.frame` before main's first `wake()`, the plant hook and avatar before `loadIntroScene()`).

The 22 top-level statements that construct three materials or objects keep their original order (`rig`, the lights, `ground`, `pebbles`, `cat`, `visionRays`, `animalRenderer`, `plantRenderer`, `blobShadows`, the brain materials, `healthBars`, the car mesh, `sunDisc`, `moonDisc`, then main's). That matters because three sorts opaque draws by material id.

---

## 7. Planned reset() list (teardownWorld order)

Each system gets `reset()` doing exactly what `teardownWorld` does to it today. Existing `clear()`/`dispose()` stay where other code calls them: `buildCity` calls `clearLayers` (3378), `CityWorld.teardown` and `WildernessWorld.teardown` call several, and `rainTick` calls `disposeRain` (15900). See Q7.

1. ecosystem `clear()`, then main's renderer follow-up (U4)
2. `providers`: active provider's `teardown()`, `active = null` (and `version++`, today 15997, could live here)
3. city layers (`clearLayers`)
4. wild layers (`clearWildLayers`)
5. `wildWater` (dispose)
6. `pebbles` (dispose)
7. `shelters` (new empty list)
8. `collision` (`resetObstacles`)
9. `occ` (clear)
10. `cityWater` (clear)
11. `waterClip` (reset exists)
12. `indoorClip` (reset exists)
13. `streets` (clear)
14. `cover` (clear)
15. `lampLight` (reset exists)
16. `elevation` (clear)
17. gfx ground plane (`visible = true`, `y = 0`)
18. `simSky` (`stop()`, and `site = null` if site moves onto it)
19. `skyFade` (reset exists)
20. rain (`disposeRain`)
21. `cat` (`place(false)`)
22. `car` (`setPlayerInCar(false)` plus `placed`, `mesh.visible`, `speed`/`steer`/`spin`)
23. `labels` (`locked`, `current`)
24. main's own HUD text (`hudPlace`, `hudBuildings`), staying in main
25. `graphics.apply()` last (E16)

---

## 8. Questions (OK means my recommendation)

- **Q1. Class rename.** Rename `NpcWorld` too (for example to `Ecosystem`), or keep `NpcWorld` with the instance named `ecosystem`?
- **Q2. Night.**
  - Option A, exact: `updateSky` keeps computing the altitude and stores it on `simSky` (`simSky.sunAltDeg`); sim reads it there. Behaviour is identical, but sky drawing still produces the value. That is the reverse of the brief's wording.
  - Option B, as briefed: sim computes the altitude itself from the clock. For that, `site`, the Observer time preset and `game.on` must be visible in 7. Night can then flip up to one sky step (0.25 s) differently, and the stale-when-`site`-is-null behaviour changes.
  - Recommendation: A for this split; B can come later as its own behaviour change.
- **Q3. Tick counter (E1).** OK to split `endTick()` out of `step` so main renders before the increment?
- **Q4. IntroWorld's borrowed sky hour (U3).** Recommendation: `loadIntroScene` hands the intro its clock (`iw.clock = simSky`, next to the existing `iw.prevHour = simSky.hour`), and `teardown` restores through `this.clock`. The alternative is main doing the restore inside `teardownWorld`.
- **Q5. Listener order.** Keep the exact order (input bind split in three, section 5), or accept grouping by file? The interleaved window `keydown` handlers act on different keys, so regrouping is probably harmless, but the exact order costs little.
- **Q6. Borderline placements (section 1).** Recommendation: look helpers in 7, `WILD_GROVES` and the step tables in config, as listed.
- **Q7. `reset()` naming.** Recommendation: add `reset()` per system next to the existing `clear()`/`dispose()`, rather than renaming them, since those have other callers.
- **Q8. `isOpen` bounds (E10).** Recommendation: `collision.openBounds` written by `initialize`.

When the edits land, by phase:

- **2:** loop object (`wake`, `invalidate`, `sceneDirty`, `rafId`, `last`), `tools`, `fightEase`/`fightClamp01`, `wrapAngle`/`turnToward`, solar math, `MIN_SCALE` to config, `playerPlantFood` to config.
- **3:** `providers` (`active`, `version`), canvas mount and two listeners to main, `fetchBuildings` default.
- **4:** `collision` object, `pointInShell`.
- **5:** `isOpen` move, food-box sight and render split, `IntroWorld.drive` and the clock, `shelters`, `groundMatch`, world `reset()`s.
- **6:** rename, hooks, `step`/`endTick`/`initialize`/`clear` cuts, `simSky` hooks and `site`, avatar, plant hook, the populate helper.
- **7:** `play`, `skyChoice`, `touchKnob`, `rainClock`, `movementHeld` export, binds, file-8 `reset()`s, the vr hook.

---

## 9. Full placement by file

### src/1-config.js: 446 identifiers, 3 other top-level statements

MAP_SIZE_SCALES, WORLD_SIZES, CITY_LADDER, DEFAULT_LEVELS, METERS_PER_LVL, HEAD_CLEAR, PLAYER_HEIGHT, EYE_HEIGHT, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, JUMP_SPEED, CROUCH_SPEED, FOOT_TURN_RATE, FOOT_CAM_FOLLOW, LOOK_PITCH_MAX, FLY_SPEED, CROUCH_RATE, GRAVITY, GRID_CELL, LAND_EPS, SUBSTEP, WALL_T, WALL_T_MIN, MITER_MAX, DOOR_W, DOOR_MIN_W, DOOR_H, PIER, PIER_MIN, FRAME_W, FLOOR_Y, CEIL_GAP, ENTRANCE_REACH, ROAD_NEAR, ROAD_FAR, ROAD_CELL, FEATURES_VERSION, OVERPASS_TIMEOUT_MS, OVERPASS_QUERY_TIMEOUT, OVERPASS_HEDGE_MS, OVERPASS_MAX_PARALLEL, OVERPASS_MIRRORS, NOMINATIM_URL, TERRAIN_URL, TERRAIN_MAX_Z, TERRAIN_MIN_Z, TERRAIN_TILE_PX, TERRAIN_MAX_TILES, TERRAIN_TIMEOUT_MS, TERRAIN_SPIKE_M, TERRAIN_SPIKE_FRAC, ELEV_STEP, ELEV_MARGIN, STEP_UP, GROUND_SNAP, LAYER_BIAS, LAYER_Y, ROAD_WIDTH, PATH_KINDS, ROAD_COLOR, PATH_COLOR, AREA_COLOR, MIX_GREEN_PULL, MIX_EDGE_FADE, MIX_GREEN_KINDS, WATERWAY_WIDTH, BARRIER, WALL_MATERIAL_COLOR, ROOF_MATERIAL_COLOR, ROOF_SHAPE, TREE_ROW_SPACING, SIGN_COLS, SIGN_CELL_W, SIGN_CELL_H, SIGN_MAX, LANDUSE_RE, LEISURE_RE, BARRIER_RE, PLACE_KINDS, PLACE_KEYS, PLACE_OF, PLACE_RE, CITY_STEPS, WILDERNESS_STEPS, LOW_PIXEL_RATIO, LOW_RENDER_FPS, HIGH_FOG_FAR, LOW_FOG_FAR, FOG_NEAR, HIGH_CAMERA_FAR, LOW_CAMERA_FAR, LOW_NPC_LOD_DIST, LOW_FAR_STAT_DIST, HIGH_LABEL_TICKS, LOW_LABEL_TICKS, HIGH_HUD_TICKS, LOW_HUD_TICKS, LOW_WATER_FPS, MSAA_SAMPLES_WANTED, GRAPHICS_KEY, HEMI_DAY, HEMI_NIGHT, MOON_MAX, SHADOW_BOX_HALF, SHADOW_AHEAD, SHADOW_EDGE_FADE, SHADOW_MAP_MAX, SHADOW_DEPTH, SHADOW_BIAS_M, BUILDING_CHUNK_M, GROUND_CELL_M, TERRAIN_CELL_M, SHADOW_SOFTNESS, MOON_BLEND_DEG, CITY_FILE_DIR, CITY_FILE_RADIUS, CITY_FILES, TREE_TRUNK_TOP_R, TREE_TRUNK_BASE_R, TREE_TRUNK_SOLID_R, SIGN_FONT, SHELL_CELL, SHELL_MAX_CELLS, SHELL_OUT, SHELL_AMBIG, SHELL_EPS, NPC_TICK_S, NPC_CITY_PEOPLE_WEIGHT, NPC_WILD_PEOPLE_WEIGHT, NPC_DEER_POPULATION, NPC_PLANT_POPULATION, DIET_WATER_SHARE, PLANT_REGROW_P, PLANT_SPOT_TRIES, PLANT_SIGHT_CELL, NPC_CONTACT_CELL, DEER_CRUISE, DEER_THINK_TICKS, DEER_SPRINT_DIST, DEER_SPRINT_OVER, DEER_SPRINT_ENERGY, NPC_SUBSTEP, GAIT_MAX_HZ, GAIT_GALLOP_SWING, GAIT_CADENCE_SCALE, DEER_EXPLORE_P, NPC_ATTACK_COOLDOWN_S, NPC_ATTACK_DAMAGE_PER_S, NPC_BITE_COOLDOWN_S, NPC_HIT_NO_EAT_S, PLANT_MAX_HEALTH, PLANT_BITE_NUTRITION, NPC_FIGHT_DAMAGE_PER_S, NPC_FIGHT_REF_STRENGTH, NPC_FIGHT_HOLD_PAD_S, NPC_FIGHT_MOVES, NIGHT_SUN_ALT_DEG, PREY_SIZE_STEP_KG, COYOTE_LEAP_AT, NPC_POUNCES, POUNCE_LAND_SHORT, FIGHT_KEY_FIELDS, NPC_AGE_DEPLETION_RATE, DEER_REPRO_SHARE, MATE_TIME_MULT, REPRO_NEED_MAX, NPC_DAY_TICKS, NPC_MATURITY_TICKS, NPC_ADULT_AGE, NPC_TICKS_PER_YEAR, NPC_START_AGE, HUMAN_TURN_RATE, DEER_GREEN_SHARE, DEER_AREAS, NPC_RIG_TOP, NPC_UNIT, NPC_RADIUS, NPC_COLLIDE_H, NPC_SPAWN_GAP, PLAYER_HS, NPC_SIZE, NPC_SIZE_Z_MAX, NPC_SIZE_HERITABILITY, NPC_SHOWN_BMI, NPC_REF_MASS_KG, SPECIES, NPC_TYPES, NPC_TYPE_IDS, NPC_TYPE_COUNT, HUMAN_TYPE_ID, HUNTS_MASK, HUNTED_BY_MASK, NIGHT_PREY_MASK, HUNTS_LIST, FOOD_TYPE_ID, WATER_SIGHT_CELL, HIGH_NPC_LOD_DIST, HIGH_FAR_STAT_DIST, NPC_BODY_R, NPC_STATS_R, NPC_STATS_UP, WATER_CELL, OCC_CELL, OCC_INV, OCC_CARVE_KEEP, LIF_LEAK, LIF_THRESHOLD, LIF_RESET, TAG_DECAY, DA_TONIC_RATE, BRAIN_LEARNING_RATE, BRAIN_WEIGHT_DECAY, HEADING_JITTER, HUMAN_ATLAS, HUMAN_FACE_TILE, HUMAN_BODY_TILE, HUMAN_FACE_VARIANTS, HUMAN_OUTFITS, HUMAN_OUTFIT_TILES, HUMAN_STRIDE_BASE, HUMAN_STRIDE_PER_V, HUMAN_STRIDE_MAX, HUMAN_CADENCE_MAX, HUMAN_SWING_MAX, HUMAN_IDLE_SPEED, HUMAN_GAIT_EASE, HUMAN_GAIT_JUMP, HUMAN_RIG, HUMAN_LEG, HUMAN_CROUCH, HUMAN_FIGHT, HUMAN_CROUCH_DROP, CROUCH_DROP, HUMAN_ARM_FLARE, HUMAN_PET, PET_BEND_LEVELS, HUMAN_SKIN, HUMAN_SHIRTS, HUMAN_PANTS, HUMAN_SUITS, HUMAN_HAIR, BB_CELL, BB_DIRS, BB_BAKED_DIRS, BB_PHASES, BB_POSES, BB_BLOCK, BB_FRAME, BB_FACE_VARIANT, BB_HUMAN_SWING, BB_STAND_SWING, BB_PHASE_K, BB_MIP_BIAS, PLANT_GRID, FOOD_BOX_KINDS, FOOD_BOX_SIZE, FOOD_BOX_REACH, FOOD_BOX_HEIGHT, FOOD_BOX_SLOTS, FOOD_BOX_OUTDOOR_CHANCE, INDOOR_CELL, CURB_PIECE, CURB_KINDS, MARK_KINDS, MARK_MAJOR, MARK_MIN_WIDTH, MARK_W, MARK_DASH, MARK_GAP, MARK_Y, MARK_JUNCTION_CLEAR, MARK_WHITE, MARK_YELLOW, LANE_W, PARKING_KINDS, PARK_MIN_HALF, PARK_GAP, PARK_CURB_GAP, PARK_P, PARK_CLEAR, PARKED_COLORS, LAMP_SPACING, LAMP_H, LAMP_ARM, LAMP_CURB_IN, LAMP_NEAR, LAMP_DOOR_CLEAR, LAMP_POLE_R, LAMP_ROAD_REACH, LAMP_REACH, LAMP_MAP_CELL, LAMP_GAIN, COVER_CELL, OCC_TILE_BITS, OCC_TILE_MASK, OCC_TILE_WORDS, SPAWN_CLEAR, STREET_STEP, WorldConfig, CONFIG, DEFAULT_SEED, WILD_FLOAT_DEPTH, COAST_SEA, COAST_LAND, COAST_WOBBLE, OCEAN_DEPTH, OCEAN_REACH, CABIN_SCALE, CABIN_M, CAT_HEAD_TOP, CAT_SCALE, CAT_SEAT, CAT_DOOR, CAT_RUN_FROM, CAT_WALK_WITHIN, CAT_RUN_SPEED, CAT_BOARD_SPEED, CAT_JUMP_TIME, CAT_BOARD_TIMEOUT, CAT_HEAD_FWD, CAT_PET_STEP_SPEED, CAT_PET_SETTLED, CAT_PET_TURN_RATE, TPP_BACK, TPP_UP, PLAYER_JOG_ANIM, SHADOW_FOLLOW_STEP, SHADOW_SUN_STEP_DEG, SHADOW_SUN_STEP_COS, SHADOW_MOVER_HZ, SHADOW_MOVER_DIST, SUN_DIST, SHADOWS_ENABLED, WILD_GROVES, MIX_BLEND, MIX_RING_MIN, MIX_RING_MAX, MIX_PARK_SHARE, MIX_HABITAT, MIX_SINK, BLOB_DIST, BLOB_MAX, BLOB_OPACITY, BLOB_FULL_SUN, BLOB_LIFT, BLOB_SPREAD, SURVIVOR_CONFIG, playerPlantFood, BAR_STEPS, BAR_RELEASE_TICKS, ARROW_STEPS, BAR_W_M, BAR_ABOVE, BAR_COLORS, BAR_ICONS, EMOJI_FONT, FAR_STAT_MAX, BAR_CANVAS_W, BAR_CANVAS_H, BAR_INFO_H, BAR_INFO_FONT, BAR_INFO_GAP, BAR_SPRITE_CANVAS_H, BAR_PX, BAR_H_M, LOBE_RADIUS, LOBE_COLS, BRAIN_SCALE, BRAIN_HALF_H, BRAIN_ABOVE, BRAIN_SPIN, BRAIN_TILT, BRAIN_DIM, BRAIN_IN_GROUPS, BRAIN_GROUP_COLS, STICK_RADIUS, FLICK_RADIUS, TAP_GAP_MS, TAP_SLOP, TAP_SWALLOW_MS, TAP_BUTTONS, HOLD_SAFE, CAR_SCALE, CAR_LEN, CAR_WID, CAR_TOP, CAR_WHEELBASE, CAR_TRACK, CAR_WHEEL_R, CAR_R, CAR_CIRCLES, CAR_STEP_UP, CAR_SUBSTEP, CAR_ACCEL_MAX, CAR_POWER, CAR_BRAKE, CAR_HANDBRAKE, CAR_REV_MAX, CAR_REV_ACCEL, CAR_ROLL, CAR_ENGINE_BRK, CAR_DRAG, CAR_GRIP, CAR_STEER_MAX, CAR_STEER_FALL, CAR_STEER_RATE, CAR_G, CAR_GLANCE, CAR_ALIGN, CAR_REACH, CAM_DIST, CAM_PIVOT, CAM_PITCH, CAM_FOLLOW, CAM_LOOK_HOLD, CABIN_CAR_GAP, CABIN_CAR_WALKWAY, TIMES, FALLBACK_HOURS, SKIES, DEBUG_PROBE_LAYER, DEBUG_PROBE_PX, SWIM_DEPTH, SWIM_FLOAT, SWIM_SPEED, SWIM_JUMP, SWIM_DRAG, NPC_DRINK_SECONDS, NPC_TICK_SLACK, SKY, SKY_DIST, SKY_FAR_FRACTION, SKY_BODY_DEG, SKY_TEX, SKY_FADE_S, RAIN_SPAN, RAIN_HEIGHT, RAIN_FPS_IDLE, RAIN_FADE_S, RAIN_TIME_WRAP, ROOF_MAP_N, ROOF_MAP_SIZE, ROOF_MAP_SNAP, RAIN_BY_CODE, PICKS

Other top-level statements (original line numbers): 1618-1622, 1623, 4654

### src/2-core.js: 26 identifiers

fmt, ringArea, bounds, dedupeRing, orientRing, offsetRing, gridOf, hash01, seededRandom, cellKey, pointInRing, near, closestOnRing, fightEase, fightClamp01, MathTools, SpatialGrid, ContactGrid, tools, last, rafId, sceneDirty, wake, invalidate, solarVector, moonVector

### src/3-gfx-io.js: 65 identifiers, 29 other top-level statements

placeKindOf, savedGraphics, startGraphics, startLowPower, renderer, MSAA_SAMPLES, scene, camera, rig, viewPos, viewQuat, hemi, sun, shadowMapSize, MOON_FALLBACK, moon, ground, msaa, geocode, overpassTry, overpassHedged, fetchBuildings, cityFileFor, fetchCityFile, parseLength, heightOf, minHeightOf, makeProjector, geometriesOf, closedGeom, buildingPolysOf, cleanPts, areaKindOf, featuresFrom, centreOf, prettify, signLabel, _col, cssColor, wallColorOf, roofColorOf, rgb, newBuf, NO_WIN, pushTri, pushQuad, bufGeom, tint, nonIndexed, UP, pushDisc, ribbon, areaGeom, cellSplitFlat, cellSplitIndexed, _cellFrustum, _cellView, _cellBox, cellCull, box, cyl, fetchTerrain, tileOf, loadImage, perf

Other top-level statements (original line numbers): 1757, 1758, 1760, 1761, 1762, 1763, 1765, 1769, 1770, 1777, 1778, 1787, 1789, 1790, 1791, 1807, 1808, 1809, 1810, 1811, 1812, 1814, 1815, 1817-1826, 1831, 1832, 1838, 1839, 1840

### src/4-provider.js: 7 identifiers

activeWorld, _surf, groundAt, isWaterAt, baseAt, surfaceY, surfaceFor

### src/5-collision.js: 26 identifiers

pointInShell, wallGrid, gridWalls, shellGrid, shells, shellRas, solidStamp, stampNo, buildGrid, obstacleThroats, resetObstacles, addSolids, resolveCollisions, moveAndCollide, supportAt, ceilingAt, cover, occ, solidOverlap, shellAt, buildShellRaster, shellAtExact, nearShell, spawnOk, streetSpawn, outdoorSpawn

### src/6-worlds.js: 91 identifiers

groundMatchHalf, matchWildGround, layers, poleSolid, obbOf, roofOf, clearLayers, addLayer, litMaterial, wallRing, alongEdge, innerAt, capOf, pushCap, vquad, pushSolid, roadIndex, nearestRoad, pointIndex, blockedAt, doorSpan, probeOut, pickByRoads, chooseDoor, signDoor, wallPiece, lintelPiece, ringPlinth, ringWalls, facadeLit, facadeMaterial, pushBox, pushPrism, roofDetail, buildCity, buildGround, buildTrees, buildBarriers, buildProps, elevation, drape, terrainGrid, buildTerrainBase, edgeOutward, longestEdge, edgeNearest, placeSign, collectSigns, signMeasure, signMetrics, signsOverlap, fitSign, buildSigns, places, foodBoxes, waterClip, indoorClip, cityWater, LAMP_COLOR, vehicleRoadIndex, roadGapAt, roadGap, lampLight, haloTexture, parkedCarGeom, parkedCarGeometry, streets, WildTerrain, HeightGrid, paintSlope, heightMesh, shoreline, wildLayers, addWildLayer, clearWildLayers, coastHeight, WildWater, Cabin, shelters, cabinObstacles, placeCabins, PebbleRenderer, wildTerrain, wildWater, pebbles, CityWorld, wildGroveList, wildGroves, WildernessWorld, INTRO_SCENE, IntroWorld

### src/7-sim.js: 21 identifiers

startFightMove, humanFightAct, sampleFightKeys, humanMassKg, personInfoKey, personInfoFields, BrainFactory, _maskLists, maskLists, SpikingNetwork, Entity, Animal, humanLook, packHumanLook, inheritHumanLook, Plant, NpcWorld, brains, world, simSky, presetHour

### src/8-render-player-game.js: 193 identifiers, 34 other top-level statements

dotEl, stickEl, knobEl, flyEl, climbEl, upEl, downEl, npcFrustum, _npcVP, _npcSphere, updateNpcFrustum, npcOnScreen, geometryViews, geometryView, petBendAt, petQuant, humanPetPack, humanPetHand, buildHumanGeometry, paintHumanAtlas, HUMAN_VERTEX_PARS, HUMAN_VERTEX_MAIN, humanMaterials, BB_VERTEX_PARS, BB_VERTEX_MAIN, BB_BAKE_OUT, billboardMaterials, AnimalRenderer, PlantRenderer, povEl, raysEl, gfxEl, vrEl, avgFpsEl, vrOverlayEl, vrStatsEl, CatCompanion, StatLabelSystem, VisionRaySystem, pov, vr, graphics, cat, petting, labels, visionRays, animalRenderer, plantRenderer, BlobShadows, blobShadows, SURVIVOR_ACTIONS, SURVIVOR_FIELD_ACTIONS, needsEl, needHealthEl, needFoodEl, needWaterEl, needDayEl, needInfoEl, slotEls, craftEl, injuriesEl, hurtFlashEl, runOverEl, runCauseEl, runStatsEl, cabinAt, game, BRAIN_NODE_GEO, brainNodeMat, brainLineMat, _bCol, _bMat, buildBrain, disposeBrain, brainActivity, HealthBars, healthBars, player, keys, active, locked, lastPointerType, touchMove, stickId, stickCx, stickCy, lookId, lookX, lookY, jumpQueued, lastStickTapAt, crouchY, stance, knobDx, knobDy, knobDirty, flying, climb, holdClimb, toggleFly, carEl, useEl, car, chaseCam, facePlayer, settleCar, syncCarMesh, carFits, placeCar, setCar, parkBesideCabin, _carPos, _push, moveCar, carPhysics, carNear, pushPlayerFromCar, gasEl, brakeEl, sprintEl, jumpEl, attackEl, pedal, touchUi, holdPedal, attackQueued, footTouch, sprintShown, updateSprintButton, flyShown, updateFlyButton, useShown, updateUseButton, carBtnState, updateCarButton, setPlayerInCar, enterCar, exitCar, toggleCar, driveStep, timePreset, skyPreset, timeMode, skyHour, skyInstant, conditions, fwd, right, swimming, playerStep, movementHeld, avgFps, zoneOffset, cityNow, clockText, skyCol, sunCol, scratch, OVERCAST, FOGGY, skyDisc, sunCanvas, sunDisc, moonCanvas, moonDisc, moonShape, drawMoon, sunDir, moonDir, _mx, _my, _mz, _mBasis, updateSkyBodies, placeSkyBodies, sampleSky, site, sunAltDeg, skyFade, updateSky, RAIN_MAX, rain, rainTime, rainDrawn, rainState, makeRain, disposeRain, syncRain, roofHeightAt, rasterRoofs, rainTick, rainAnimating, populationText

Other top-level statements (original line numbers): 13335-13340, 13341, 13342, 13343-13346, 13854, 13856-13860, 13861, 13863-13867, 13869-13875, 13877-13883, 13895-13897, 13946-14006, 14016-14053, 14077, 14078, 14095, 14096-14098, 14209-14294, 14547, 14548, 14549, 14550, 14551, 14553, 14555, 14659, 14661-14665, 14666, 14668-14672, 14673, 14674, 15487, 15488-15497, 15501

### src/9-main.js: 92 identifiers, 46 other top-level statements

storedPlace, worldSize, worldSizeChoice, panel, addrEl, goEl, statEl, hudEl, gearEl, settingsEl, timesEl, skiesEl, say, cardEl, stepsEl, steps, paint, vitalsEl, hudBtnEl, fsEl, newEcoEl, tintEl, loadIntroScene, returnToIntro, chips, setSettingsOpen, debugEl, debugInfoEl, DEBUG_PROBE_BG, debugErrors, debugError, debugReadout, hudOn, raysBeforeHud, setHud, fullscreenElement, so, canLock, syncFullscreen, showControls, drawnPos, drawnYaw, drawnPitch, drawnCrouch, drawPending, drawnAt, waterAt, npcAcc, npcElapsed, fpsFrames, fpsAt, hudFps, frame, hudPlace, hudBuildings, refreshHud, busy, lastTerrain, lastQuery, startMode, seedEl, sizeBtns, sizeEl, sizeOutEl, peopleEl, peopleOutEl, customRowEl, startGoEl, seedValue, teardownWorld, setBusy, finishLoad, loadWilderness, loadPlace, randomSky, newEcosystem, gameEl, skysetEl, syncSkyset, hudBeforeGame, chooseObsEl, chooseGameEl, chooseGoEl, chooseFsSwitchEl, choosePovSwitchEl, chooseGfxSwitchEl, setSwitch, chooseMode, loadOpts, citySwitchEl, setMode, picksEl

Other top-level statements (original line numbers): 1408-1410, 1898-1904, 1905, 14838, 14839, 14841-14844, 14855-14858, 14861, 14862, 14863-14869, 14879, 14880, 15014-15017, 15018, 15019, 15020, 15035, 15036, 15041-15048, 15054, 15055, 15056, 15357-15363, 15370, 16359, 16360, 16382-16415, 16429-16431, 16462-16471, 16483-16487, 16490-16493, 16494, 16495-16499, 16500-16509, 16510, 16511, 16512, 16514, 16524-16533, 16534-16537, 16539, 16540, 16541, 16542, 16543, 16544
