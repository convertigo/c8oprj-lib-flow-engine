// json.push on a typed array checks the appended item only: the array in place is already valid. Checking the whole
// array at each push made a loop quadratic (8,000 pushes took more than a minute).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = name => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../_flow/modules', name + '.js'), 'utf8'));
const contract = load('typed-scope-contract'), realSchemas = load('schema-contract'), destinations = load('destination-contract'), scope = load('scope-path-utils');

let checkedItems = 0;
const schemas = Object.assign({}, realSchemas, {
	validate(schema, value) {
		checkedItems += Array.isArray(value) ? value.length : 1;
		return realSchemas.validate(schema, value);
	}
});
let preflighted = 0;
function setup() {
	const scopes = { local: {}, result: {}, input: {} };
	const env = { scopeNames: ['local', 'result', 'input'], destinationContract: destinations, assertNoRuntimeHandle: () => {}, raise: (code, message) => { const e = new Error(message); e.code = code; throw e; } };
	const read = p => scope.readScopePath(scopes, p, env), write = (p, v) => scope.writeScopePath(scopes, p, v, env);
	const api = contract.create({ schemas, destinations, scopes: () => scopes, read, write, raise: env.raise,
		preflight: (p, value) => { preflighted += Array.isArray(value) ? value.length : 1; } });
	return { api, read, write };
}
const item = { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] };

// declared array: linear checks, same array observed
{
	const { api, read } = setup();
	api.declare('local.items', { type: 'array', items: item }, []);
	const alias = read('local.items');
	checkedItems = 0; preflighted = 0;
	for (let i = 0; i < 1000; i++) api.append('local.items', { id: i });
	assert.equal(read('local.items'), alias, 'the array in place keeps its aliases');
	assert.equal(alias.length, 1000);
	assert.ok(checkedItems <= 3000, 'items checked at most a few times each, not the whole array at each push: ' + checkedItems);
	assert.ok(preflighted <= 1000, 'the result preflight sees the appended item only: ' + preflighted);
	assert.throws(() => api.append('local.items', { id: 'bad' }), { code: 'VALUE_TYPE_MISMATCH' });
	assert.equal(alias.length, 1000, 'a refused item does not join the array');
}

// array declared inside its parent object
{
	const { api, read } = setup();
	api.declare('local.box', { type: 'object', properties: { items: { type: 'array', items: item } } }, { items: [] });
	checkedItems = 0;
	for (let i = 0; i < 1000; i++) api.append('local.box.items', { id: i });
	assert.equal(read('local.box.items').length, 1000);
	assert.ok(checkedItems <= 3000, 'linear too under a declared parent: ' + checkedItems);
	assert.throws(() => api.append('local.box.items', { name: 'no id' }), { code: 'VALUE_TYPE_MISMATCH' });
	assert.equal(read('local.box.items').length, 1000);
}

// the first item creates the array, written and checked whole
{
	const { api, read } = setup();
	api.append('local.fresh', 1);
	api.append('local.fresh', 2);
	assert.equal(JSON.stringify(read('local.fresh')), '[1,2]');
}

console.log('typed-collection-append-linear: item-only checks, aliases, refusals and parents OK');
