// BUNDLE: src/9-main.js and everything it imports, as one ES module (three stays external, resolved by the importmap
// as before), inlined into index.html's module script tag: one HTML file, the input production-pipeline.mjs takes.
//   node tools/bundle.mjs [--out dist/game.html]
// It also copies maps/ (the hosted city files) beside the output, since the page fetches them relative to itself.
// esbuild: bundle, format esm, no minify (the pipeline's terser does that). esbuild keeps only legal comments, so the
// /* glsl */ markers go; the pipeline finds shaders by their content, and its shader count shows whether any were lost.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(ROOT, argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'dist/game.html');
const SHELL = path.join(ROOT, 'index.html');
const ENTRY = 'src/9-main.js';
const TAG = `<script type="module" src="${ENTRY}"></script>`;
const EXTERNAL = ['three', 'three/*'];   // the importmap's two entries

const result = await esbuild.build({
  entryPoints: [path.join(ROOT, ENTRY)], bundle: true, format: 'esm', external: EXTERNAL,
  minify: false, write: false, target: 'esnext', charset: 'utf8', legalComments: 'inline', logLevel: 'warning', metafile: true
});
if (result.errors.length) process.exit(1);
const code = result.outputFiles[0].text;
if (/<\/script/i.test(code)) throw new Error('the bundle contains "</script", which would end the inline tag');

const shell = fs.readFileSync(SHELL, 'utf8');
const at = shell.indexOf(TAG);
if (at < 0 || shell.indexOf(TAG, at + 1) >= 0) throw new Error(`index.html must contain ${TAG} exactly once`);
const html = shell.slice(0, at) + '<script type="module">\n' + code + '</script>' + shell.slice(at + TAG.length);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
// the hosted city files (CITY_FILE_DIR in 1-config.js), fetched relative to the page, so they go beside the output
const MAPS = path.join(ROOT, 'maps');
if (fs.existsSync(MAPS)) {
  fs.cpSync(MAPS, path.join(path.dirname(OUT), 'maps'), { recursive: true });
  console.log(`maps    ${fs.readdirSync(MAPS).join(', ')} -> ${path.relative(ROOT, path.join(path.dirname(OUT), 'maps'))}/`);
}
const inputs = Object.keys(result.metafile.inputs);
console.log(`bundle  ${inputs.length} modules (${inputs.join(', ')}) -> ${path.relative(ROOT, OUT)}: ` +
  `${(code.length / 1024).toFixed(1)} KB script, ${(html.length / 1024).toFixed(1)} KB html`);
