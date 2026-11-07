// Application errors (an author's throw, a missing required input, a library's applicative refusal, a child's application
// error) answer 200 with the error envelope; internal failures answer 500. The envelope holds no internal data.
var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils,Files=java.nio.file.Files;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var EngineClass=Packages.com.twinsoft.convertigo.engine.Engine,Context=Packages.com.twinsoft.convertigo.engine.Context;
EngineClass.logEngine=EngineClass.logContext=Packages.org.apache.log4j.Logger.getLogger('offline-n72-applicative');
EngineClass.theApp=new EngineClass();
var invocation=new Context('offline-n72-applicative'),callerContext=new Context('offline-n72-caller');
EngineClass.theApp=null;
var requester=new Packages.com.twinsoft.convertigo.engine.requesters.JsonServletRequester();requester.context=invocation;
var caller=new Packages.com.twinsoft.convertigo.engine.requesters.JsonServletRequester();caller.context=callerContext;
var flow=new Packages.com.twinsoft.convertigo.beans.flow.Flow();flow.setName('Orders');invocation.requestedObject=flow;
// A running requester: blocks run (the cancellation check reads Sequence.isRunning).
flow.context=invocation;invocation.project=new Packages.com.twinsoft.convertigo.beans.core.Project();flow.runningThread=new Packages.com.twinsoft.convertigo.beans.core.RequestableObject$RequestableThread(flow);flow.runningThread.bContinue=true;
var attributes=new java.util.HashMap();
var iface=java.lang.Class.forName('jakarta.servlet.http.HttpServletRequest');
var http=java.lang.reflect.Proxy.newProxyInstance(iface.getClassLoader(),[iface],new java.lang.reflect.InvocationHandler({invoke:function(proxy,method,args){
 var name=String(method.getName());if(name==='getAttribute')return attributes.get(String(args[0]));if(name==='setAttribute'){attributes.put(String(args[0]),args[1]);return null;}if(name==='toString')return 'OfflineHttpRequest';return null;
}}));invocation.httpServletRequest=http;
var project=Files.createTempDirectory('flow-n72-applicative-').toFile();
function write(path,source){IO.writeStringToFile(new File(project,path),source,'UTF-8');}
// A library block refusing access: an application error through ctx.throwFlow(error, node, {applicative: true}).
write('_flow/blocks/probe/deny.block.js','const _meta={runtime:"rhino",private:true,properties:{mode:{type:"string"}},outputs:{out:{type:"object"}}};\n'+
 '(function(){return {run:function(ctx,node){var mode=ctx.props(node).mode;'+
 'if(mode==="applicative")ctx.throwFlow({code:"ENTITY_FORBIDDEN",message:"Not allowed."},node,{applicative:true});'+
 'if(mode==="applicative403")ctx.throwFlow({code:"ENTITY_FORBIDDEN",message:"Not allowed.",status:403},node,{applicative:true});'+
 'ctx.throwFlow({code:"PROBE_BROKEN",message:"Broken."},node);'+
 '}};}())');
