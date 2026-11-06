#!/usr/bin/env node
'use strict';
// Offline only. Never import this tool from the engine or evaluate inspected sources.
// Since 0.2.20 the FlowScript parser refuses a Flow whose explicit names ($$id values and statement labels) repeat
// (FLOWSCRIPT_DUPLICATE_EXPLICIT_NAME); older tools wrote such sources. This tool keeps the first occurrence of each
// name and renames the following $$id values with a free suffix (names, names2, names3; if11, if11_2). Dry run by
// default; --write rewrites only when no file of the run needs a manual review.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engineRoot = path.resolve(__dirname, '..');
// The engine's literal reader decodes the quoted values exactly as the parser does.
const parser = vm.runInNewContext(fs.readFileSync(path.join(engineRoot, '_flow/modules/flow-script-parser-service.js'), 'utf8'), {}, {timeout: 1000});
const env = {raise(code, message) { throw new Error(code + ': ' + message); }};
function literal(text) { return parser.parseFlowScriptMetadataValue(text, 1, env); }
function lineAt(text, offset) { return text.slice(0, offset).split(/\r\n|\r|\n/).length; }
function issue(message, offset = 0) { throw Object.assign(new Error(message), {offset}); }
const NAME = /^[A-Za-z_$][\w$]*$/;
// A '{' after these tokens opens a statement block; after anything else, an object literal.
const BLOCK_OPENERS = new Set([')', '{', '}', ';', 'else', 'do', 'try', 'finally']);
const KEYWORDS = new Set(['case', 'default', 'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void']);

