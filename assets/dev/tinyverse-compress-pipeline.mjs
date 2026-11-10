// compress-pipeline: shell split -> GLSL pass -> terser -> css/html squeeze -> verify
// usage: node compress-pipeline.mjs in.html -o out.html [--no-glsl] [--no-html] [--quiet]
import { readFileSync, writeFileSync } from 'node:fs';
import { minify } from 'terser';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const input = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-o');
const output = args[args.indexOf('-o') + 1] || input.replace(/\.html$/, '.min.html');
const log = flag('--quiet') ? () => {} : console.log;

const TERSER_OPTIONS = {
  module: true,
  compress: { passes: 3, toplevel: true, unsafe: true, unsafe_math: true, pure_getters: true, booleans_as_integers: true },
  mangle: { toplevel: true },
  format: { quote_style: 1 },
  parse: {}
};

// a template literal counts as GLSL when any of its quasis carries one of these markers
const GLSL_MARKERS = /\b(void main|uniform |attribute |varying |precision |gl_FragColor|vec[234]\()/;

const html = readFileSync(input, 'utf8').replace(/\r\n/g, '\n');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
let js = scriptMatch[1];

// GLSL pass: minify every GLSL quasi in place, keeping ${} interpolations verbatim
const minifyGlslQuasi = (src, leadingInterp, trailingInterp) => {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  s = s.replace(/(\d+\.\d*?)0+\b/g, '$1').replace(/\b0+\.(\d)/g, '.$1');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/ ?([{}()\[\];,=+\-*\/<>!?:&|]) ?/g, '$1');
  s = s.trim();
  // chunks are pasted between statements, so each interpolation boundary keeps a newline
  return (leadingInterp ? '\n' : '') + s + (trailingInterp ? '\n' : '');
};

const glslEdits = [];
let glslBefore = 0, glslAfter = 0;
if (!flag('--no-glsl')) {
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  walk.simple(ast, {
    TemplateLiteral(node) {
      if (!node.quasis.some((q) => GLSL_MARKERS.test(q.value.raw))) return;
      node.quasis.forEach((q, k) => {
        const next = minifyGlslQuasi(q.value.raw, k > 0, k < node.quasis.length - 1);
        glslBefore += q.value.raw.length;
        glslAfter += next.length;
        glslEdits.push([q.start, q.end, next]);
      });
    }
  });
  for (const [start, end, text] of glslEdits.sort((a, b) => b[0] - a[0])) js = js.slice(0, start) + text + js.slice(end);
  log(`glsl: ${glslEdits.length} quasis, ${glslBefore} -> ${glslAfter} chars`);
}

const minJs = (await minify(js, TERSER_OPTIONS)).code;

const squeezeCss = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/ ?([{}:;,>]) ?/g, '$1').replace(/;}/g, '}').trim();

let shell = html;
if (!flag('--no-html')) shell = shell.replace(/>\s+</g, '><').replace(/\n+/g, '');
const out = shell
  .replace(/<style>[\s\S]*?<\/style>/, () => `<style>${squeezeCss(styleMatch[1])}</style>`)
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => `<script type="module">${minJs}</script>`);
writeFileSync(output, out);

// verify: output reparses, and every GL attribute/uniform name string survives
acorn.parse(minJs, { ecmaVersion: 'latest', sourceType: 'module' });
const glNames = [...new Set(scriptMatch[1].match(/'[au][A-Z]\w*'/g) || [])];
const missing = glNames.filter((n) => !minJs.includes(n.slice(1, -1)));
if (missing.length) throw new Error('GL names lost: ' + missing.join(' '));
log(`verify: reparse ok, ${glNames.length} GL names intact`);
log(`size: ${html.length} -> ${out.length} bytes raw (${(100 - (out.length / html.length) * 100).toFixed(1)}% smaller)`);
