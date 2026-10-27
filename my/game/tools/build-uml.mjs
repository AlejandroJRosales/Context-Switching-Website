// build-uml.mjs: writes PROJECT-UML.json, a UML class diagram of src/ as JSON: nodes (files, classes, objects) with
// typed attributes and functions as "name(params): returnType", and edges between them (imports, instanceOf, extends,
// uses). Types are inferred from the code (JavaScript has none written down), so "unknown" means it could not tell.
// Run after any change:  node tools/build-uml.mjs      (needs: npm install --save-dev acorn acorn-walk)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

// SETTINGS: the one place to change paths.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'src');
const OUT_FILE = join(ROOT, 'PROJECT-UML.json');
const MODULE_RE = /^(\d+)-.+\.js$/;   // numbered modules; the number is the layer

// Visibility marks, as in UML: + exported from its file, - private to it.
const PUBLIC = '+', PRIVATE = '-';

// TYPE INFERENCE

// Calls whose result type is known from the name alone.
const KNOWN_CALLS = {
  'parseInt': 'number', 'parseFloat': 'number', 'Number': 'number', 'String': 'string', 'Boolean': 'boolean',
  'Array.from': 'array', 'Array.isArray': 'boolean', 'Object.keys': 'string[]', 'Object.entries': 'array',
  'JSON.parse': 'any', 'JSON.stringify': 'string', 'fetch': 'Promise<Response>', 'requestAnimationFrame': 'number',
  'setTimeout': 'number', 'setInterval': 'number', 'performance.now': 'number', 'Date.now': 'number',
  'document.getElementById': 'HTMLElement', 'document.querySelector': 'HTMLElement',
  'document.createElement': 'HTMLElement', 'localStorage.getItem': 'string|null', 'matchMedia': 'MediaQueryList'
};

// Joins types into one: "number|string", with duplicates and "unknown" dropped when anything else is known.
function union(types) {
  const set = new Set(types.flatMap(t => t.split('|')));
  // drop "unknown" only when a real type is known besides null/undefined ("unknown|null" says more than "null")
  if ([...set].some(t => t !== 'unknown' && t !== 'null' && t !== 'undefined')) set.delete('unknown');
  if ([...set].some(t => t.endsWith('[]'))) set.delete('array');   // "number[]" already says it is an array
  if (set.size > 1) set.delete('void');                             // an early bare return beside real values
  return [...set].join('|') || 'unknown';
}

// The text of a callee or member chain: "THREE.Vector3", "Math.max".
function nameOf(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && !node.computed) return nameOf(node.object) + '.' + node.property.name;
  return '';
}