// The end of the string or template starting at i. A template interpolation is skipped whole: braces are counted, and
// the strings, templates and comments inside it are skipped too; it never holds a block name.
function quotedEnd(text, i) {
  const start = i, quote = text[i++];
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') { i += 2; continue; }
    if (quote === '`' && text.startsWith('${', i)) {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        const c = text[i];
        if ('"\'`'.includes(c)) { i = quotedEnd(text, i); continue; }
        if (text.startsWith('//', i) || text.startsWith('/*', i)) issue('Comment inside a template interpolation needs manual review', i);
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
      if (depth > 0) issue('Unterminated template interpolation', start);
      continue;
    }
    i++;
  }
  if (i >= text.length) issue('Unterminated string', start);
  return i + 1;
}
// Tokens keep exact offsets. Forms this scanner cannot read safely refuse the file.
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
      i = quotedEnd(text, i);
      value = kind === 'string' ? literal(text.slice(start, i)) : text.slice(start, i);
    } else if (/[A-Za-z_$]/.test(ch)) {
      kind = 'identifier'; i++;
      while (i < text.length && /[\w$]/.test(text[i])) i++;
      value = text.slice(start, i);
    } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      kind = 'number'; i++;
      while (i < text.length && /[\w.]/.test(text[i])) i++;
      value = text.slice(start, i);
    } else {
      if (ch === '\\') issue('Escaped identifiers need manual review', i);
      if (ch === '/') {
        // A slash after a value is a division; anywhere else it would start a regular expression.
        const previous = out[out.length - 1];
        if (!previous || !(previous.kind === 'identifier' && !KEYWORDS.has(previous.value) || previous.kind === 'number' || previous.kind === 'string' || [')', ']'].includes(previous.value))) {
          issue('Regular expressions need manual review', i);
        }
      }
      const multi = /^(?:\.\.\.|\?\.|=>|===|!==|==|!=|<=|>=|\+=|-=|\*=|\/=|&&|\|\||\?\?)/.exec(text.slice(i));
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
function filesUnder(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '_private' || entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) issue('Symbolic link needs manual review: ' + file);
    if (entry.isDirectory()) found.push(...filesUnder(file));
    else if (entry.isFile() && isSource(file)) found.push(file);
  }
  return found;
}
function isSource(file) {
  const unix = file.split(path.sep).join('/');
  return unix.endsWith('.flow.js') && unix.includes('/_flow/flows/') || unix.endsWith('.block.js') && unix.includes('/_flow/blocks/');
}
// A block written in FlowScript declares its main function with named parameters; a JavaScript block is an IIFE.
function isFlowScriptBlock(source) {
  return /^function\s+[A-Za-z_$][\w$]*\s*\(\s*\{/m.test(source) && !/^\(function\s*\(/m.test(source);
}
// The innermost '{' around token i, or -1 at the top level.
function enclosingBrace(ts, i) {
  for (let k = i - 1, depth = 0; k >= 0; k--) {
    const v = ts[k].kind === 'punctuation' ? ts[k].value : '';
    if (v === '}' || v === ')' || v === ']') depth++;
    else if (v === '{' || v === '(' || v === '[') {
      if (depth === 0) return v === '{' ? k : -2;
      depth--;
    }
  }
  return -1;
}
function isBlockBrace(ts, open) { return open >= 0 && (open === 0 || BLOCK_OPENERS.has(ts[open - 1].value)); }

function planSource(source) {
  const edits = [], issues = [];
  try {
    // FlowScript is not plain JavaScript (if({...}), return({...})): the scanner checks strings, comments and balanced
    // delimiters itself, and nothing is ever evaluated.
    const ts = tokens(source);
    const names = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (ts[i + 1]?.value !== ':' || !['identifier', 'string'].includes(t.kind)) continue;
      const open = enclosingBrace(ts, i);
      if (t.value === '$$id' && open >= 0 && !isBlockBrace(ts, open) && ['{', ','].includes(ts[i - 1]?.value)) {
        const value = ts[i + 2], next = ts[i + 3];
        if (!value || value.kind !== 'string' || !next || ![',', '}'].includes(next.value) || !NAME.test(value.value)) {
          issues.push({offset: t.start, message: '$$id must be a quoted name'});
          continue;
        }
        names.push({kind: '$$id', name: value.value, token: value, object: open});
      } else if (t.kind === 'identifier' && !KEYWORDS.has(t.value) && ts[i - 1]?.value !== '?'
          && (open === -1 || isBlockBrace(ts, open)) && (i === 0 || BLOCK_OPENERS.has(ts[i - 1].value) || ts[i - 1].kind !== 'punctuation')) {
        // A statement label names the block it precedes; its own $$id, if any, must say the same.
        names.push({kind: 'label', name: t.value, token: t, statement: i + 2});
      }
    }
    // A label and the $$id of the call it labels are one name.
    const labelled = new Set();
    for (const label of names.filter(n => n.kind === 'label')) {
      let k = label.statement;
      while (ts[k]?.kind === 'identifier' && ts[k + 1]?.value === '.') k += 2;
      if (ts[k]?.kind !== 'identifier' || ts[k + 1]?.value !== '(' || ts[k + 2]?.value !== '{') continue;
      const own = names.find(n => n.kind === '$$id' && n.object === k + 2);
      if (own) {
        if (own.name !== label.name) issues.push({offset: label.token.start, message: 'label and $$id disagree'});
        labelled.add(own);
      }
    }
    const used = new Set(names.map(n => n.name)), seen = new Map();
    for (const entry of names) {
      if (labelled.has(entry)) continue;
      if (!seen.has(entry.name)) { seen.set(entry.name, entry); continue; }
      if (entry.kind === 'label') {
        issues.push({offset: entry.token.start, message: 'repeated label ' + entry.name + ' needs manual review'});
        continue;
      }
      const separator = /\d$/.test(entry.name) ? '_' : '';
      let rank = 1, name;
      do { rank++; name = entry.name + separator + rank; } while (used.has(name));
      used.add(name);
      const quote = source[entry.token.start];
      edits.push({start: entry.token.start, end: entry.token.end, before: entry.name, after: name, text: quote + name + quote, line: lineAt(source, entry.token.start)});
    }
  } catch (error) { issues.push({offset: error.offset || 0, message: error.message}); }
  let code = source;
  if (!issues.length) for (const edit of edits.slice().sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return {source, code, edits, issues};
}
function main(args, log = console.log) {
  let write = false;
  const targets = [];
  for (const arg of args) {
    if (arg === '--write') write = true;
    else if (arg === '--help') {
      log('Usage: node tools/dedupe-explicit-ids.js <file.flow.js|file.block.js|project|_flow|workspace>... [--write]');
      log('Reads the Flows (_flow/flows/*.flow.js) and the blocks written in FlowScript (_flow/blocks/**/*.block.js).');
      return 0;
    } else if (arg.startsWith('-')) issue('Unexpected argument: ' + arg);
    else targets.push(path.resolve(arg));
  }
  if (!targets.length) issue('A .flow.js file or a directory is required; use --help.');
  const files = [];
  for (const target of targets) {
    if (fs.lstatSync(target).isSymbolicLink()) issue('Symbolic target path needs manual review: ' + target);
    if (fs.statSync(target).isDirectory()) files.push(...filesUnder(target));
    else if (target.endsWith('.flow.js') || target.endsWith('.block.js')) files.push(target);
    else issue('Expected a .flow.js or .block.js file, or a directory: ' + target);
  }
  let javascript = 0;
  const plans = files.flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.block.js') && !isFlowScriptBlock(source)) { javascript++; return []; }
    return [{file, ...planSource(source)}];
  });
  const blocked = plans.some(p => p.issues.length);
  let count = 0;
  for (const plan of plans) {
    for (const problem of plan.issues) log(`${plan.file}:${lineAt(plan.source, problem.offset)} REVIEW ${problem.message}`);
    for (const edit of plan.edits) {
      const lineStart = Math.max(plan.source.lastIndexOf('\n', edit.start - 1), plan.source.lastIndexOf('\r', edit.start - 1)) + 1;
      const rest = plan.source.slice(edit.end), end = rest.search(/[\r\n]/);
      const lineEnd = end < 0 ? plan.source.length : edit.end + end;
      const before = plan.source.slice(lineStart, lineEnd);
      const after = plan.source.slice(lineStart, edit.start) + edit.text + plan.source.slice(edit.end, lineEnd);
      log(`${plan.file}:${edit.line} ${blocked ? 'HELD' : write ? 'WRITE' : 'DRY-RUN'} ${edit.before} -> ${edit.after}\n- ${before}\n+ ${after}`);
      count++;
    }
  }
  // Every file is checked again just before any write, so that a source changed since the read is never overwritten.
  if (write && !blocked) {
    for (const plan of plans) if (fs.readFileSync(plan.file, 'utf8') !== plan.source) issue('Source changed during review: ' + plan.file);
    for (const plan of plans) if (plan.edits.length) fs.writeFileSync(plan.file, plan.code, 'utf8');
  }
  const touched = plans.filter(p => p.edits.length).length;
  log(`${plans.length} FlowScript file(s) (${javascript} JavaScript block(s) skipped), ${touched} with repeated names, ${count} rename(s), ${plans.reduce((n, p) => n + p.issues.length, 0)} review item(s); ${blocked ? 'nothing written' : write ? 'write complete' : 'dry run; nothing written'}.`);
  return blocked ? 2 : 0;
}
module.exports = {planSource, main};
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error('REVIEW ' + error.message); process.exitCode = 2; }
}
