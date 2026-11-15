const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const runtime=vm.runInNewContext(fs.readFileSync('_flow/modules/flow-runtime-service.js','utf8'));
let who={kind:'application'},effects=0,invocation={httpServletRequest:{}};
const env={runtimeHandles:{assertSerializable(){},closeAll(){}},File:function(p,c){this.path=String(p)+(c?'/'+c:'');},canonicalPath:f=>f.path,engineDir:()=>'/engine',projectDir:()=>'/project',currentProjectName:()=>'',currentConvertigoContext:()=>invocation,requestPrincipal:()=>who,raise:code=>{throw Error(code);},withProjectDir:(_,f)=>f(),loadBlocks:()=>({}),blockCode:{set(){effects++;return 'set';},check(){effects++;return 'check';}},resources:{patch(){effects++;},remove(){effects++;}},setFlowSource(){effects++;}};
function frame(request={}){return runtime.createRunContext(request,{}, {}, {},env);}
const operations=[c=>c.blockCodeSet('demo',{dry:true,code:'untrusted'}),c=>c.blockCodeCheck({code:'untrusted'}),c=>c.resourcePatch({path:'_flow/engine.yaml',dry:true}),c=>c.resourceDelete({path:'_flow/engine.yaml'}),c=>c.flowSet('demo','source')];
for(const operation of operations)assert.throws(()=>operation(frame()),/AUTHORING_FORBIDDEN/);
assert.equal(effects,0,'refuse before evaluation or mutation');
who={kind:'mcp',scope:'forms:write'};
assert.throws(()=>frame().blockCodeSet('demo',{dry:true}),/AUTHORING_FORBIDDEN/);
who={kind:'mcp',scope:'mcp:full'};
assert.equal(frame().blockCodeSet('demo',{dry:true}),'set');
const root=frame();root.requestPrincipal=()=>({kind:'application'});
assert.throws(()=>frame({__parentRun:root}).blockCodeSet('demo',{dry:true}),/AUTHORING_FORBIDDEN/);
const context=invocation;invocation=null;
assert.throws(()=>frame({__directInvocation:true}).blockCodeSet('demo',{dry:true}),/AUTHORING_FORBIDDEN/);invocation=context;
for(const kind of ['studio','admin','internal']){who={kind};assert.equal(frame().blockCodeSet('demo',{dry:true}),'set');}
console.log('audit-authoring OK');