// The type of an expression, given `known` (top-level name -> type) and `self` (the type `this` stands for).
function typeOf(n, known, self) {
  if (!n) return 'undefined';
  switch (n.type) {
    case 'Literal':
      if (n.regex) return 'RegExp';
      return n.value === null ? 'null' : typeof n.value;
    case 'TemplateLiteral': return 'string';
    case 'ArrayExpression': {
      const inner = n.elements.filter(e => e && e.type !== 'SpreadElement').map(e => typeOf(e, known, self));
      return inner.length ? union(inner).replace(/^(.*)$/, t => t.includes('|') ? `(${t})[]` : t + '[]') : 'array';
    }
    case 'ObjectExpression': return 'object';
    case 'ArrowFunctionExpression': case 'FunctionExpression': return 'function';
    case 'ClassExpression': return 'class';
    case 'NewExpression': return nameOf(n.callee) || 'object';
    case 'ThisExpression': return self || 'this';
    case 'AwaitExpression': return typeOf(n.argument, known, self).replace(/^Promise<(.*)>$/, '$1');
    case 'UnaryExpression':
      return n.operator === '!' || n.operator === 'delete' ? 'boolean' : n.operator === 'typeof' ? 'string'
        : n.operator === 'void' ? 'undefined' : 'number';
    case 'UpdateExpression': return 'number';
    case 'BinaryExpression':
      if (['==', '!=', '===', '!==', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(n.operator)) return 'boolean';
      if (n.operator === '+') {
        const l = typeOf(n.left, known, self), r = typeOf(n.right, known, self);
        return l === 'string' || r === 'string' ? 'string' : 'number';
      }
      return 'number';
    case 'LogicalExpression':
      return n.operator === '&&' ? typeOf(n.right, known, self) : union([typeOf(n.left, known, self), typeOf(n.right, known, self)]);
    case 'ConditionalExpression': return union([typeOf(n.consequent, known, self), typeOf(n.alternate, known, self)]);
    case 'AssignmentExpression': return typeOf(n.right, known, self);
    case 'SequenceExpression': return typeOf(n.expressions.at(-1), known, self);
    case 'ChainExpression': return typeOf(n.expression, known, self);
    case 'Identifier':
      if (n.name === 'undefined') return 'undefined';
      if (n.name === 'Infinity' || n.name === 'NaN') return 'number';
      return known[n.name] ?? 'unknown';
    case 'MemberExpression': {
      const name = nameOf(n);
      if (/^Math\.[A-Z0-9_]+$/.test(name) || /\.length$/.test(name)) return 'number';
      return known[name] ?? 'unknown';
    }
    case 'CallExpression': {
      const name = nameOf(n.callee);
      if (name.startsWith('Math.')) return 'number';
      if (KNOWN_CALLS[name]) return KNOWN_CALLS[name];
      if (/\.(toFixed|join|trim|toLowerCase|toUpperCase|replace|slice)$/.test(name) && !/\.slice$/.test(name)) return 'string';
      if (/\.(includes|has|some|every|test|startsWith|endsWith)$/.test(name)) return 'boolean';
      if (/\.(indexOf|findIndex|push)$/.test(name)) return 'number';
      if (/\.(map|filter|concat)$/.test(name)) return 'array';
      // in-place array methods hand back the array they were called on: new Array(n).fill(null) is an Array
      if (/\.(fill|sort|reverse)$/.test(name) || (n.callee.type === 'MemberExpression' && ['fill', 'sort', 'reverse'].includes(n.callee.property.name))) {
        return typeOf(n.callee.object, known, self);
      }
      if (/\.querySelectorAll$/.test(name)) return 'NodeList';
      // a top-level function of this project: its own inferred return type
      const ret = known['()' + name];
      return ret ?? 'unknown';
    }
    default: return 'unknown';
  }
}

// A function's return type: every `return` in its own body (not nested functions), or its expression body.
function returnOf(fn, known, self) {
  let t;
  // locals: the function's own variables and defaulted params, typed as they are declared
  const local = Object.create(known);
  for (const p of fn.params) if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') local[p.left.name] = typeOf(p.right, local, self);
  if (fn.body.type !== 'BlockStatement') t = typeOf(fn.body, local, self);
  else {
    const types = [];
    let bare = false;
    walk.recursive(fn.body, null, {
      Function() { },   // nested functions return for themselves
      VariableDeclarator(v, st, c) {
        if (v.id.type === 'Identifier' && !Object.hasOwn(local, v.id.name)) local[v.id.name] = typeOf(v.init, local, self);
        if (v.init) c(v.init, st);
      },
      // a local reassigned later (let best = null; ... best = it) takes every type it is given
      AssignmentExpression(a, st, c) {
        if (a.left.type === 'Identifier' && Object.hasOwn(local, a.left.name)) {
          local[a.left.name] = union([local[a.left.name], typeOf(a.right, local, self)]);
        }
        c(a.right, st);
      },
      ReturnStatement(r, st, c) { if (r.argument) { types.push(typeOf(r.argument, local, self)); c(r.argument, st); } else bare = true; }
    }, walk.base);
    if (bare) types.push('void');   // a bare `return;` exits early with nothing
    t = types.length ? union(types) : 'void';
  }
  if (fn.async) return `Promise<${t === 'void' ? 'void' : t}>`;
  return t;
}

// "(lat, lon, radius, onNote?: function)": defaults mark a parameter optional and give its type.
function paramsOf(fn, known, self) {
  return '(' + fn.params.map(p => {
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'AssignmentPattern') return `${p.left.name ?? '{…}'}?: ${typeOf(p.right, known, self)}`;
    if (p.type === 'RestElement') return '...' + (p.argument.name ?? 'args');
    return p.type === 'ObjectPattern' ? '{' + p.properties.map(q => q.key?.name ?? '…').join(', ') + '}' : '[…]';
  }).join(', ') + ')';
}

