'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {planSource} = require('../tools/dedupe-explicit-ids.js');
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/duplicate-ids');
const original = fs.readFileSync(path.join(fixture, '_flow/flows/Duplicates.flow.js'), 'utf8');
fs.mkdirSync(path.join(root, '_private'), {recursive: true});
const tmp = fs.mkdtempSync(path.join(root, '_private/dedupe-ids-'));
fs.cpSync(fixture, tmp, {recursive: true});
const file = path.join(tmp, '_flow/flows/Duplicates.flow.js');
let checks = 0;
function check(condition, message) { checks++; assert.ok(condition, message); }
function source(body) { return 'const _flow = { sourceVersion: 2 }\nfunction Sample({ input, result }) {\n' + body + '\n}\n'; }
function plan(body) { return planSource(source(body)); }
function refused(body, reason) {
  const result = plan(body);
  check(result.issues.length > 0 && result.code === result.source && result.issues.some(i => i.message.includes(reason)), 'Must refuse (' + reason + '): ' + body);
}
function cli(...args) {
  return spawnSync(process.execPath, [path.join(root, 'tools/dedupe-explicit-ids.js'), ...args], {encoding: 'utf8'});
}

const dry = cli(path.dirname(file));
assert.equal(dry.status, 0, dry.stderr + dry.stdout);
check(dry.stdout.includes(':25 DRY-RUN names -> names3') && dry.stdout.includes(':37 DRY-RUN names -> names4'), 'Repeated names take the first free suffix (names2 is already used)');
check(dry.stdout.includes(':42 DRY-RUN count -> count2') && dry.stdout.includes(':54 DRY-RUN if11 -> if11_2'), 'A name ending with a digit gets a separator');
check(dry.stdout.includes('4 rename(s), 0 review item(s); dry run; nothing written.'), 'Summary of the dry run');
check(fs.readFileSync(file, 'utf8') === original, 'Dry run leaves the bytes unchanged');

