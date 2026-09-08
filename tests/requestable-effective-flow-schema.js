const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dbo = {
  getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.flow.Flow' }),
  getProject: () => ({ getDirPath: () => '/project' }),
  getName: () => 'sample', getFlowSource: () => 'source'
};
const service = vm.runInNewContext(fs.readFileSync(path.join(__dirname,
  '../libs/flow/modules/requestable-service.js'), 'utf8'), {
  Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: {
    databaseObjectsManager: { getDatabaseObjectByQName: () => dbo }
  } } } } } } }
});
const schema = { type: 'object', properties: { data: { type: 'string' } } };
let inspected;
const actual = service.outputSchema({ project: 'Project', requestable: 'sample' }, {
  withProjectDir: (dir, work) => work(), loadBlocks: () => ({}),
  outputSchemaRequest: request => { inspected = request; return { ok: true, schema }; }
});
assert.equal(actual, schema);
assert.equal(inspected.flowName, 'sample');
assert.equal(inspected.flowSource, 'source');
console.log('requestable effective Flow schema tests passed');
