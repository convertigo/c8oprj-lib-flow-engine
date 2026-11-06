#!/usr/bin/env node
'use strict';
// Offline only. Never import this tool from the engine or evaluate inspected sources.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engineRoot = path.resolve(__dirname, '..');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function moduleValue(name) {
  return vm.runInNewContext(fs.readFileSync(path.join(engineRoot, '_flow/modules', name), 'utf8'), {}, {timeout: 1000});
}
// Use the engine's literal/header readers, including comments and duplicate-key checks.
const parser = moduleValue('flow-script-parser-service.js');
const headers = moduleValue('block-code-source-service.js');
const destinations = moduleValue('destination-contract.js');
const env = {raise(code, message) { throw new Error(code + ': ' + message); }};
env.parseFlowScriptMetadataValue = (text, line) => parser.parseFlowScriptMetadataValue(text, line, env);
function literal(text) { return env.parseFlowScriptMetadataValue(text, 1); }
function lineAt(text, offset) { return text.slice(0, offset).split(/\r\n|\r|\n/).length; }
function issue(message, offset = 0) { throw Object.assign(new Error(message), {offset}); }

// Tokens retain exact offsets. Unsupported lexical forms refuse the entire run,
// rather than risk recognizing a call inside a regular expression or interpolation.
function tokens(text) {
  const out = [], stack = [];
  let i = 0;
  while (i < text.length) {
    const start = i, ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (text.startsWith('//', i)) { while (i < text.length && !/[\r\n]/.test(text[i])) i++; continue; }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) issue('Unterminated comment', i);
      i = end + 2; continue;
    }
    let kind = 'punctuation', value;
    if ('"\'`'.includes(ch)) {
      kind = ch === '`' ? 'template' : 'string';
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\') { i += 2; continue; }
        if (ch === '`' && text.startsWith('${', i)) issue('Template interpolation needs manual review', i);
        i++;
      }
      if (i >= text.length) issue('Unterminated string', start);
      i++;
      value = kind === 'string' ? literal(text.slice(start, i)) : text.slice(start, i);
    } else if (/[A-Za-z_$]/.test(ch)) {
      kind = 'identifier'; i++;
      while (i < text.length && /[\w$]/.test(text[i])) i++;
      value = text.slice(start, i);
    } else {
      if (ch === '/' || ch === '\\') issue('Slash expressions or escaped identifiers need manual review', i);
      const multi = /^(?:\.\.\.|\?\.|=>|===|!==|==|!=|\+=|-=|\*=|&&|\|\||\?\?)/.exec(text.slice(i));
      value = multi ? multi[0] : ch; i += value.length;
    }
    const token = {kind, value, start, end: i};
    const index = out.push(token) - 1;
    if (kind !== 'punctuation') continue;
    if ('([{'.includes(value)) stack.push(index);
    else if (')]}'.includes(value)) {
      const open = stack.pop();
      if (open === undefined || '([{'.indexOf(out[open].value) !== ')]}'.indexOf(value)) issue('Unbalanced delimiters', start);
      out[open].close = index; token.open = open;
    }
  }
  if (stack.length) issue('Unclosed delimiter', out[stack[0]].start);
  return out;
}
function filesUnder(dir, suffix) {
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) issue('Symbolic link needs manual review: ' + file);
    if (entry.isDirectory()) found.push(...filesUnder(file, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(file);
  }
  return found;
}
function blockDirectory(root) {
  return [path.join(root, '_flow/blocks'), path.join(root, 'blocks'), root]
    .find(dir => fs.existsSync(dir) && fs.statSync(dir).isDirectory() && path.basename(dir) === 'blocks');
}
function defaultCatalogPaths(target) {
  let current = fs.statSync(target).isDirectory() ? target : path.dirname(target), project;
  while (path.dirname(current) !== current) {
    if (path.basename(current) === '_flow') { project = path.dirname(current); break; }
    current = path.dirname(current);
  }
  const roots = new Set([engineRoot]);
  if (project) roots.add(project);
  for (const parent of new Set([path.dirname(engineRoot), project && path.dirname(project)].filter(Boolean))) {
    for (const entry of fs.readdirSync(parent, {withFileTypes: true})) {
      if (entry.isDirectory() && /^(lib_flow_|c8oprj-lib-flow-)/.test(entry.name)) roots.add(path.join(parent, entry.name));
    }
  }
  return [...roots].map(blockDirectory).filter(Boolean);
}
function loadCatalog(paths) {
  const catalog = new Map(), seen = new Set();
  function add(id, contract) {
    if (catalog.has(id)) catalog.set(id, {error: 'Multiple contracts; supply the exact served JSON catalog'});
    else catalog.set(id, contract);
  }
  for (const input of paths) {
    const real = fs.realpathSync(input);
    if (seen.has(real)) continue;
    seen.add(real);
    if (fs.statSync(real).isFile()) {
      const data = JSON.parse(fs.readFileSync(real, 'utf8'));
      const blocks = Array.isArray(data) ? data : data.blocks;
      if (!Array.isArray(blocks) || (!Array.isArray(data) && (data.ok === false || (data.detail && data.detail !== 'full')))) {
        issue('Expected a full served catalog JSON with a blocks array: ' + input);
      }
      for (const block of blocks) {
        if (!object(block) || typeof block.blockId !== 'string' || !object(block.props)) issue('Incomplete catalog descriptor in ' + input);
        add(block.blockId, {props: block.props, dynamic: block.dynamicProperties === true || !!block.additionalProperties});
      }
    } else {
      const dir = blockDirectory(real);
      if (!dir) issue('Expected a project, _flow, blocks directory, or full catalog JSON: ' + input);
      for (const file of filesUnder(dir, '.block.js')) {
        const id = path.relative(dir, file).slice(0, -'.block.js'.length).split(path.sep).join('.');
        try {
          const extracted = headers.extractMeta(fs.readFileSync(file, 'utf8'), env), meta = extracted.meta;
          if (!extracted.header) issue('Missing literal _meta header');
          if (meta.sourceVersion !== undefined && meta.sourceVersion !== 2) issue('Unsupported block source version');
          if (meta.name && meta.name !== id && meta.name !== id.split('.').pop()) issue('Block name mismatch');
          if (meta.traits && Object.keys(meta.traits).length) issue('Traits need the composed served JSON catalog');
          const props = meta.properties || meta.props || {};
          if (!object(props)) issue('Invalid properties contract');
          add(id, {props, dynamic: meta.dynamicProperties === true || !!meta.additionalProperties});
        } catch (error) { add(id, {error: error.message}); }
      }
    }
  }
  return catalog;
}
function properties(ts, open) {
  const props = [];
  for (let i = open + 1; i < ts[open].close;) {
    const start = i;
    while (i < ts[open].close && !(ts[i].kind === 'punctuation' && ts[i].value === ',')) i = ts[i].close === undefined ? i + 1 : ts[i].close + 1;
    if (i > start) props.push({key: ts[start], colon: ts[start + 1], value: ts.slice(start + 2, i), end: i});
    i++;
  }
  return props;
}
function callName(ts, open) {
  let i = open - 1;
  if (!ts[i] || ts[i].kind !== 'identifier') return null;
  const parts = [ts[i].value];
  while (ts[i - 1]?.value === '.' && ts[i - 2]?.kind === 'identifier') { i -= 2; parts.unshift(ts[i].value); }
  if (['.', '?.', 'new'].includes(ts[i - 1]?.value)) return null;
  return {name: parts.join('.'), start: i};
}
function planSource(source, catalog) {
  const edits = [], issues = [];
  try {
    // Compile only, never run. The tool deliberately accepts a conservative JS-compatible FlowScript subset.
    new vm.Script(source);
    const ts = tokens(source);
    // Any local binding of a catalog namespace makes that name ambiguous.
    const bindings = new Set();
    for (let i = 0; i < ts.length; i++) {
      if (ts[i].kind === 'punctuation' && ts[i].value === '=>') issue('Arrow functions need manual binding review', ts[i].start);
      if (ts[i].value === '(' && ts[ts[i].close + 1]?.value === '{') {
        // Includes method parameters as well as ordinary function parameters.
        for (let k = i + 1; k < ts[i].close; k++) if (ts[k].kind === 'identifier') bindings.add(ts[k].value);
      }
      if (ts[i].kind !== 'identifier') continue;
      let assignment = i;
      while (ts[assignment + 1]?.value === '.' && ts[assignment + 2]?.kind === 'identifier') assignment += 2;
      if (['=', '+=', '-=', '*='].includes(ts[assignment + 1]?.value)) bindings.add(ts[i].value);
      if (['class', 'catch'].includes(ts[i].value)) issue('Non-FlowScript binding needs manual review', ts[i].start);
      if (['const', 'let', 'var'].includes(ts[i].value)) {
        if (ts[i + 1]?.kind !== 'identifier') issue('Destructuring declaration needs manual review', ts[i].start);
        bindings.add(ts[i + 1].value);
        for (let j = i + 2; j < ts.length && ts[j].value !== ';';) {
          if (ts[j].value === ',') issue('Multiple bindings need manual review', ts[j].start);
          if (j > i + 2 && /[\r\n]/.test(source.slice(ts[j - 1].end, ts[j].start))) {
            // A declaration spanning lines outside an object/call is ambiguous to this scanner.
            if (['=', '.', '+', '-', '*', '?', ':'].includes(ts[j - 1].value)) issue('Multiline binding needs manual review', ts[j].start);
            break;
          }
          j = ts[j].close === undefined ? j + 1 : ts[j].close + 1;
        }
      }
      if (ts[i].value === 'function') {
        if (ts[i + 1]?.kind === 'identifier') bindings.add(ts[i + 1].value);
      }
    }
    for (let open = 0; open < ts.length; open++) {
      if (ts[open].kind !== 'punctuation' || ts[open].value !== '{' || ts[open - 1]?.value !== '(') continue;
      const props = properties(ts, open);
      const outs = props.filter(p => p.key.value === 'out');
      const uncertain = props.some(p => !['identifier', 'string'].includes(p.key.kind) || p.colon?.value !== ':');
      const call = callName(ts, open - 1);
      // Computed/spread properties can conceal out; do not silently treat them as migrated.
      if (!outs.length && !(uncertain && call && catalog.has(call.name))) continue;
      const offset = outs[0]?.key.start ?? ts[open].start;
      const refuse = reason => issues.push({offset, message: (call?.name || 'Computed call') + ': ' + reason});
      if (!call) { refuse('unresolved block name'); continue; }
      const contract = catalog.get(call.name);
      if (!contract) { refuse('unknown block; no rewrite'); continue; }
      if (contract.error) { refuse(contract.error); continue; }
      if (bindings.has(call.name.split('.')[0])) { refuse('name also used by a local binding'); continue; }
      if (own(contract.props, 'out')) continue;
      if (contract.dynamic) { refuse('open business property contract'); continue; }
      if (uncertain || outs.length !== 1) { refuse('spread, computed, shorthand, method or duplicate property'); continue; }
      const keys = props.map(p => p.key.value);
      if (new Set(keys).size !== keys.length || keys.includes('$$out')) { refuse('duplicate property or existing $$out capture'); continue; }
      if (ts[ts[open].close + 1]?.value !== ')' || ts[open - 1].close !== ts[open].close + 1) { refuse('expected one named argument object'); continue; }
      const out = outs[0];
      if (out.value.length !== 1 || out.value[0].kind !== 'string' || !out.value[0].value || !destinations.validate(out.value[0].value).valid) {
        refuse('capture must be a quoted static destination'); continue;
      }
      if (ts[call.start - 1]?.value === '=') {
        let j = call.start - 2;
        const end = j;
        while (j >= 2 && ts[j - 1].value === '.' && ts[j - 2].kind === 'identifier') j -= 2;
        const assigned = ts.slice(j, end + 1).map(t => t.value).join('');
        if (assigned !== out.value[0].value) { refuse('assignment and out destinations differ'); continue; }
      }
      const before = source.slice(out.key.start, out.key.end);
      const after = out.key.kind === 'string' ? before[0] + '$$out' + before[0] : '$$out';
      edits.push({start: out.key.start, end: out.key.end, before, after, block: call.name, line: lineAt(source, out.key.start)});
    }
  } catch (error) { issues.push({offset: error.offset || 0, message: error.message}); }
  let code = source;
  if (!issues.length) for (const edit of edits.slice().sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.after + code.slice(edit.end);
  return {source, code, edits, issues};
}
function main(args) {
  let target, write = false;
  const catalogs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--write') write = true;
    else if (args[i] === '--catalog' && args[i + 1] && !args[i + 1].startsWith('--')) catalogs.push(path.resolve(args[++i]));
    else if (args[i] === '--help') {
      console.log('Usage: node tools/migrate-out-capture.js <_flow/flows|file.flow.js> [--catalog <full.json|project|_flow|blocks>] [--write]');
      return 0;
    } else if (args[i].startsWith('-') || target) issue('Unexpected argument: ' + args[i]);
    else target = path.resolve(args[i]);
  }
  if (!target) issue('A _flow/flows directory or .flow.js file is required; use --help.');
  if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target) issue('Symbolic target path needs manual review');
  const stat = fs.statSync(target);
  if (!stat.isDirectory() && !target.endsWith('.flow.js')) issue('Expected a .flow.js file');
  if (stat.isDirectory() && (path.basename(target) !== 'flows' || path.basename(path.dirname(target)) !== '_flow')) issue('Expected a _flow/flows directory');
  const files = stat.isDirectory() ? filesUnder(target, '.flow.js') : [target];
  const catalog = loadCatalog(catalogs.length ? catalogs : defaultCatalogPaths(target));
  const plans = files.map(file => ({file, ...planSource(fs.readFileSync(file, 'utf8'), catalog)}));
  const blocked = plans.some(p => p.issues.length);
  let count = 0;
  for (const plan of plans) {
    for (const problem of plan.issues) console.log(`${plan.file}:${lineAt(plan.source, problem.offset)} REVIEW ${problem.message}`);
    for (const edit of plan.edits) {
      const lineStart = Math.max(plan.source.lastIndexOf('\n', edit.start - 1), plan.source.lastIndexOf('\r', edit.start - 1)) + 1;
      const rest = plan.source.slice(edit.end), end = rest.search(/[\r\n]/);
      const lineEnd = end < 0 ? plan.source.length : edit.end + end;
      const before = plan.source.slice(lineStart, lineEnd);
      const after = plan.source.slice(lineStart, edit.start) + edit.after + plan.source.slice(edit.end, lineEnd);
      console.log(`${plan.file}:${edit.line} ${blocked ? 'HELD' : write ? 'WRITE' : 'DRY-RUN'} ${edit.block}\n- ${before}\n+ ${after}`);
      count++;
    }
  }
  // Preflight all files before any mutation, including changes since the read.
  if (write && !blocked) {
    for (const plan of plans) if (fs.readFileSync(plan.file, 'utf8') !== plan.source) issue('Source changed during review: ' + plan.file);
    for (const plan of plans) if (plan.edits.length) fs.writeFileSync(plan.file, plan.code, 'utf8');
  }
  console.log(`${count} rewrite(s), ${plans.reduce((n, p) => n + p.issues.length, 0)} review item(s); ${blocked ? 'nothing written' : write ? 'write complete' : 'dry run; nothing written'}.`);
  return blocked ? 2 : 0;
}
module.exports = {loadCatalog, defaultCatalogPaths, planSource, main};
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error('REVIEW ' + error.message); process.exitCode = 2; }
}
