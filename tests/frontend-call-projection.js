const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../libs/flow/Engine.js'), 'utf8');
const start = source.indexOf('function describeFrontendDocument(request)');
const end = source.indexOf('\n\tfunction prewarmFrontendDocumentServer', start);
assert.ok(start > 0 && end > start);
assert.ok(!source.includes('function describeFrontAstDocument('), 'No second frontend document producer');
const schema = { type: 'object', properties: { data: { type: 'string' } } };
const document = { ok: true, model: {
  clientActions: [{ id: 'load', target: 'local.response', backendCall: 'fetch', outputSchema: schema }],
  backendCalls: [{ id: 'fetch', outputSchema: schema }]
}, descriptors: [{ id: 'provider.custom' }], tree: { children: [] } };
const file = { getAbsolutePath: () => '/fixture/Component.flow.svelte', delete() {} };
let memory, disk, calls = 0, keys = [], failure;
const project = vm.runInNewContext('(' + source.slice(start, end) + ')', {
  frontendPerformanceMark() {}, frontendRequestSourceFile: () => file,
  frontendSvelteResourceRoot: () => file, fileForProjectPath: () => file,
  File: Object.assign(function () {}, { createTempFile: () => file }),
  FileUtils: { writeStringToFile() {} }, projectNameForRoot: () => 'Fixture',
  frontendSourceDrafts: () => ({}), runtimeState: { caches: { frontendDocuments: {} } },
  frontendDocumentFingerprint: () => 'fingerprint',
  readRuntimeMapCache: (_cache, key) => { keys.push(key); return memory; },
  readPersistentFrontendDocument: () => disk,
  writeRuntimeMapCache: (_cache, _key, _fingerprint, value) => (memory = value),
  writePersistentFrontendDocument: (_key, _fingerprint, value) => (disk = value),
  prewarmFrontendDocumentServer() {}, enrichFrontendBindingSources: value => value,
  frontendCatalogFingerprintForRequest: () => '', frontendReferenceCliArgs: () => [],
  frontendDescribeDocument: () => { calls++; if (failure) throw failure; return document; }
});
const request = { source: '<FlowComponent />', includeBindings: false };
assert.strictEqual(project(request), document, 'Provider action targets and schemas must pass through unchanged');
assert.equal(calls, 1);
assert.strictEqual(project(request), document);
assert.equal(calls, 1, 'Warm memory document must not rescan the provider');
memory = undefined;
assert.strictEqual(project(request), document);
assert.equal(calls, 1, 'Persistent provider document must survive runtime recreation');
assert.ok(keys.every(key => key.startsWith('provider-authoring-v2\n')), 'Reject old handcrafted cached documents');
memory = disk = undefined;
failure = new Error('provider unavailable');
assert.throws(() => project(request), /provider unavailable/, 'Failure must not fabricate a partial success');
console.log('frontend call projection/cache tests passed');
