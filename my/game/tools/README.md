# tools

```
cd tools && npm install
```

Pinned dependencies: esbuild (the bundle), acorn and eslint-scope (check-layers). The browser checks use Playwright, from `PLAYWRIGHT_PATH` or a normal `require('playwright')`.

## bundle.mjs: one HTML for the production pipeline

```
node tools/bundle.mjs [--out dist/game.html]
```

It bundles `src/9-main.js` and everything it imports into one ES module (three stays external, resolved by the importmap) and inlines it into `index.html`'s module tag. It also copies `maps/` beside the output, because the page fetches the city files relative to itself (`CITY_FILE_DIR` in `1-config.js`). It fails if the bundle contains `</script`.

## checks/check-layers.mjs: the module rules

```
node tools/checks/check-layers.mjs src
```

These are errors (exit 1):

- an import from a same- or higher-numbered module, or from a relative path that isn't a src module (bare `three` and `three/...` are allowed)
- importing a name the target doesn't export
- re-exports, default exports or namespace imports between src modules
- a write to an imported binding (an `export let` another file reassigns, which would throw at runtime)
- a free name that no module declares or imports and that isn't in `KNOWN_GLOBALS`, which most likely means a missing import. `KNOWN_GLOBALS` is every global the original `game.html` used plus some common ones it didn't. Add a name there when the code starts using a new browser global.

These are notes:

- every `export let` and how often its own file writes it
- every top-level statement in files 1 to 8 that isn't a declaration, import or export. Ones that register a listener are marked `[LISTENER]`, and ones that call `wake`/`invalidate` are marked `[WAKE]` (the "files 1 to 8 declare; main starts" rule).

## checks/smoke.mjs: load the page and read the game's Debug readout

```
node tools/checks/smoke.mjs <rootDir> <page.html> [--wild] [--low] [--walk] [--survivor] [--fast] [--three <local three dir>]
```

It serves `rootDir` from a local static server and opens the page in headless Chromium (SwiftShader). It reads the Debug readout (graphics, shader programs and failed links, people, script errors) on the intro scene. Options:

- `--wild`: read it again after a City-off wilderness load and Observer, Go.
- `--survivor`: choose Survivor instead of Observer.
- `--walk` (with `--wild`): walk, jump and sprint on the keyboard, then read the readout again.
- `--low`: start on Graphics low.
- `--fast`: smallest Custom size, a 480x300 viewport, shorter waits, and one readout at the last stage. A run takes about 1 to 2.5 minutes.
- `--three`: serve `https://unpkg.com/three@0.160.0/...` from a local copy, for machines that can't reach unpkg.

It exits 1 on any script error, failed request, renderer crash or failed shader program. Examples: `node tools/checks/smoke.mjs . index.html --wild --low --walk --fast`, or `node tools/checks/smoke.mjs dist game.html --wild --fast` for the bundle.

Run one page at a time, because parallel runs crash the headless renderer. High graphics with `--walk` crashes SwiftShader's renderer some of the time, so use `--low` with `--walk`.

## checks/listeners.mjs: listener order

```
node tools/checks/listeners.mjs . index.html before.txt   # before a change
node tools/checks/listeners.mjs . index.html after.txt    # after it
diff before.txt after.txt
```

It lists every event listener on `window`, `document` and the canvas after the intro loads, in registration order, with each handler's first source line. Use it when a change touches how or where listeners register.

## Not covered

Runtime behaviour beyond the readout, the in-game checklist, and TDZ order inside the modules. Modules don't load from `file://`, so open `index.html` through a static server (`npx serve` or `python3 -m http.server` from the project folder).

The one-time split tools (cut scripts, `placement.json`, the per-phase edits, `inventory.mjs`, `check-decls.mjs`) were removed once the split was done. `INVENTORY.md` records what they did, and section 9 holds the full placement.
