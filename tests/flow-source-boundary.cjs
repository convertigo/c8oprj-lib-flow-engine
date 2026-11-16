const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const runtime = vm.runInNewContext(fs.readFileSync('_flow/modules/flow-runtime-service.js', 'utf8'));
let principal = {kind: 'application'}, reads = 0;
const reached = Error('source resolved');
const env = {
  runtimeHandles: {assertSerializable() {}, closeAll() {}},
  File: function (p, c) { this.path = String(p) + (c ? '/' + c : ''); },
  canonicalPath: f => f.path, engineDir: () => '/engine', projectDir: () => '/project', currentProjectName: () => 'Fixture',
  currentConvertigoContext: () => ({}), requestPrincipal: () => principal, raise: code => { throw Error(code); },
  withProjectDir: (_, f) => f(), loadBlocks: () => ({}),
  sourceForWriteRequest: () => { reads++; throw reached; },
  getProjectFlow: () => { reads++; throw reached; }
};
const frame = request => runtime.createRunContext(request || {}, {}, {}, {}, env);
const flowRunSource = fs.readFileSync('_flow/blocks/flow/run.block.js', 'utf8');
const flowRun = vm.runInNewContext(flowRunSource.slice(flowRunSource.indexOf('(function ()')));
const runBlock = request => flowRun.run({props: node => node,
  runFlowSource: (...args) => frame(request).runFlowSource(...args)}, {flowSource: 'source'});
for (const [source, options] of [['source', {}], [null, {definition: {nodes: []}}], [null, {projectDir: '/other'}], [null, {flowSource: 'x'}], [null, {}], [null, {namedFlowName: 'Saved', projectDir: '/other'}], [null, {namedFlowName: 'Saved', flowSource: 'x'}]]) {
  reads = 0;
  assert.throws(() => frame().runFlowSource(source, {}, options), e => e.code === 'AUTHORING_FORBIDDEN');
  assert.equal(reads, 0, 'source resolution happens after author check');
}
const root = frame();
root.requestPrincipal = () => ({kind: 'application'});
assert.throws(() => frame({__parentRun: root}).runFlowSource('source', {}, {}), e => e.code === 'AUTHORING_FORBIDDEN');
assert.throws(() => runBlock(), e => e.code === 'AUTHORING_FORBIDDEN', 'flow.run refuses an application');
assert.throws(() => runBlock({__parentRun: root}), e => e.code === 'AUTHORING_FORBIDDEN', 'nested flow.run keeps the root principal');
principal = {kind: 'studio'};
assert.throws(() => frame().runFlowSource('source', {}, {}), e => e === reached);
assert.throws(() => runBlock(), e => e === reached, 'flow.run reaches source resolution for an author');
assert.equal(reads, 2, 'an author reaches source resolution');
principal = {kind: 'application'};
assert.throws(() => frame().runFlowSource(null, {}, {namedFlowName: 'Saved'}), e => e === reached);
const flow = {getProject: () => ({getName: () => 'Fixture', getDirPath: () => '/fixture'}),
  getClass: () => ({getName: () => 'com.twinsoft.convertigo.beans.flow.Flow'}),
  getName: () => 'Stored', getFlowSource: () => { throw reached; }};
assert.throws(() => frame().runStoredRequestableFlow({getFlowSource: () => 'untrusted'}, {}),
  /resolved Convertigo Flow/, 'stored path requires a Flow object');
assert.throws(() => frame().runStoredRequestableFlow(flow, {}), e => e === reached,
  'stored requestable source can be resolved for an application');
console.log('flow-source-boundary OK');
