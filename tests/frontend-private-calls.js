// A front that calls a private Flow: a browser is refused (only an administrator and the MCP run it), and the agent's
// own runs through the MCP never show it (it150, L2/F exercises, 19/11). The page says so (warning
// FRONTEND_CALLS_PRIVATE_FLOW, a CallSequence keeps its error alone), and so does the build, which the frontbuilder
// setting refusePrivateCalls: true stops. URL Mapper paths and FullSync are out of scope.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const flowDir = path.join(__dirname, '../_flow');
const service = vm.runInNewContext(fs.readFileSync(path.join(flowDir, 'modules/flow-tree-service.js'), 'utf8'), {});

// The accessibility the engine reads for each target (Flow.getAccessibility: header, YAML, then the default, private).
const accessibility = { 'Books.book_create': 'Private', 'Books.books_list': 'Hidden', 'Books.audit': 'Public' };
const lookups = [];
const env = {
  requestableInputContract(requestable) {
    lookups.push(requestable);
    const qname = requestable.charAt(0) === '.' ? 'Books' + requestable : requestable;
    return accessibility[qname] ? { accessibility: accessibility[qname], target: { kind: 'flow', qname } } : null;
  }
};
const calls = [
  { id: 'create', requestable: '.book_create' },
  { id: 'createAgain', requestable: '.book_create' },
  { id: 'list', requestable: 'Books.books_list' },
  { id: 'audit', requestable: 'Books.audit' },
  { id: 'sync', requestable: 'fs://books.view' },
  { id: 'mapped', requestable: '/api/books' },
  { id: 'unknown', requestable: 'Books.missing' }
];
const page = '/workspace/projects/Books/_flow/frontend/src/routes/+page.flow.svelte';
const found = service.frontendPrivateCallDiagnostics(calls, { project: 'Books' }, page, env);
assert.equal(found.length, 1, 'One warning per private target: ' + JSON.stringify(found));
assert.equal(found[0].code, 'FRONTEND_CALLS_PRIVATE_FLOW');
assert.equal(found[0].severity, 'warning');
assert.equal(found[0].sourcePath, page, 'Kept by the check of this page only');
assert.match(found[0].message, /Books\.book_create, which is private: a browser is refused/);
assert.match(found[0].hint, /accessibility: "public" \(listed\) or "hidden" \(not listed\)/);
assert.ok(!lookups.includes('fs://books.view') && !lookups.includes('/api/books'), 'FullSync and URL Mapper calls are not looked up');

// The page: a CallSequence already reported (FRONTEND_CALLSEQUENCE_PRIVATE, an error) keeps its diagnostic alone.
const tree = fs.readFileSync(path.join(flowDir, 'modules/flow-tree-service.js'), 'utf8');
assert.ok(/reportedCalls\[String\(diagnostic\.requestable\)\] = true/.test(tree) &&
  /frontendPrivateCallDiagnostics\(described\.model\.backendCalls, request,/.test(tree),
  'The page document adds the warning next to the CallSequence contract diagnostics');

// The build: after the generation, the calls of the generated application.
const source = fs.readFileSync(path.join(flowDir, 'Engine.js'), 'utf8');
const start = source.indexOf('function frontendPrivateCallsStep(');
const end = source.indexOf('\n\tfunction frontendBuildOutputBuilt', start);
assert.ok(start > 0 && end > start, 'The build step exists');
assert.ok(/currentStepAction === "generate" && actions\.indexOf\("build"\) >= 0\s*\? frontendPrivateCallsStep\(generatedRoot, request, info\)/.test(source),
  'It runs right after the generation of a build');
const generated = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-private-calls-'));
const logs = [];
function File(parent, child) {
  const full = child === undefined ? String(parent) : path.join(String(parent.full || parent), child);
  return { full, isFile: () => fs.existsSync(full) && fs.statSync(full).isFile(), getAbsolutePath: () => full };
}
const step = vm.runInNewContext('(function () {' + source.slice(start, end) + '\nreturn frontendPrivateCallsStep; }())', {
  JavaSystem: { nanoTime: () => 0 }, File,
  FileUtils: { readFileToString: (file) => fs.readFileSync(file.full, 'utf8') },
  flowTreeService: () => service, flowTreeServiceEnv: () => env,
  frontendStudioLog: (line) => logs.push(line), frontendDurationMs: () => 0, JSON
});
try {
  const root = new File(generated);
  assert.equal(step(root, { project: 'Books' }, { settings: {} }), null, 'No generated config: nothing to say');
  fs.mkdirSync(path.join(generated, 'src/lib'), { recursive: true });
  const projectConfig = 'import type { BackendCall } from "./convertigoClient";\n\nexport const backendCalls = ' +
    JSON.stringify(Object.fromEntries(calls.map((call) => [call.id, call])), null, 2) +
    ' satisfies Record<string, BackendCall>;\n';
  fs.writeFileSync(path.join(generated, 'src/lib/projectConfig.ts'), projectConfig);
  const warned = step(root, { project: 'Books' }, { settings: {} });
  assert.equal(warned.ok, true, 'Off by default: the build goes on');
  assert.equal(warned.code, 'FRONTEND_CALLS_PRIVATE_FLOW');
  assert.match(warned.stdout, /refused to a browser: \.book_create\. Declare accessibility: "public" or "hidden"/);
  assert.equal(warned.diagnostics.length, 1);
  assert.ok(logs.some((line) => /private Flows/.test(line)), 'The build log says it');
  const refused = step(root, { project: 'Books' }, { settings: { refusePrivateCalls: true } });
  assert.equal(refused.ok, false, 'refusePrivateCalls stops the build');
  assert.equal(refused.exitCode, 1);
  assert.match(refused.stdout, /the build stops/);
  accessibility['Books.book_create'] = 'Hidden';
  assert.equal(step(root, { project: 'Books' }, { settings: { refusePrivateCalls: true } }), null, 'Declared hidden: nothing to say');
} finally {
  fs.rmSync(generated, { recursive: true, force: true });
}
console.log('frontend private calls tests passed');
