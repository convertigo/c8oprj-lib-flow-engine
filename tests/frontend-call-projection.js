const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../libs/flow/Engine.js'), 'utf8');
const start = source.indexOf('function frontAstCompatibilityActions(rootNode)');
const end = source.indexOf('\n\tfunction frontAstVariablesFromNode', start);
const project = vm.runInNewContext('(' + source.slice(start, end) + ')', {
  frontAstWalkNode: (root, visit) => root.forEach(visit),
  frontAstActionIdFromRequestable: name => name.replace(/\W/g, '_'),
  frontAstVariablesFromNode: () => ({}),
  frontAstMergeById: values => values,
  frontAstClone: value => JSON.parse(JSON.stringify(value)),
  frontAstIsObject: value => value && typeof value === 'object' && !Array.isArray(value)
});
const schema = { type: 'object', properties: { data: { type: 'string' } } };
const model = project([{ props: { kind: 'callSequence', id: 'load', requestable: '.fetch', target: 'local.response', outputSchema: schema } }]);
assert.equal(model.clientActions[0].target, 'local.response', 'schema enrichment must retain the result target used by binding sources');
assert.deepEqual(model.backendCalls[0].outputSchema, schema);
assert.deepEqual(model.clientActions[0].outputSchema, schema);
assert.equal(model.clientActions[0].backendCall, model.backendCalls[0].id);
assert.equal(project([{ props: { kind: 'callSequence', id: 'load', requestable: '.fetch' } }]).clientActions[0].target, 'load');
console.log('frontend call projection tests passed');
