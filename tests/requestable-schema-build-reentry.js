const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// A legacy requestable read while Convertigo builds the XML schema of its own
// project must not ask the SchemaManager for that schema again: the build holds
// the project's schema lock and waits for the worker thread doing the read.
const legacy = {
  getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.sequences.GenericSequence' }),
  getProject: () => ({ getName: () => 'Project', getDirPath: () => '/project' }),
  getConnector: () => ({ getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.connectors.HttpConnector' }) }),
  getName: () => 'legacy', getXsdTypePrefix: () => ''
};
function load(frames, schemaManager) {
  function Throwable() {}
  Throwable.prototype.getStackTrace = () => frames.map(name => ({ getClassName: () => name }));
  return vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../_flow/modules/requestable-service.js'), 'utf8'), {
    Packages: {
      java: { lang: { Throwable } },
      com: { twinsoft: { convertigo: { engine: { Engine: { theApp: {
        databaseObjectsManager: { getDatabaseObjectByQName: () => legacy },
        schemaManager
      } } } } } }
    }
  });
}
const env = { projectDir: () => null, File: function () {} };
const target = { project: 'Project', requestable: 'legacy' };

let calls = 0;
const counting = { getSchemaForProject: () => { calls++; throw new Error('no schema in this test'); } };

const building = load(['com.twinsoft.convertigo.engine.XmlSchemaBuilder$3',
  'com.twinsoft.convertigo.engine.XmlSchemaBuilderExecutor$1'], counting);
assert.equal(building.outputSchema(target, env), null);
assert.equal(building.outputSchema(target, env, { buildProjectSchema: true }), null);
assert.equal(calls, 0, 'a schema build must not re-enter the SchemaManager for its project');

const request = load(['com.twinsoft.convertigo.engine.requesters.GenericRequester'], counting);
request.outputSchema(target, env);
assert.equal(calls, 0, 'automatic analysis must not trigger a whole-project schema build');
request.outputSchema(target, env, { buildProjectSchema: true });
assert.equal(calls, 1, 'an explicit requestable schema inspection can still build the project schema');

console.log('requestable schema build reentry tests passed');
