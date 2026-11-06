'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {loadCatalog, defaultCatalogPaths, planSource} = require('../tools/migrate-out-capture.js');
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/out-capture');
const original = fs.readFileSync(path.join(fixture, '_flow/flows/Capture.flow.js'), 'utf8');
fs.mkdirSync(path.join(root, '_private'), {recursive: true});
const tmp = fs.mkdtempSync(path.join(root, '_private/migrate-out-'));
fs.cpSync(fixture, tmp, {recursive: true});
const file = path.join(tmp, '_flow/flows/Capture.flow.js');
const catalog = loadCatalog(defaultCatalogPaths(file));
let checks = 0;
function check(condition, message) { checks++; assert.ok(condition, message); }
function source(body) { return 'const _flow = { sourceVersion: 2 };\nfunction Capture() {\n' + body + '\n}'; }
function plan(body, blocks = catalog) { return planSource(source(body), blocks); }
function refused(body, blocks) {
  const result = plan(body, blocks);
  check(result.issues.length > 0 && result.code === result.source, 'Must refuse: ' + body);
}
function cli(...args) {
  return spawnSync(process.execPath, [path.join(root, 'tools/migrate-out-capture.js'), ...args], {encoding: 'utf8'});
}
const dry = cli(file);
assert.equal(dry.status, 0, dry.stderr + dry.stdout);
check(dry.stdout.includes(':4 DRY-RUN http.get') && dry.stdout.includes(':5 DRY-RUN list.first'), 'Report locations and blocks');
check(dry.stdout.includes('-   http.get') && dry.stdout.includes('+   http.get') && dry.stdout.includes('$$out: "local.response"'), 'Report before and after');
check(fs.readFileSync(file, 'utf8') === original, 'Dry run leaves bytes unchanged');
const changed = cli(file, '--write');
assert.equal(changed.status, 0, changed.stderr + changed.stdout);
const expected = original.replace('out: "local.response"', () => '$$out: "local.response"').replace('out: "local.first"', () => '$$out: "local.first"');
check(fs.readFileSync(file, 'utf8') === expected, 'Only the two keys change; business out, data, strings, comments, $$out and layout preserved');
const again = cli(file, '--write');
check(again.status === 0 && again.stdout.includes('0 rewrite(s)') && fs.readFileSync(file, 'utf8') === expected, 'CLI is idempotent');
check(planSource(expected, catalog).edits.length === 0, 'Planner is idempotent');
const same = plan('local.first = list.first({ items: [1], out: "local.first" })');
check(same.issues.length === 0 && same.edits.length === 1, 'Matching assignment can be migrated');
const quoted = plan('list.first({ items: [1], "out": "local.first" })');
check(quoted.code.includes('"$$out":') && quoted.issues.length === 0, 'Quoted attribute key');
const nested = plan('if (true) { list.first({ items: [{ out: "data" }], out: "local.nested" }) }');
check(nested.edits.length === 1 && !nested.issues.length, 'Call in a control body; nested data untouched');
check(plan('list.first({ items: [`out: text`], out: "local.first" })').edits.length === 1, 'Plain template text untouched');
check(plan('list.first({ items: [","], fallback: ",", out: "local.first" })').edits.length === 1, 'Punctuation inside a string is not syntax');
const crlf = planSource(original.replaceAll('\n', '\r\n'), catalog);
check(crlf.code === expected.replaceAll('\n', '\r\n'), 'CRLF preserved');
const comment = '/* list.first({ out: "local.comment" }) */\nlist.first({items:[1], out:"local.x"})';
check(plan(comment).edits.length === 1 && plan(comment).code.includes(comment.split('\n')[0]), 'Block comment stays byte-for-byte');
[
  'missing.block({ out: "local.x" })',
  'list.first({ items: [1], out: "local.x", $$out: "local.y" })',
  'list.first({ out: "local.x", out: "local.y" })',
  'list.first({ items: [1], out: input.destination })',
  'list.first({ items: [1], out: "local.__proto__" })',
  'list.first({ ...input.props, out: "local.x" })',
  'list.first({ items: [1], [input.key]: 1, out: "local.x" })',
  'list.first({ items: [1], out })',
  'list.first({ items: [1], out: "local.x" }, {})',
  'local.y = list.first({ items: [1], out: "local.x" })',
  'const list = input.list; list.first({ out: "local.x" })',
  'list = input.list; list.first({ out: "local.x" })',
  'http.get = input.method; http.get({ out: "local.x" })',
  'const data = { method(list) { list.first({ out: "local.x" }) } };',
  'const other = 1, list = input.list; list.first({ out: "local.x" })',
  'const { list } = input; list.first({ out: "local.x" })',
  '((list) => list.first({ out: "local.x" }))(input.list)',
  'list["first"]({ out: "local.x" })',
  'list.first({ items: [1], out: "local.x" ',
  'list.first({ items: [/out: text/], out: "local.x" })',
  'list.first({ items: [`${input.value}`], out: "local.x" })'
].forEach(body => refused(body));
// A source migrated by hand that kept out next to the same $$out: only the repeated out goes, with its line.
const repeated = plan('  list.first({\n    items: [1],\n    $$out: "local.x",\n    out: "local.x",\n  })');
check(repeated.issues.length === 0 && repeated.edits.length === 1 && repeated.edits[0].removed === true, 'A repeated out is planned for removal');
check(repeated.code === source('  list.first({\n    items: [1],\n    $$out: "local.x",\n  })'), 'The repeated out and its line go, the rest stays byte for byte');
const inline = plan('list.first({ items: [1], out: "local.x", $$out: "local.x" })');
check(inline.code === source('list.first({ items: [1], $$out: "local.x" })'), 'An inline repeated out goes with its comma');
const last = plan('list.first({ items: [1], $$out: "local.x", out: "local.x" })');
check(last.code === source('list.first({ items: [1], $$out: "local.x" })'), 'A last repeated out takes the comma before it');
check(planSource(repeated.code, catalog).edits.length === 0 && planSource(repeated.code, catalog).issues.length === 0, 'The removal is idempotent');
refused('list.first({ items: [1], out: input.x, $$out: "local.x" })');
refused('list.first({ items: [1], out: "local.x", $$out: "local.x", $$out: "local.y" })');
const dynamic = new Map([['proof.dynamic', {props: {}, dynamic: true}]]);
refused('proof.dynamic({ out: "local.x" })', dynamic);
const unknown = path.join(tmp, '_flow/flows/Unknown.flow.js');
fs.writeFileSync(file, original);
fs.writeFileSync(unknown, source('missing.block({ out: "local.x" })'));
const held = cli(path.dirname(file), '--write');
check(held.status === 2 && held.stdout.includes('unknown block') && held.stdout.includes('HELD'), 'Unknown block reported and planned edits held');
check(fs.readFileSync(file, 'utf8') === original, 'One doubtful file prevents every write');
// Full served catalog JSON is authoritative; incomplete/compact contracts are refused.
const catalogFile = path.join(tmp, 'catalog.json');
fs.writeFileSync(catalogFile, JSON.stringify({ok: true, detail: 'full', blocks: [
  {blockId: 'http.get', props: {url: {kind: 'template'}}},
  {blockId: 'list.first', props: {items: {kind: 'expression'}}},
  {blockId: 'proof.business', props: {out: {kind: 'value'}}}
]}));
check(cli(file, '--catalog', catalogFile).status === 0, 'Served JSON catalog');
fs.writeFileSync(catalogFile, JSON.stringify({detail: 'compact', blocks: [{blockId: 'http.get'}]}));
check(cli(file, '--catalog', catalogFile, '--write').status === 2 && fs.readFileSync(file, 'utf8') === original, 'Incomplete catalog never writes');
const contracts = path.join(tmp, 'neighbors/lib_flow_fixture/_flow/blocks/proof');
fs.mkdirSync(contracts, {recursive: true});
fs.writeFileSync(path.join(contracts, 'neighbor.block.js'), '/* header */\nconst _meta = { properties: {out: {kind: "value"}} };\nthrow new Error("must not execute");');
const neighborCatalog = loadCatalog([path.resolve(contracts, '..')]);
check(plan('proof.neighbor({out: "business"})', neighborCatalog).edits.length === 0, 'Local contract reader does not execute implementations');
const neighborFlow = path.join(tmp, 'neighbors/project/_flow/flows/Neighbor.flow.js');
fs.mkdirSync(path.dirname(neighborFlow), {recursive: true});
fs.writeFileSync(neighborFlow, source('proof.neighbor({out: "business"})'));
check(loadCatalog(defaultCatalogPaths(neighborFlow)).get('proof.neighbor').props.out.kind === 'value', 'Default catalog discovers neighboring library contracts');
const duplicates = loadCatalog([path.resolve(contracts, '..'), path.join(tmp, 'neighbors/lib_flow_fixture')]);
refused('proof.neighbor({out: "local.x"})', duplicates);
fs.writeFileSync(path.join(contracts, 'trait.block.js'), 'const _meta = { traits: ["custom"] };');
refused('proof.trait({out: "local.x"})', loadCatalog([path.resolve(contracts, '..')]));
fs.writeFileSync(path.join(contracts, 'dynamic.block.js'), 'const _meta = makeMetadata();');
refused('proof.dynamic({out: "local.x"})', loadCatalog([path.resolve(contracts, '..')]));
// Public engine validation of rewritten sources, without executing the Flow or HTTP blocks.
fs.writeFileSync(file, expected);
const matchingFile = path.join(tmp, '_flow/flows/Matching.flow.js');
fs.writeFileSync(matchingFile, same.code);
const rhino = path.join(tmp, 'validate.js');
fs.writeFileSync(rhino, [
  'var __flowEngineDir = ' + JSON.stringify(path.join(root, '_flow')) + ';',
  'var __flowProjectDir = ' + JSON.stringify(tmp) + ';',
  'var files = Packages.org.apache.commons.io.FileUtils;',
  'try {',
  'var engine = eval(String(files.readFileToString(new java.io.File(__flowEngineDir, "Engine.js"), "UTF-8")));',
  JSON.stringify([file, matchingFile]) + '.forEach(function(file) {',
  'var code = String(files.readFileToString(new java.io.File(file), "UTF-8"));',
  'var result = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Capture", code: code })));',
  'if (!result.ok) throw new Error(JSON.stringify(result));',
  '});',
  'print("flowSourceValidate: PASS (2 migrated sources)"); java.lang.System.exit(0);',
  '} catch (error) { print(String(error)); java.lang.System.exit(1); }'
].join('\n'));
const classpath = process.env.CONVERTIGO_TEST_CLASSPATH;
assert.ok(classpath, 'Run with tools/run-tests.sh migrate-out-capture (provides the offline Rhino classpath)');
const validation = spawnSync('java', ['-Djava.awt.headless=true', '-cp', classpath, 'org.mozilla.javascript.tools.shell.Main', '-version', '200', rhino], {encoding: 'utf8', timeout: 60000});
assert.equal(validation.status, 0, validation.stdout + validation.stderr);
check(validation.stdout.includes('flowSourceValidate: PASS'), 'Migrated sources pass flowSourceValidate');
console.log(validation.stdout.trim());
console.log('migrate-out-capture: ' + checks + ' checks passed; fixtures: ' + tmp);
