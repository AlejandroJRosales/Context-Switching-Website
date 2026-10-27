# Nova Orbis

A browser game by Alejandro Rosales (Game 1.0.0.5): any US city from OpenStreetMap, set inside a procedurally generated wilderness, populated by people, deer and coyotes whose traits and brains are inherited and shaped by survival. Deployed at contextswitching.org.

## Goal

### Why it exists
- A new ecosystem for examining how the current brain design learns, and a stage toward MAT (the long-term neuroevolution project), though the current brain is far from MAT.
- To see what behavior emerges when real places meet adaptive minds.
- To make the inside of an adaptive mind visible: the brains and vitals over NPC heads show why an agent acts, not only that it moves.
- The brains learning and adapting under pressure is one of the favorite parts of the simulation.

### Platform
- Main point of the game: it plays as easily on an iPhone as on a PC, a Mac, an Asus, or a Chromebook (with a small map). The only thing required from the user is a working browser. The browser was chosen over C++, C# and Unity for this reason.
- Portability, playability on many devices, and optimization are priorities.
- It runs on phones, so battery, memory and compute all count.

### Scale and performance
- 10k persistent NPCs on iPhone SE-class hardware.
- 100k NPCs as a stress test and minimum requirement on low-compute devices; falling back to about 100 NPCs should work on any supported device.
- Planned scale-up: city map size doubled, people and animals quadrupled, neural networks 2x denser with more inputs and outputs, all still running on an iPhone X, a Mac, a Chromebook, etc.
- Frame rate target: from about 20 fps to about 40 fps, across all platforms, on high graphics, City on, Medium and Large worlds, in both Observer and Survivor modes.
- Brain learning gets full CPU priority and is never traded away for optimization.
- No simulation LOD: every animal gets the same update rate and precision regardless of distance from the camera, because far-away beings in a real world do not react slower. LOD is render-only (detailed near people, billboards far away).

### Simulation principles
- Physical and realism correctness come before visual correctness; graphics are easier to work around later.
- Sizes match nature: heights and animal sizes come from standard bell curves, the player is 5'9", and the world reads in true scale (a 5'9" person looks 5'9" in a door frame). People age 1 year per 365 sim days.
- No animal mates until it is a full adult; deer take longer to reproduce.

### Learning
- Weight learning should mimic biological learning at a molecular level, like neuroplasticity, with each weight receiving its own random perturbation rather than one global change to all weights.

### World
- Every building is enterable: hollow shells with thick walls, a doorway, floor and ceiling. A building with a sign gets a door under it; more than one door per building is fine, never more than one per side.
- Go easy on the free public map servers (Overpass): they are offered for free, and the site must not get blocked. The city download stays at the default size for every world-size option.
- Host the map data for the suggested places (New York, Union Square SF, The Loop Chicago, 1 Park Place Athens OH) as files on contextswitching.org.

### Gameplay direction
- Eventually a zombie survival, post-apocalypse game. Three humans start with the virus and "chase down non humans" (wording kept as stated). Zombie humans inherit the same rule-based AI as deer and coyotes, not the learning brain.
- Core design goal: the zombies are alive and adapt to each player's style instead of being static. The player's play selects them over generations: picking them off one at a time from the outskirts selects for traits like good hearing or speed; bombarding them selects for strong but slower zombies.
- Eventually zombies learn team goals alongside secondary goals (eating, drinking) and group dynamics, such as hunting together.

### Code
- Rewrite in place, one subsystem per session, behind interfaces. Never from scratch: the file holds many hard-won fixes.
- One source of truth per value or rule; interfaces between systems; species differ by data, not copied code; the player and NPCs share rules wherever they represent the same thing.
- Later: develop as modules and bundle back to a single HTML at build time.

## Status

Today the game is one file, `game.html` (about 15k lines). The 9-file split below is planned, not done. Until it lands, "file" in the tables below means the section of `game.html` that will become it.

## Architecture (planned split)

Each file imports only from lower numbers.

| # | File | Owns |
|---|------|------|
| 1 | `1-config.js` | Every tunable table and derived constant. No runtime state. |
| 2 | `2-core.js` | Math, RNG, ring geometry, spatial and contact grids, solar and lunar math, the redraw flag. No three, no DOM. |
| 3 | `3-gfx-io.js` | gfx: renderer, scene, camera, lights, buffer helpers, cell culling, MSAA, material patching. io: Nominatim, Overpass, city files, terrain tiles, OSM feature parsing. |
| 4 | `4-provider.js` | The provider contract, the active-provider slot, `groundAt`, `surface` and friends, the terrain version counter. |
| 5 | `5-collision.js` | Wall and shell grids, shell raster, collision and support queries, occupancy grid, cover, spawn and `isOpen` checks. |
| 6 | `6-worlds.js` | Elevation, city construction (buildings, streets, signs, water, places, food boxes), `CityWorld`, wilderness (terrain, water, cabins, pebbles, groves), `WildernessWorld`, `IntroWorld`. |
| 7 | `7-sim.js` | Brain, `Entity`, `Animal`, `Plant`, fight helpers, the game clock and weather, `NpcWorld` (to be renamed `ecosystem`). Body lands here. |
| 8 | `8-render-player-game.js` | NPC, plant and billboard renderers, human rig, vitals, brain view, vision rays, sky drawing, rain, graphics; player, input, car, chase cam, cat, pov, VR; Survivor mode (`game`). |
| 9 | `9-main.js` | Loading steps, start screen, settings, debug, HUD, load and teardown, the frame loop. Constructs and starts everything. |

