const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const script = fs.readFileSync(path.join(__dirname, '../_flow/modules/requestable-service.js'), 'utf8');
const list = values => ({ iterator() { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; } });
const sequence = (name, kind) => ({ getName: () => name, getClass: () => ({ getName: () => `com.twinsoft.convertigo.beans.${kind === 'flow' ? 'flow.Flow' : 'core.Sequence'}` }) });
const project = { getSequencesList: () => list([sequence('First', 'sequence'), sequence('Second', 'flow')]),
	getConnectorsList: () => list([{ getName: () => 'Http', getTransactionsList: () => list([{ getName: () => 'Get' }]) }]) };
const snapshot = { children: [{ kind: 'sequence', name: 'First' }, { kind: 'flow', name: 'Second' },
	{ kind: 'connector', name: 'Http', children: [{ kind: 'transaction', name: 'Get' }] }] };
function service(shared) {
	const bridge = shared ? { requestableProjectCatalog(name) { assert.strictEqual(name, 'Proof'); return JSON.stringify(snapshot); } } : {};
	return vm.runInNewContext(script, { Packages: { com: { twinsoft: { convertigo: { engine: {
		flow: { FlowEngineBridge: bridge }, Engine: { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => project } } }
	} } } } } });
}
const cached = service(true), legacy = service(false);
const env = { currentProjectName: () => 'Proof' };
for (const request of [{}, { query: 'Second' }, { query: 'Http Get', limit: 1 }, { limit: 2 }, { query: 'absent' }]) {
	assert.deepStrictEqual(JSON.parse(JSON.stringify(cached.list(request, env))), JSON.parse(JSON.stringify(legacy.list(request, env))));
}
console.log('requestable shared catalogue parity passed');
