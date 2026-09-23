const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = name => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../_flow/modules', name + '.js'), 'utf8'));
const contract = load('destination-contract');
const paths = load('scope-path-utils');
const env = { destinationContract: contract, scopeNames: ['input', 'config', 'request', 'trace', 'local', 'result', 'current'],
  raise(code, message) { throw Object.assign(new Error(message), { code }); }, assertNoRuntimeHandle() {} };
for (const value of ['local.answer', 'result.weather.temperature', 'local._value', 'local.$value']) {
  assert.equal(contract.validate(value).valid, true, value);
}
for (const value of ['input.name', 'config.url', 'request.header', 'current.value', 'trace.probes',
  'local', 'result', 'local..x', 'local.x.', ' local.x', 'local.a b', 'local.a\nb',
  '{{ local.target }}', 'local.{{ input.key }}', 'local.items[0]', 'local.items.0',
  'local.map[input.key]', 'local.map["fixed"]', 'local.__proto__.polluted', 'result.constructor.prototype.x',
  false, 42, {}, []]) {
  assert.equal(contract.validate(value).valid, false, JSON.stringify(value));
}
assert.equal(contract.validate('').valid, true, 'Output can be omitted');
assert.equal(contract.validate('', { required: true }).valid, false);
assert.equal(contract.validate('state.value', { roots: ['state'] }).valid, true, 'environment-owned roots');
assert.equal(contract.validate('local.value', { roots: ['state'] }).valid, false);
const source = { input: { name: 'safe' }, local: {}, result: {}, trace: {} };
paths.writeScopePath(source, 'trace.probes', [], env); // trusted internal scope, not public Output
paths.compileWriteScopePath('local.named.value', env)(source, 7);
assert.equal(source.local.named.value, 7);
for (const value of ['local', 'local..x', 'local.__proto__.polluted', 'local.constructor.prototype.x']) {
  assert.throws(() => paths.writeScopePath(source, value, 'bad', env), { code: 'INVALID_SCOPE_PATH' });
  assert.throws(() => paths.compileWriteScopePath(value, env), { code: 'INVALID_SCOPE_PATH' });
}
source.local.list = [];
source.local.scalar = 1;
for (const value of ['local.list.value', 'local.scalar.value']) {
  assert.throws(() => paths.writeScopePath(source, value, 1, env), { code: 'INVALID_SCOPE_PATH' });
}
assert.equal({}.polluted, undefined);
assert.equal(source.input.name, 'safe');
const descriptor = { props: { target: { kind: 'path', mode: 'write' }, out: { kind: 'value' } } };
const entries = contract.entries(descriptor, { target: 'input.bad', out: 'business data' }, 'result.ok', 2);
assert.equal(JSON.stringify(entries), JSON.stringify([{ property: '$$out', value: 'result.ok' }, { property: 'target', value: 'input.bad' }]));
console.log('destination contract: static paths, read-only roots, internal scopes and safe object writes OK');
