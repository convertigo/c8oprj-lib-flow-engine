const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const load = p => vm.runInNewContext(fs.readFileSync(p, 'utf8'));
const naming = load('_flow/modules/naming-utils.js'), store = load('_flow/modules/schema-store-service.js');
const root = fs.mkdtempSync(path.resolve('.audit-schema-'));
class File {
  constructor(parent, child) { this.path = path.resolve(String(parent), child || ''); }
  toString() { return this.path; }
  getAbsolutePath() { return this.path; }
  getCanonicalFile() { return new File(fs.existsSync(this.path) ? fs.realpathSync(this.path) : this.path); }
  toPath() { return { startsWith: other => this.path === other.path || this.path.startsWith(other.path + path.sep), path: this.path }; }
  isDirectory() { return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory(); }
}
const schemas = path.join(root, '_flow/schemas');
fs.mkdirSync(path.join(schemas, 'Good'), {recursive:true});
fs.writeFileSync(path.join(root, '_flow/keep.js'), 'keep');
const env = {File, flowNameFor: naming.flowNameFor, loadBlocks:()=>({}), parseSource:()=>({}), sourceForFlowRequest:()=>'', projectSchemasDir:()=>new File(schemas), FileUtils:{deleteDirectory:f=>fs.rmSync(String(f),{recursive:true})}, raise:code=>{throw Error(code);}};
try {
  for (const flowName of ['.', '..']) assert.throws(()=>store.reset({flowName},env), /FLOW_SCHEMA_(FLOW_REQUIRED|PATH_INVALID)/);
  fs.symlinkSync(path.join(root, '_flow'), path.join(schemas, 'Linked'));
  assert.throws(()=>store.reset({flowName:'Linked'},env), /FLOW_SCHEMA_PATH_INVALID/);
  assert.equal(store.reset({flowName:'Good'},env).deleted,true);
  assert.equal(fs.readFileSync(path.join(root,'_flow/keep.js'),'utf8'),'keep');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
console.log('audit-schema-paths OK');
