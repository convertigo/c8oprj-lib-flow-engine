const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// A connector transaction that never ran has no output schema: the error must say
// how to proceed (run it once, schemas only serve page bindings), not just fail.
let source = fs.readFileSync(path.join(__dirname, '../_flow/modules/requestable-service.js'), 'utf8');
source = source
  .replace('function resolveTarget(request, targetText, env) {',
    'function resolveTarget(request, targetText, env) { return { kind: "transaction", project: "P", connector: "db", requestable: "PostTicket" };')
  .replace('function outputSchema(target, env, options) {', 'function outputSchema(target, env, options) { return null;');
const service = vm.runInNewContext(source, { Packages: {} });
const env = {
  currentProjectName: () => 'P',
  flowCodeError: (code, message, hint) => ({ code, message, hint })
};
const result = service.schema({ requestable: '.db.PostTicket' }, env);
assert.equal(result.ok, false);
assert.equal(result.error.code, 'REQUESTABLE_SCHEMA_UNAVAILABLE');
assert.match(result.error.hint, /requestable-execute|requestable\.call/, 'the hint names how to see the output of a transaction');
assert.match(result.error.hint, /binding|page/i, 'the hint says what the schema is for');
console.log('requestable schema unavailable hint tests passed');
