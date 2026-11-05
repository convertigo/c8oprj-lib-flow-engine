// Internal Flow calls borrow ambient handles, retain scope isolation, and close only their own handles.
var File=java.io.File,Files=java.nio.file.Files,Utils=Packages.org.apache.commons.io.FileUtils;
var engineDir=new File(String(arguments[0])).getCanonicalFile(),project=Files.createTempDirectory(engineDir.getParentFile().getParentFile().toPath(),'flow-child-handles-').toFile(),checks=0;
function assert(value,message){checks++;if(!value)throw Error(message);}
function write(path,source){Utils.writeStringToFile(new File(project,path),source,'UTF-8');}
write('_flow/blocks/probe/handles.block.js','const _meta={runtime:"rhino",private:true,properties:{operation:{type:"string"}},outputs:{out:{type:"object"}}};\n'+
'(function(){var closed=[];return {run:function(ctx,node){var op=ctx.props(node).operation;'+
'if(op==="open"){closed.length=0;var h=ctx.createHandle("probe",{count:0},{label:"parent",close:function(){closed.push("parent")}});ctx.write("request.ambient",{nested:[h]});ctx.write("request.data",{count:1});return {opened:true};}'+
'if(op==="child"){var h=ctx.read("request.ambient").nested[0];ctx.handleValue(h,"probe").count++;ctx.read("request.data").count=99;ctx.createHandle("probe",{}, {close:function(){closed.push("child")}});return {count:ctx.handleValue(h,"probe").count};}'+
'if(op==="check"){var h=ctx.read("request.ambient").nested[0];return {count:ctx.handleValue(h,"probe").count,data:ctx.read("request.data").count,closed:closed.slice()};}'+
'if(op==="forged"){ctx.handleValue(ctx.read("request.ambient"),"probe");}'+
'if(op==="closed")return {closed:closed.slice()};'+
'}};}())');
write('_flow/flows/Child.flow.js','function Child({input,config,result}){result.value=probe.handles({operation:"child"})}');
write('_flow/flows/FailingChild.flow.js','function FailingChild({input,config,result}){probe.handles({operation:"child"});throw {code:"CHILD_FAILED",status:422}}');
var __flowEngineDir=String(engineDir),__flowProjectDir=String(project),engine=eval(String(Utils.readFileToString(new File(engineDir,'Engine.js'),'UTF-8')));
function run(body,extra){return JSON.parse(String(engine.run(JSON.stringify(Object.assign({flowSource:'function Parent({input,config,result}){\n'+body+'\n}',includeTrace:false},extra||{})))));}
try{
 var r=run('probe.handles({operation:"open"})\nlocal.first=flow.call({flow:"Child"})\nlocal.second=flow.call({flow:"Child"})\nresult.state=probe.handles({operation:"check"})');
 assert(r.ok,'Nested Flow must keep live handles: '+JSON.stringify(r));
 assert(r.result.state.count===2,'Two children borrow the same parent value');
 assert(r.result.state.data===1,'Ordinary nested request data remains isolated');
 assert(JSON.stringify(r.result.state.closed)==='["child","child"]','Child cleanup closes only child-owned handles');
 var end=run('result.state=probe.handles({operation:"closed"})');assert(JSON.stringify(end.result.state.closed)==='["child","child","parent"]','Parent cleans its handle exactly once');
 r=run('probe.handles({operation:"open"})\nflow.call({flow:"FailingChild"})');assert(!r.ok&&r.error.code==='CHILD_FAILED','Child error propagates');
 end=run('result.state=probe.handles({operation:"closed"})');assert(JSON.stringify(end.result.state.closed)==='["child","parent"]','Failed child and parent clean up their own handles');
 var handles=eval(String(Utils.readFileToString(new File(engineDir,'modules/runtime-handle-utils.js'),'UTF-8')));
 var fake={__flowHandle:true,__flowHandleType:'probe',__flowHandleId:'test'};
 assert(handles.normalize({nested:[fake]},{}).nested[0].handle==='probe','Default normalization still emits only handle summaries');
 assert(handles.normalize({nested:[fake]},{},true).nested[0]===fake,'Internal context copying explicitly preserves nested handles');
 print('child-flow-runtime-handles OK ('+checks+' checks)');
}finally{Utils.deleteDirectory(project);}
