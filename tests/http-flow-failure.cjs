const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=vm.runInNewContext(fs.readFileSync('_flow/modules/http-flow-failure.js','utf8'));
function fixture(){const statuses=[];const invocation={requestedObject:{getQName:()=> 'App.Read'},setResponseStatus:status=>statuses.push(status)};
 invocation.httpServletRequest={getAttribute:()=>({context:invocation})};return{invocation,statuses};}
// The error an author's throw block raises, through the engine's ctx.throwFlow (Engine.js throwFlowError).
const throwSource=fs.readFileSync('_flow/blocks/throw.block.js','utf8');
const throwBlock=vm.runInNewContext(throwSource.slice(throwSource.indexOf('(function () {')));
function authorThrow(props){
 const ctx={props:()=>props,template:value=>value,expr:value=>value,
  throwFlow(options){const error=new Error(options.message);Object.assign(error,{code:options.code,status:options.status,details:options.details});throw error;}};
 try{throwBlock.run(ctx,{});}catch(error){return error;}
 assert.fail('the throw block must raise');
}
function envelope(error){const out={code:error.code,message:error.message};if(error.status!==undefined)out.status=Number(error.status);return out;}
test('an author throw without status keeps 200 with the error envelope; an explicit status stays',()=>{
 const f=fixture(),thrown=authorThrow({code:'ORDER_NOT_FOUND',message:'No order 42'}),error=envelope(thrown);
 policy.apply({flowQName:'App.Read'},{ok:false,error},f.invocation,thrown);assert.deepEqual(f.statuses,[]);
 assert.deepEqual(Object.keys(thrown).filter(key=>/application/i.test(key)),[],'the marker is not enumerable');
 assert.equal(JSON.stringify(error).indexOf('pplication'),-1,'the envelope holds no marker');
 const explicit=authorThrow({code:'BAD_INPUT',message:'x',status:400});
 policy.apply({flowQName:'App.Read'},{ok:false,error:envelope(explicit)},f.invocation,explicit);assert.deepEqual(f.statuses,[400]);
});
test('internal failures use their error status or 500, preserving the JSON diagnostic',()=>{
 const f=fixture(),error={code:'UNKNOWN_BLOCK',message:'Unknown Flow block: data.scalarCheck'};
 policy.apply({flowQName:'App.Read'},{ok:false,error},f.invocation);assert.deepEqual(f.statuses,[500]);assert.equal(error.code,'UNKNOWN_BLOCK');
 const runtime=new SyntaxError('Unterminated object literal');
 policy.apply({flowQName:'App.Read'},{ok:false,error:{code:'FLOW_ENGINE_ERROR',message:runtime.message}},f.invocation,runtime);assert.deepEqual(f.statuses,[500,500]);
 const engine=Object.assign(new Error('The called Flow failed.'),{code:'FLOW_REQUESTABLE_FAILED'});
 policy.apply({flowQName:'App.Read'},{ok:false,error:{code:engine.code,message:engine.message}},f.invocation,engine);assert.deepEqual(f.statuses,[500,500,500]);
 policy.apply({flowQName:'App.Read'},{ok:false,error:{status:400}},f.invocation);assert.deepEqual(f.statuses,[500,500,500,400]);
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