write('_flow/flows/RefusingChild.flow.js','function RefusingChild({input,config,result}){\n throw { code: "CHILD_REFUSED", message: "Refused by the child" }\n}');
write('_flow/flows/BrokenChild.flow.js','function BrokenChild({input,config,result}){\n result.value = json.parse({ text: "{" })\n}');
var context=invocation,__flowProjectDir=String(project);
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
var RequestAttribute=Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute;
var SECRET='s3cr3t-Value-42';
function run(source,input,nested){
 attributes.clear();attributes.put('convertigo.requester',nested?caller:requester);
 var text=String(engine.run(JSON.stringify({flowQName:String(flow.getQName()),flowName:'Orders',includeTrace:false,input:input||{},flowSource:source})));
 var statuses=[],map=RequestAttribute.responseStatus.get(http);if(map)map.keySet().forEach(function(code){statuses.push(Number(code));});
 return {text:text,out:JSON.parse(text),statuses:statuses};
}
function body(text){return 'function Orders({input, result}) {\n'+text+'\n}';}
function check(value,message,r){if(!value)throw Error(message+(r?': '+r.text+' statuses='+JSON.stringify(r.statuses):''));}
// No internal data in an envelope: no marker, no stack, no input value.
function clean(r,label){check(!/applicat|__flow|stack|\tat |\.java:/i.test(r.text)&&r.text.indexOf(SECRET)<0,label+': internal data in the envelope',r);}
var failures=[];
function point(name,steps){try{steps();print('ok   '+name);}catch(e){failures.push(name);print('FAIL '+name+': '+String(e.message||e).slice(0,300));}}
try{
 // 1. A missing required input: 200 with the FLOW_INPUT_REQUIRED envelope, as DBO answers its EngineException.
 point('1 FLOW_INPUT_REQUIRED',function(){
  var r=run('const _flow = { sourceVersion: 2, inputs: { id: { type: "string", required: true }, password: { type: "string" } } }\n\n'+body(' result.id = input.id'),{password:SECRET});
  check(r.out.ok===false&&r.out.error.code==='FLOW_INPUT_REQUIRED'&&r.out.error.status===undefined&&r.statuses.length===0,'a missing required input answers 200 with the envelope',r);
  check(r.out.error.details&&r.out.error.details.input==='id'&&/throw \{ code, message \}/.test(r.out.error.hint)&&!/status: 400/.test(r.out.error.hint),'the hint advises throw { code, message } without a habitual status',r);
  clean(r,'missing input');
 });
 // 2. A child's application error makes its caller answer 200, unless caught; its internal failure stays 500.
 point('2 child errors',function(){
  var r=run(body(' flow.call({ flow: "RefusingChild" })'));
  check(r.out.error.code==='CHILD_REFUSED'&&r.statuses.length===0,'flow.call: a child application error answers 200',r);clean(r,'flow.call');
  r=run(body(' flow.call({ flow: "BrokenChild" })'));
  check(r.out.ok===false&&JSON.stringify(r.statuses)==='[500]','flow.call: a child internal failure answers 500',r);
  r=run(body(' try({$$try(){ flow.call({ flow: "RefusingChild" }) }, $$catch(){ result.caught = local.error.code }})'));
  check(r.out.ok===true&&r.out.result.caught==='CHILD_REFUSED'&&r.statuses.length===0,'a caught child error is the caller result',r);
  // A run called through another requester (requestable.call of a regular Flow) answers its caller: an internal
  // failure says 500 in its envelope, an application error says no status, so the caller tells them apart.
  r=run(body(' result.value = json.parse({ text: "{" })'),{},true);
  check(r.out.ok===false&&r.out.error.status===500&&r.statuses.length===0,'a called run tells its caller its internal failure',r);clean(r,'called internal');
  r=run(body(' throw { code: "CHILD_REFUSED", message: "Refused" }'),{},true);
  check(r.out.ok===false&&r.out.error.status===undefined&&r.statuses.length===0,'a called run tells its caller its application error',r);clean(r,'called applicative');
  r=run('const _flow = { sourceVersion: 2, inputs: { id: { type: "string", required: true } } }\n\n'+body(' result.id = input.id'),{},true);
  check(r.out.error.code==='FLOW_INPUT_REQUIRED'&&r.out.error.status===undefined,'a called run missing a required input is an application error',r);
 });
 // 3. The applicative API of libraries: ctx.throwFlow(error, node, {applicative: true}).
 point('3 applicative API',function(){
  var r=run(body(' probe.deny({ mode: "applicative" })'),{password:SECRET});
  check(r.out.ok===false&&r.out.error.code==='ENTITY_FORBIDDEN'&&r.statuses.length===0,'an applicative library error answers 200 with the envelope',r);clean(r,'applicative');
  r=run(body(' probe.deny({ mode: "applicative403" })'));
  check(r.out.error.code==='ENTITY_FORBIDDEN'&&JSON.stringify(r.statuses)==='[403]','an explicit status stays',r);clean(r,'applicative 403');
  r=run(body(' probe.deny({ mode: "internal" })'));
  check(r.out.error.code==='PROBE_BROKEN'&&JSON.stringify(r.statuses)==='[500]','a library error without the option stays internal (500)',r);clean(r,'internal');
 });
 // 4. Every envelope the requester renders holds details, empty text by default, as the error step of a sequence (the SDK
 // reads an error by its code, message and details).
 point('4 details',function(){
  var r=run(body(' throw { code: "ORDER_NOT_FOUND", message: "No order" }'));
  check(r.out.ok===false&&r.out.error.details===''&&r.statuses.length===0,'a throw without details answers details ""',r);
  r=run(body(' throw { code: "ORDER_NOT_FOUND", message: "No order", details: { id: 42 } }'));
  check(r.out.error.details&&r.out.error.details.id===42,'given details stay',r);
  r=run(body(' result.value = json.parse({ text: "{" })'));
  check(r.out.ok===false&&r.out.error.details===''&&JSON.stringify(r.statuses)==='[500]','an internal failure answers details "" too',r);
 });
 // 5. A value of the wrong type is an application error that never repeats the value received.
 point('5 input type',function(){
  var source='const _flow = { sourceVersion: 2, inputs: { amount: { type: "integer" }, numbers: { type: "array", items: { type: "number" } } } }\n\n'+body(' result.amount = input.amount');
  var r=run(source,{amount:SECRET});
  check(r.out.ok===false&&r.out.error.code==='FLOW_INPUT_TYPE_INVALID'&&r.out.error.status===undefined&&r.statuses.length===0,'a wrong type answers 200 with the envelope',r);
  check(/amount/.test(r.out.error.message)&&/integer/.test(r.out.error.message)&&r.out.error.details&&r.out.error.details.input==='amount','the message names the field and its type',r);
  clean(r,'wrong type');
  r=run(source,{numbers:'[1, "'+SECRET+'"]'});
  check(r.out.ok===false&&r.out.error.code==='FLOW_INPUT_TYPE_INVALID'&&r.statuses.length===0,'a wrong item type answers 200 with the envelope',r);
  clean(r,'wrong item type');
 });
 if(failures.length)throw Error('failed points: '+failures.join(', '));
 print('n72-applicative-errors OK');
}finally{IO.deleteDirectory(project);}
