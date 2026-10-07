// json.push on a typed array, and json.put on a typed map, check the added item or entry only: the collection in place
// is already valid. Checking the whole collection at each push made a loop quadratic (8,000 pushes took more than a
// minute).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = name => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../_flow/modules', name + '.js'), 'utf8'));
const contract = load('typed-scope-contract'), realSchemas = load('schema-contract'), destinations = load('destination-contract'), scope = load('scope-path-utils');

let checkedItems = 0;
const schemas = Object.assign({}, realSchemas, {
	validate(schema, value) {
		checkedItems += Array.isArray(value) ? value.length : value && typeof value === 'object' ? Math.max(1, Object.keys(value).length) : 1;
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

// declared map: linear checks, same map observed, refused entries left out
{
	const { api, read } = setup();
	api.declare('local.counts', { type: 'object', additionalProperties: { type: 'integer' } }, {});
	const alias = read('local.counts');
	checkedItems = 0; preflighted = 0;
	for (let i = 0; i < 1000; i++) api.put('local.counts', 'k' + i, i);
	assert.equal(read('local.counts'), alias, 'the map in place keeps its aliases');
	assert.equal(Object.keys(alias).length, 1000);
	assert.ok(checkedItems <= 3000, 'entries checked at most a few times each, not the whole map at each put: ' + checkedItems);
	assert.ok(preflighted <= 1000, 'the result preflight sees the added entry only: ' + preflighted);
	assert.throws(() => api.put('local.counts', 'bad', 'text'), { code: 'VALUE_TYPE_MISMATCH' });
	assert.equal(Object.prototype.hasOwnProperty.call(alias, 'bad'), false, 'a refused entry does not join the map');
}

// closed object: an undeclared key is refused, a declared one checked against its own type
{
	const { api, read } = setup();
	api.declare('local.person', { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer' } }, additionalProperties: false }, {});
	api.put('local.person', 'name', 'Ada');
	assert.throws(() => api.put('local.person', 'age', 'old'), { code: 'VALUE_TYPE_MISMATCH' });
	assert.throws(() => api.put('local.person', 'nickname', 'A'), { code: 'VALUE_TYPE_MISMATCH' });
	assert.equal(JSON.stringify(read('local.person')), '{"name":"Ada"}');
}

// a map declared inside its parent object
{
	const { api, read } = setup();
	api.declare('local.box', { type: 'object', properties: { map: { type: 'object', additionalProperties: { type: 'string' } } } }, { map: {} });
	checkedItems = 0;
	for (let i = 0; i < 500; i++) api.put('local.box.map', 'k' + i, 'v' + i);
	assert.equal(Object.keys(read('local.box.map')).length, 500);
	assert.ok(checkedItems <= 1500, 'linear too under a declared parent: ' + checkedItems);
	assert.throws(() => api.put('local.box.map', 'n', 1), { code: 'VALUE_TYPE_MISMATCH' });
}

console.log('typed-collection-append-linear: item and entry checks, aliases, refusals and parents OK');