`index.html` stays as the shell: markup, CSS, importmap. Shaders stay inline as template literals beside their owners, so the pipeline's GLSL pass is unaffected.

### Interfaces
This section replaces the ARCHITECTURE comment block. Each interface gets an entry here as it lands: name, responsibility, config block, and what talks to it.

(None yet. Body is first.)

## Conventions
- Every tunable number lives in config, grouped by interface. Ask before making config overridable from outside the file.
- A rule is written once and called from everywhere that needs it.
- The world describes what happened (events); it never edits another system's state directly.
- When a change alters what something does, rename the affected identifiers in the same change.
- Implement what is asked and nothing more; offer extras instead.
- Comments are one line max, except comments about the brain class. Interface detail lives in this README, not in file headers.
- Files 1 to 8 declare and construct only what depends on lower files; `9-main.js` starts things.
- State shared across files lives on exported const objects (`collision.shells`), never on reassigned `let` bindings.
- Every system has a `reset()`; a provider's `teardown` owns its own pieces.
- Prefer expressing new state through effects over new brain inputs; ask before adding inputs.

## Process
- One subsystem per session: inventory, define the interface, build it preserving behavior, route callers, delete old paths, verify, record it here.
- Behavior changes come only after that subsystem's refactor is confirmed.
- Playable after every step; never leave the code half-migrated at the end of a session.
- Verify: extract the main module script and run `node --check`; show key numbers from config before and after; give an in-game checklist.
- Report possible issues as things worth checking. Git commit messages under 20 words.

## Running
- Serve the folder over a local HTTP server. The hosted city files need it now, and the split modules will too (browsers block local module imports from `file://`).

## Building
1. Bundle (planned): esbuild turns the 9 files and `index.html` into one `dist/game.html`, the same shape as today.
2. Ship: `production-pipeline.mjs` runs on that file: shell split, GLSL pass, domain lock (contextswitching.org, covering www), terser, CSS/HTML squeeze, license header, verify. Nova Orbis builds skip the obfuscation stage.

## Deployment layout
- `game.html` with the hosted city files beside it (`CITY_FILE_DIR`): `new-york.json`, `san-francisco.json`, `chicago.json`, `athens.json`.
- If a city file is missing, that place falls back to the public Overpass mirrors without any visible error, so check the files deploy with the page.

## Tracing errors
- Dev (split modules): errors name the source file and line.
- Unminified bundle: esbuild marks where each file's code begins with a `// src/<file>.js` comment.
- Shipped build: positions are in the minified file. Source maps (esbuild chained through terser) would map them back; undecided, and usually kept off the public server.

## TODO

### Rewrite, in order
- [ ] 1. Body: one `BODY_CONFIG`, an event-driven `Body` (`apply`, `takeWound`, `canEat`, `tick`) owned by animals and the player; fall damage becomes a fall event.
- [ ] After Body is confirmed (only when asked): stamina (fast), condition or injury (medium), fitness (slow). Illness deferred.
- [ ] 2. Species config: `SPECIES`, `NPC_SIZE`, `NPC_REF_MASS_KG` and scattered per-species constants become one data-driven config.
- [ ] 3. Movement and collision: player and NPC movement share one interface where they represent the same physics.
- [ ] 4. World providers: finish the provider interface so city and wild worlds are interchangeable.
- [ ] 5. To plan later: brains behind a `Network`-style interface, NPC AI, input, rendering and LOD, UI and HUD.

### Split preparation (upward calls and shared state)
- [ ] Move renderer, vitals, labels, vision-ray and HUD calls out of `NpcWorld.step` and `initialize` into main.
- [ ] Plants report add, damage and death through a hook instead of calling `plantRenderer`.
- [ ] Move `animalRenderer.MIN_SCALE` (growth) into config.
- [ ] Add an after-contacts hook in `NpcWorld` for `game.update`, preserving today's order before dead removal.
- [ ] Register the player avatar with `NpcWorld` as an external agent, so sim never imports `game`.
- [ ] Move `simSky` (clock and weather) and the sun altitude into sim; render reads them.
- [ ] Give `foodBoxes` its own sight grid; move its view cull to render.
- [ ] `IntroWorld.drive` only moves animals; main renders.
- [ ] Move `NpcWorld.isOpen` into collision.
- [ ] Export `movementHeld()` from the input code instead of main reading input state.
- [ ] Turn cross-file `let` state (`activeWorld`, shell and wall grids, `obstacleThroats`, `shelters`, `sceneDirty`) into fields on owning objects.
- [ ] Give each system touched by `teardownWorld` a `reset()`; providers' `teardown` owns their pieces.
- [ ] Rename the `NpcWorld` instance `world` to `ecosystem`.
- [ ] Do the mechanical split into the 9 files.

### Build
- [ ] Add the bundle stage (in front of `production-pipeline.mjs`, or as its first stage).
- [ ] Compare bundled size after terser with today's single file.
- [ ] Decide on source maps.

### Open decisions
- [ ] Split before Body, or Body first in the single file.
- [ ] Check whether the current three-factor learning rule meets the per-weight random perturbation goal.

### Options to remember (not planned)
- High graphics' MSAA into an RGBA8 sRGB target instead of RGBA16F, and/or 4 samples instead of 8.
- Vitals: keep per-person canvases CPU-rasterized (`willReadFrequently`), or draw near bars like far ones (instanced strips plus an icon atlas).
- A coarser plant contact grid for `handleCollisions`.