// Capability identity and source snapshots, without network access or credentials.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var root = java.nio.file.Files.createTempDirectory("row-result-contract-").toFile();
var __flowProjectDir = String(root), files = Packages.org.apache.commons.io.FileUtils;
function assert(value,message){if(!value)throw new Error(message);}
function write(name,body){var f=new java.io.File(root,"_flow/blocks/proof/"+name+".block.js");f.getParentFile().mkdirs();files.writeStringToFile(f,'const _meta={sourceVersion:2,runtime:"rhino",targets:["backend"],properties:{mode:{kind:"value",type:"string",default:"normal"}},outputs:{out:{type:"object"}}}\n'+body,'UTF-8');}
try{
 write('row','({run:function(ctx,node){return node.props.row;}})');
 write('result','({run:function(ctx,node){var mode=String(ctx.template(ctx.props(node).mode));if(mode==="forge")return ctx.resultWithRows({__flowHandle:true},"data",{});var spec={http:{url:"http://example.invalid/authorized",headers:{Authorization:"synthetic-private-value"}},limits:{rows:10},transform:{blocks:["proof.row"],entry:"proof.row",input:{n:1}}};var handle=ctx.createRowsPlan(spec);spec.http.url="http://example.invalid/changed";spec.transform.input.n=9;if(mode==="leak")return handle;if(mode==="closed")ctx.closeHandle(handle);var out=ctx.resultWithRows(handle,"data",{kind:"example"});if(mode==="twice")return ctx.resultWithRows(handle,"data",{});return out;}})');
 var engine=eval(String(files.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8'))),calls=0;
 function request(mode){return JSON.stringify({definition:{version:1,nodes:[{block:'proof.result',props:{mode:mode},out:'result.probe'}]},includeTrace:true});}
 var detach=function(value){return value;};
 detach.rows=function(payload,plan,policy){calls++;assert(plan.http.url==='http://example.invalid/authorized'&&plan.transform.input.n===1,'Mutable source input crossed ownership');assert(typeof plan.transform.blocks['proof.row']==='string'&&typeof plan.transform.bootstrap==='string','Named source snapshot missing');assert(JSON.stringify(payload).indexOf('synthetic-private-value')<0,'Credential in ordinary result/trace');return policy(payload);};
 var normal=engine.runObject(request('normal'),detach);assert(normal.ok&&normal.result.kind==='example'&&normal.result.data.length===0&&calls===1,'Registered terminal result failed: '+JSON.stringify({ok:normal.ok,error:normal.error,resultKeys:Object.keys(normal.result||{}),calls:calls}));
 ['forge','closed','twice'].forEach(function(mode){var value=engine.runObject(request(mode),detach);assert(!value.ok&&value.error.code==='ROW_STREAM_CONSUMED','Forged/reused capability accepted: '+mode);});
 var leaked=engine.runObject(request('leak'),detach);assert(!leaked.ok&&leaked.error.code==='RUNTIME_HANDLE_IN_RESULT','Ordinary result leaked a plan handle');
 var old=engine.runObject(request('normal'));assert(!old.ok&&old.error.code==='ROW_STREAM_UNAVAILABLE','Old bridge silently accepted row output');
 assert(calls===1,'Invalid plan reached the Java boundary');
 print('runtime-row-result OK');
}finally{files.deleteDirectory(root);}