const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

// Attribute types of a class or object: its initial values (`start`, name -> type) joined with every later
// `this.x = value` (and `owner.x = value` for an object) inside it, so a field that starts null shows what it becomes.
function attributeTypes(body, owner, start, known, self) {
  const types = {};
  for (const [k, t] of Object.entries(start)) types[k] = [t];
  walk.simple(body, {
    AssignmentExpression(a) {
      const l = a.left;
      if (l.type !== 'MemberExpression' || l.computed) return;
      if (l.object.type !== 'ThisExpression' && !(owner && l.object.type === 'Identifier' && l.object.name === owner)) return;
      (types[l.property.name] ??= []).push(typeOf(a.right, known, self));
    }
  });
  return Object.fromEntries(Object.entries(types).map(([k, ts]) => [k, union(ts)]));
}

// `known` plus this node's attributes as this.x and Owner.x, for typing its own methods.
function withAttributes(known, owner, attrs) {
  const k = Object.create(known);
  for (const [name, t] of Object.entries(attrs)) { k['this.' + name] = t; k[owner + '.' + name] = t; }
  return k;
}
const fnSig = (vis, name, fn, known, self) => `${vis}${name}${paramsOf(fn, known, self)}: ${returnOf(fn, known, self)}`;

// PER-FILE PASS: collect declarations; classes and objects become their own nodes.

function readModule(file) {
  const src = readFileSync(join(SRC_DIR, file), 'utf8');
  const comments = [];
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', onComment: comments });
  const first = ast.body[0];
  const header = comments.filter(c => !first || c.end <= first.start).map(c => c.value.trim()).join(' ').replace(/\s+/g, ' ');
  const role = (header.match(/^\S+\.js:\s*(.*?)(?=\s*(Owns:|May import:|$))/) || [])[1] ?? '';

  const imports = {};       // module -> names
  const localFrom = {};     // local name -> module it came from
  const decls = [];         // { name, exported, node, kind: 'function'|'class'|'var' }
  const exportedNames = new Set();

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const from = node.source.value.replace(/^\.\//, '');
      for (const s of node.specifiers) {
        const name = s.type === 'ImportSpecifier' ? s.imported.name : '*';
        (imports[from] ??= []).push(name);
        localFrom[s.local.name] = { from, name };
      }
      continue;
    }
    const exported = node.type === 'ExportNamedDeclaration';
    if (exported) for (const s of node.specifiers) exportedNames.add(s.local.name);
    const d = exported ? node.declaration : node;
    if (!d) continue;
    if (d.type === 'FunctionDeclaration') decls.push({ name: d.id.name, exported, node: d, kind: 'function' });
    else if (d.type === 'ClassDeclaration') decls.push({ name: d.id.name, exported, node: d, kind: 'class' });
    else if (d.type === 'VariableDeclaration') {
      for (const v of d.declarations) if (v.id.type === 'Identifier') decls.push({ name: v.id.name, exported, node: v, kind: 'var', keyword: d.kind });
    }
  }
  for (const d of decls) if (exportedNames.has(d.name)) d.exported = true;
  return { file, layer: Number(file.match(MODULE_RE)[1]), role, imports, localFrom, decls };
}

