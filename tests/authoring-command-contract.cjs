const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const contract=vm.runInNewContext(fs.readFileSync('_flow/modules/authoring-command-contract.js','utf8'));
const validate=request=>contract.validate(request,(code,message,node,hint)=>{throw Object.assign(new Error(message),{code,hint});});
test('invalid mutation forms name the required arguments before attempting Flow lookup',()=>{
 for(const request of [{},{mutation:{}},{mutations:[]},{mutations:{}},{action:{}},{mutation:{op:'insert',path:'frontends.svelte.routes'}},{mutation:{op:'insert'},mutations:[]}])
  assert.throws(()=>validate(request),error=>{assert.match(error.code,/^AUTHORING_/);assert.match(error.hint,/items\[\]\.apply\.arguments/);assert.doesNotMatch(error.message,/undefined/);return true;});
});
test('palette actions, source edits, engine config and named Flow edits keep their distinct contracts',()=>{
 for(const request of [{action:{id:'page',targetPath:'frontends.svelte.routes'}},{sourceFile:'page.flow.svelte',mutation:{op:'replace'}},
  {name:'A bad Flow name',mutation:{op:'replace'}},{mutation:{value:{__engineMutationPath:'config.demo'}}},
  {mutation:{__engineMutationPath:'config.demo'}},{action:{id:'statement',targetPath:''}},{transfer:{value:{}}}]) assert.doesNotThrow(()=>validate(request));
});