const written = cli(file, '--write');
assert.equal(written.status, 0, written.stderr + written.stdout);
const expected = original.split('\n').map((line, index) => ({25: 'names3', 37: 'names4', 42: 'count2', 54: 'if11_2'})[index + 1]
  ? line.replace(/"[^"]+"/, '"' + {25: 'names3', 37: 'names4', 42: 'count2', 54: 'if11_2'}[index + 1] + '"') : line).join('\n');
check(fs.readFileSync(file, 'utf8') === expected, 'Only the four repeated values change; comments, strings and layout stay byte for byte');
const again = cli(file, '--write');
check(again.status === 0 && again.stdout.includes('0 rename(s)') && fs.readFileSync(file, 'utf8') === expected, 'The tool is idempotent');
check(planSource(expected).edits.length === 0, 'The planner is idempotent');

check(planSource(original.replaceAll('\n', '\r\n')).code === expected.replaceAll('\n', '\r\n'), 'CRLF kept');
const single = plan("set({ '$$id': 'a', path: 'result.a', value: 1 })\nset({ $$id: 'a', path: 'result.b', value: 2 })");
check(single.edits.length === 1 && single.code.includes("$$id: 'a2'"), 'Quoted keys and single quotes');
const inline = plan('set({ $$id: "a", path: "result.a", value: list.first({ $$id: "a", items: [1] }) })');
check(inline.edits.length === 1 && inline.code.includes('list.first({ $$id: "a2"'), 'An inline block takes part in the names of the Flow');
check(plan('set({ $$id: "a", path: "result.a", value: input.x / 2 })').issues.length === 0, 'A division is not a regular expression');
const labels = plan('ok: set({ path: "result.ok", value: true })\nset({ $$id: "ok", path: "result.again", value: true })');
check(labels.edits.length === 1 && labels.code.includes('$$id: "ok2"'), 'A statement label is a name: the following $$id is renamed');
const labelled = plan('ok: set({ $$id: "ok", path: "result.ok", value: true })\nset({ $$id: "other", path: "result.x", value: 1 })');
check(labelled.edits.length === 0 && labelled.issues.length === 0, 'A label and the $$id of its own call are one name');
const ternary = plan('set({ $$id: "a", path: "result.a", value: input.flag ? input.b : input.c })');
check(ternary.issues.length === 0 && ternary.edits.length === 0, 'A ternary is not a label');
refused('ok: set({ path: "result.a", value: 1 })\nok: set({ path: "result.b", value: 2 })', 'repeated label');
refused('ok: set({ $$id: "other", path: "result.a", value: 1 })', 'label and $$id disagree');
refused('set({ $$id: input.name, path: "result.a", value: 1 })', '$$id must be a quoted name');
refused('set({ $$id: "a-b", path: "result.a", value: 1 })', '$$id must be a quoted name');
const template = plan('set({ $$id: "a", path: "result.a", value: `x${input.y + "}"} $$id: "a"` })\nset({ $$id: "a", path: "result.b", value: 1 })');
check(template.issues.length === 0 && template.edits.length === 1 && template.code.includes('`x${input.y + "}"} $$id: "a"`'), 'A template interpolation is skipped whole');
refused('set({ $$id: "a", path: "result.a", value: `${input.y /* } */}` })', 'Comment inside a template interpolation');
refused('set({ $$id: "a", path: "result.a", value: input.s.replace(/a/, "b") })', 'Regular expressions');
refused('set({ $$id: "a", path: "result.a", value: [1, 2 })', 'Unbalanced delimiters');

// Blocks written in FlowScript are read like Flows; JavaScript blocks are left alone.
const blocks = path.join(tmp, '_flow/blocks/sample');
fs.mkdirSync(blocks, {recursive: true});
const graphBlock = 'const _meta = { "sourceVersion": 2 }\n\nfunction sample_names({ input, config, result }) {\n  set({ $$id: "names", path: "result.a", value: 1 })\n  set({ $$id: "names", path: "result.b", value: 2 })\n}\n';
const scriptBlock = 'const _meta = { "sourceVersion": 2 }\n\n(function () {\n  return { a: { $$id: "names" }, b: { $$id: "names" } };\n})\n';
fs.writeFileSync(path.join(blocks, 'names.block.js'), graphBlock);
fs.writeFileSync(path.join(blocks, 'script.block.js'), scriptBlock);
const both = cli(tmp);
check(both.status === 0 && both.stdout.includes('names.block.js:5 DRY-RUN names -> names2') && !both.stdout.includes('script.block.js'), 'A FlowScript block is read, a JavaScript block is not');
check(both.stdout.includes('2 FlowScript file(s) (1 JavaScript block(s) skipped)'), 'The summary counts the skipped JavaScript blocks');
cli(tmp, '--write');
check(fs.readFileSync(path.join(blocks, 'script.block.js'), 'utf8') === scriptBlock, 'A JavaScript block is never rewritten');
const rewrittenBlock = graphBlock.replace('$$id: "names", path: "result.b"', () => '$$id: "names2", path: "result.b"');
check(fs.readFileSync(path.join(blocks, 'names.block.js'), 'utf8') === rewrittenBlock, 'The FlowScript block is rewritten');
fs.rmSync(path.join(tmp, '_flow/blocks'), {recursive: true});
fs.writeFileSync(file, original);

// One doubtful file holds every write of the run.
const doubtful = path.join(tmp, '_flow/flows/Doubtful.flow.js');
fs.writeFileSync(file, original);
fs.writeFileSync(doubtful, source('set({ $$id: input.name, path: "result.a", value: 1 })'));
const held = cli(path.join(tmp, '_flow/flows'), '--write');
check(held.status === 2 && held.stdout.includes('REVIEW $$id must be a quoted name') && held.stdout.includes('HELD names -> names3'), 'Review item reported, renames held');
check(fs.readFileSync(file, 'utf8') === original, 'Nothing written while a file needs a review');
fs.rmSync(doubtful);

// The engine refuses the original source and accepts the rewritten one, without running the Flow.
const rewritten = path.join(tmp, 'Rewritten.flow.js');
fs.writeFileSync(rewritten, expected);
const rhino = path.join(tmp, 'validate.js');
fs.writeFileSync(rhino, [
  'var files = Packages.org.apache.commons.io.FileUtils;',
  'try {',
  'var engine = eval(String(files.readFileToString(new java.io.File(' + JSON.stringify(path.join(root, '_flow/Engine.js')) + '), "UTF-8")));',
  'function validate(file) { return JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Duplicates", code: String(files.readFileToString(new java.io.File(file), "UTF-8")) }))); }',
  'var before = validate(' + JSON.stringify(file) + '), after = validate(' + JSON.stringify(rewritten) + ');',
  'if (before.ok || JSON.stringify(before).indexOf("FLOWSCRIPT_DUPLICATE_EXPLICIT_NAME") < 0) throw new Error("original accepted: " + JSON.stringify(before));',
  'if (!after.ok) throw new Error(JSON.stringify(after));',
  'print("flowSourceValidate: original refused (FLOWSCRIPT_DUPLICATE_EXPLICIT_NAME), rewritten accepted"); java.lang.System.exit(0);',
  '} catch (error) { print(String(error)); java.lang.System.exit(1); }'
].join('\n'));
const classpath = process.env.CONVERTIGO_TEST_CLASSPATH;
assert.ok(classpath, 'Run with tools/run-tests.sh dedupe-explicit-ids (provides the offline Rhino classpath)');
const validation = spawnSync('java', ['-Djava.awt.headless=true', '-cp', classpath, 'org.mozilla.javascript.tools.shell.Main', '-version', '200', rhino], {encoding: 'utf8', timeout: 60000});
assert.equal(validation.status, 0, validation.stdout + validation.stderr);
check(validation.stdout.includes('rewritten accepted'), 'The engine accepts the rewritten source and refuses the original');
console.log(validation.stdout.trim());
console.log('dedupe-explicit-ids: ' + checks + ' checks passed; fixtures: ' + tmp);
