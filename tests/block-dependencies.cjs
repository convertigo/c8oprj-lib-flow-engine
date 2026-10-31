const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=vm.runInNewContext(fs.readFileSync('_flow/modules/block-dependencies.js','utf8'));
const catalog=block=>block,raise=(code,message,node,hint)=>{throw Object.assign(new Error(message),{code,hint,line:node.line});};
test('declared native dependencies are checked transitively at the caller line before execution',()=>{
 const ctx={blocks:{'sql.query':{requiresBlocks:{'sql.nativePlan':'lib_flow_sql'}},'sql.nativePlan':{requiresBlocks:{'data.scalarCheck':'lib_flow_crud_data'}}}};
 assert.throws(()=>policy.check(ctx,'sql.query',{line:7},catalog,raise),e=>{assert.equal(e.code,'BLOCK_DEPENDENCY_MISSING');assert.equal(e.line,7);assert.match(e.message,/sql.query -> sql.nativePlan -> data.scalarCheck/);assert.match(e.hint,/lib_flow_crud_data/);return true;});
 ctx.blocks['data.scalarCheck']={};assert.doesNotThrow(()=>policy.check(ctx,'sql.query',{line:7},catalog,raise));
});
test('cycles are bounded and checks are cached only in the current analysis context',()=>{
 const ctx={blocks:{a:{requiresBlocks:['b']},b:{requiresBlocks:['a']}}};let reads=0;
 const read=block=>{reads++;return block;};policy.check(ctx,'a',{},read,raise);policy.check(ctx,'a',{},read,raise);assert.equal(reads,2);
 assert.throws(()=>policy.check({blocks:{a:{requiresBlocks:['missing']}}},'a',{},read,raise),/unavailable block/);
 assert.throws(()=>policy.check({blocks:{a:{requiresBlocks:['toString']}}},'a',{},read,raise),/unavailable block/);
});
