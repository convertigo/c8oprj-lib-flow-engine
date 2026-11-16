const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('_flow/modules/flow-runtime-service.js', 'utf8');
const runtime = vm.runInNewContext(source);
const names = [...source.match(/var coldContextMethodNames = \[([\s\S]*?)\];/)[1].matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]);
const allowed = new Set(['runFlowSource', 'schemaForOutput', 'learnOutputSchema', 'notifySourceMutation', 'assetRead']);
const declaredAllowed = [...source.match(/var runtimeCapabilities = \[([^\]]*)\];/)[1].matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]);
assert.deepEqual([...declaredAllowed].sort(), [...allowed].sort(), 'execution capability allowlist is explicit');
const implemented = [...source.matchAll(/\bctx\.([A-Za-z]+)\s*=\s*function/g)].map(m => m[1]);
assert.deepEqual([...implemented].sort(), [...names].sort(), 'every installed context capability has a policy entry');
const env = { runtimeHandles: { assertSerializable() {}, closeAll() {} }, File: function (p, c) { this.path = String(p) + (c ? '/' + c : ''); },
  canonicalPath: f => f.path, engineDir: () => '/engine', projectDir: () => '/project', currentProjectName: () => '',
  currentConvertigoContext: () => ({ remoteAddr: '127.0.0.1' }), requestPrincipal: () => ({ kind: 'application' }),
  raise: code => { throw Error(code); }, withProjectDir: (_, f) => f(), loadBlocks: () => ({}) };
const frame = () => runtime.createRunContext({}, {}, {}, {}, env);
for (const name of names) {
  assert.equal(typeof frame()[name], 'function', `${name} must be a context capability`);
  if (!allowed.has(name)) assert.throws(() => frame()[name]({ action: 'adopt' }), e => e.code === 'AUTHORING_FORBIDDEN', `${name} must be protected`);
}
for (const name of ['configMutate', 'schemaAdopt']) assert.throws(() => frame()[name]({}), e => e.code === 'AUTHORING_FORBIDDEN');
assert.equal(new Set(names).size, names.length, 'capability names are unique');
console.log(`authoring-capability-policy OK (${names.length} capabilities classified)`);