// BUILD THE DIAGRAM

const files = readdirSync(SRC_DIR).filter(f => MODULE_RE.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const mods = files.map(readModule);

// Node ids: the file name for a file, "file#Name" for a class or object inside it.
const idOf = (file, name) => `${file}#${name}`;
const isObjectDecl = d => d.kind === 'var' && d.node.init?.type === 'ObjectExpression';
const nodeDecl = d => d.kind === 'class' || isObjectDecl(d);

// Pass 1: every top-level name's type, so later passes can resolve identifiers and calls across files.
const typeByFile = {};   // file -> { name: type, '()name': return type }
for (const m of mods) {
  const known = typeByFile[m.file] = {};
  for (const d of m.decls) {
    if (d.kind === 'class') known[d.name] = 'class';
    else if (d.kind === 'function') known[d.name] = 'function';
    else if (isObjectDecl(d)) known[d.name] = d.name;
    else known[d.name] = 'unknown';
  }
}
// imported names take their home file's types; two rounds settle names whose types depend on each other
for (let round = 0; round < 2; round++) {
  for (const m of mods) {
    const known = typeByFile[m.file];
    for (const [local, { from, name }] of Object.entries(m.localFrom)) {
      const home = typeByFile[from];
      if (!home) { known[local] = from === 'three' ? 'THREE' : 'unknown'; continue; }
      known[local] = home[name] ?? 'unknown';
      if (home['()' + name]) known['()' + local] = home['()' + name];
    }
    for (const d of m.decls) {
      if (d.kind === 'function') known['()' + d.name] = returnOf(d.node, known, null);
      else if (d.kind === 'var' && isFn(d.node.init)) known['()' + d.name] = returnOf(d.node.init, known, null);
      else if (d.kind === 'var' && !isObjectDecl(d)) known[d.name] = typeOf(d.node.init, known, null);
    }
  }
}

const nodes = {}, edges = [];

for (const m of mods) {
  const known = typeByFile[m.file];
  const fileNode = nodes[m.file] = { kind: 'file', role: m.role, attributes: [], functions: [], contains: [] };

  for (const d of m.decls) {
    const vis = d.exported ? PUBLIC : PRIVATE;

    if (d.kind === 'function') { fileNode.functions.push(fnSig(vis, d.name, d.node, known, null)); continue; }
    if (d.kind === 'var' && isFn(d.node.init)) { fileNode.functions.push(fnSig(vis, d.name, d.node.init, known, null)); continue; }

    if (d.kind === 'class') {
      const id = idOf(m.file, d.name), cls = d.node;
      const node = nodes[id] = { kind: 'class', visibility: vis, attributes: [], methods: [] };
      fileNode.contains.push(id);
      if (cls.superClass) {
        const sup = nameOf(cls.superClass), home = m.localFrom[sup]?.from ?? m.file;
        const local = mods.find(x => x.file === home)?.decls.some(x => x.name === sup && x.kind === 'class');
        edges.push({ from: id, to: local ? idOf(home, sup) : sup, type: 'extends' });
      }
      // attributes: class fields, then every this.x assigned anywhere in the class
      const fields = {}, statics = new Set();
      for (const el of cls.body.body) {
        if (el.type !== 'PropertyDefinition') continue;
        fields[el.key.name] = typeOf(el.value, known, d.name);
        if (el.static) statics.add(el.key.name);
      }
      const attrs = attributeTypes(cls.body, null, fields, known, d.name);
      for (const [k, t] of Object.entries(attrs)) node.attributes.push(`${statics.has(k) ? 'static ' : ''}${k}: ${t}`);
      const kn = withAttributes(known, d.name, attrs);
      for (const el of cls.body.body) {
        if (el.type !== 'MethodDefinition') continue;
        if (el.kind === 'constructor') { node.methods.unshift(`+constructor${paramsOf(el.value, kn, d.name)}`); continue; }
        const st = el.static ? 'static ' : '';
        const acc = el.kind === 'get' || el.kind === 'set' ? el.kind + ' ' : '';
        node.methods.push(`${st}${acc}${fnSig('', el.key.name ?? '[computed]', el.value, kn, d.name)}`);
      }
      continue;
    }

    if (isObjectDecl(d)) {
      const id = idOf(m.file, d.name);
      const node = nodes[id] = { kind: 'object', visibility: vis, attributes: [], methods: [] };
      fileNode.contains.push(id);
      const props = d.node.init.properties.filter(p => p.type === 'Property');
      const keyOf = p => p.key.name ?? String(p.key.value);
      // attributes: initial values, then every this.x / name.x assigned in the object's methods
      const start = {};
      for (const p of props) if (p.kind === 'init' && !isFn(p.value)) start[keyOf(p)] = typeOf(p.value, known, d.name);
      const attrs = attributeTypes(d.node.init, null, start, known, d.name);
      const kn = withAttributes(known, d.name, attrs);
      for (const [k, t] of Object.entries(attrs)) node.attributes.push(`${k}: ${t}`);
      for (const p of props) {
        if (p.kind === 'get') node.attributes.push(`get ${keyOf(p)}: ${returnOf(p.value, kn, d.name)}`);
        else if (isFn(p.value)) node.methods.push(fnSig('', keyOf(p), p.value, kn, d.name));
      }
      continue;
    }

    // plain value: an attribute of its file; an instance of a project class also gets an edge to that class
    const t = typeOf(d.node.init, known, null);
    fileNode.attributes.push(`${vis}${d.name}: ${t}`);
    if (d.node.init?.type === 'NewExpression') {
      const cls = nameOf(d.node.init.callee), home = m.localFrom[cls]?.from ?? m.file;
      if (nodes[idOf(home, cls)] || mods.find(x => x.file === home)?.decls.some(x => x.name === cls && x.kind === 'class')) {
        edges.push({ from: idOf(m.file, d.name), to: idOf(home, cls), type: 'instanceOf' });
        fileNode.attributes[fileNode.attributes.length - 1] = `${vis}${d.name}: ${cls}`;
      }
    }
  }

  // imports: one edge per imported module, with the names it brings in
  for (const [from, names] of Object.entries(m.imports)) edges.push({ from: m.file, to: from, type: 'imports', names });
}

// uses: a class or object that reads another file's class or object (associations, as in the picture's lines)
for (const m of mods) {
  for (const d of m.decls.filter(nodeDecl)) {
    const from = idOf(m.file, d.name), targets = new Set();
    walk.simple(d.node, {
      Identifier(n) {
        const imp = m.localFrom[n.name];
        if (imp && nodes[idOf(imp.from, imp.name)]) targets.add(idOf(imp.from, imp.name));
        else if (n.name !== d.name && nodes[idOf(m.file, n.name)]) targets.add(idOf(m.file, n.name));
      }
    });
    for (const to of targets) edges.push({ from, to, type: 'uses' });
  }
}

const out = {
  generated: new Date().toISOString(),
  howToUpdate: 'node tools/build-uml.mjs (regenerated from src/; do not edit by hand)',
  legend: {
    '+ / -': 'exported from its file / private to it',
    'name(a, b?: T): R': 'parameters (? = has a default, of type T) and inferred return type; Promise<R> for async',
    'unknown': 'type could not be inferred from the code',
    edges: { imports: 'file -> file, with the names imported', instanceOf: 'value -> its class', extends: 'class -> parent', uses: 'class/object -> class/object it reads' }
  },
  nodes,
  edges
};
writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n');
const n = Object.values(nodes);
console.log(`PROJECT-UML.json: ${n.filter(x => x.kind === 'file').length} files, ${n.filter(x => x.kind === 'class').length} classes, ` +
  `${n.filter(x => x.kind === 'object').length} objects, ${edges.length} edges.`);
