const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=vm.runInNewContext(fs.readFileSync('_flow/modules/http-flow-failure.js','utf8'));
function fixture(){const statuses=[];const invocation={requestedObject:{getQName:()=> 'App.Read'},setResponseStatus:status=>statuses.push(status)};
 invocation.httpServletRequest={getAttribute:()=>({context:invocation})};return{invocation,statuses};}
test('uncaught HTTP Flow errors use their error status or 500, preserving the JSON diagnostic',()=>{
 const f=fixture(),error={code:'UNKNOWN_BLOCK',message:'Unknown Flow block: data.scalarCheck'};
 policy.apply({flowQName:'App.Read'},{ok:false,error},f.invocation);assert.deepEqual(f.statuses,[500]);assert.equal(error.code,'UNKNOWN_BLOCK');
 policy.apply({flowQName:'App.Read'},{ok:false,error:{status:400}},f.invocation);assert.deepEqual(f.statuses,[500,400]);
});
test('nested calls, MCP tool errors, schedules and domain error values never change HTTP status',()=>{
 const f=fixture(),failed={ok:false,error:{code:'UNKNOWN_BLOCK'}};
 policy.apply({flowQName:'App.Read',__parentRun:{}},failed,f.invocation);
 policy.apply({flowQName:'Other.Child'},failed,f.invocation);
 policy.apply({flowQName:'App.Read'},{ok:true,result:{error:{code:'BUSINESS'}}},f.invocation);
 policy.apply({flowQName:'App.Read'},failed,null);
 f.invocation.httpServletRequest={getAttribute:()=>({context:{}})};
 policy.apply({flowQName:'App.Read'},failed,f.invocation);assert.deepEqual(f.statuses,[]);
});
