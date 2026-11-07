// response.error, response.status and response.header: rare explicit choices, on the response of the Flow requested over HTTP.
var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils,Files=java.nio.file.Files;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var EngineClass=Packages.com.twinsoft.convertigo.engine.Engine;
EngineClass.logEngine=EngineClass.logContext=Packages.org.apache.log4j.Logger.getLogger('offline-response-blocks');
EngineClass.theApp=new EngineClass();
var invocation=new Packages.com.twinsoft.convertigo.engine.Context('offline-response-blocks');
EngineClass.theApp=null;
var requester=new Packages.com.twinsoft.convertigo.engine.requesters.JsonServletRequester();requester.context=invocation;
var flow=new Packages.com.twinsoft.convertigo.beans.flow.Flow();flow.setName('Orders');invocation.requestedObject=flow;
// A running requester: blocks run (the cancellation check reads Sequence.isRunning).
flow.context=invocation;invocation.project=new Packages.com.twinsoft.convertigo.beans.core.Project();flow.runningThread=new Packages.com.twinsoft.convertigo.beans.core.RequestableObject$RequestableThread(flow);flow.runningThread.bContinue=true;
var attributes=new java.util.HashMap();attributes.put('convertigo.requester',requester);
var iface=java.lang.Class.forName('jakarta.servlet.http.HttpServletRequest');
var http=java.lang.reflect.Proxy.newProxyInstance(iface.getClassLoader(),[iface],new java.lang.reflect.InvocationHandler({invoke:function(proxy,method,args){
 var name=String(method.getName());if(name==='getAttribute')return attributes.get(String(args[0]));if(name==='setAttribute'){attributes.put(String(args[0]),args[1]);return null;}if(name==='toString')return 'OfflineHttpRequest';return null;
}}));invocation.httpServletRequest=http;
var project=Files.createTempDirectory('flow-response-blocks-').toFile();
function write(path,source){IO.writeStringToFile(new File(project,path),source,'UTF-8');}
// A child Flow sets the status and a header of its own response: never those of its caller.
write('_flow/flows/Child.flow.js','function Child({input,config,result}){\n response.status({ code: 418 })\n response.header({ name: "X-Child", value: "yes" })\n result.child = true\n}');
write('_flow/flows/ErrorChild.flow.js','function ErrorChild({input,config,result}){\n response.error({ code: "CHILD_REFUSED", message: "No" })\n result.ignored = true\n}');
var context=invocation,__flowProjectDir=String(project);
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
var RequestAttribute=Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute;
function keys(map){var out=[];if(map)map.keySet().forEach(function(key){out.push(String(key));});return out.sort();}
function run(body,qname){
 attributes.remove(String(RequestAttribute.responseStatus.value()));attributes.remove(String(RequestAttribute.responseHeader.value()));
 var text=String(engine.run(JSON.stringify({flowQName:qname||String(flow.getQName()),flowName:'Orders',includeTrace:false,
  flowSource:'function Orders({input, result}) {\n'+body+'\n}'})));
 var headers=RequestAttribute.responseHeader.get(http);
 return {text:text,out:JSON.parse(text),statuses:keys(RequestAttribute.responseStatus.get(http)).map(Number),headers:keys(headers),header:function(name){return headers?String(headers.get(name)):null;}};
}
function check(value,message,r){if(!value)throw Error(message+(r?': '+r.text+' statuses='+JSON.stringify(r.statuses)+' headers='+JSON.stringify(r.headers):''));}
try{
 // (a) response.error: the envelope replaces the result, the Flow goes on, no status.
 var r=run(' local.n = 1\n response.error({ code: "OUT_OF_STOCK", message: "No stock", details: { left: local.n } })\n result.after = true\n log({ message: "still running" })');
 check(r.out.ok===true&&JSON.stringify(r.out.result)==='{"error":{"code":"OUT_OF_STOCK","message":"No stock","details":{"left":1}}}','response.error answers the envelope alone',r);
 check(r.statuses.length===0,'response.error sets no HTTP status',r);
 r=run(' response.error({ code: "FIRST", message: "1" })\n response.error({ code: "SECOND", message: "2" })\n return { kept: false }');
 check(JSON.stringify(r.out.result)==='{"error":{"code":"SECOND","message":"2"}}','a later response.error replaces the earlier one, and wins over return',r);
 r=run(' response.error({ code: "SOFT", message: "x" })\n throw { code: "HARD", message: "y" }');
 check(r.out.ok===false&&r.out.error.code==='HARD','a later throw still fails the Flow',r);
 r=run(' result.child = flow.call({ flow: "ErrorChild" })\n result.after = true');
 check(r.out.ok===true&&r.out.result.after===true&&r.out.result.child.error.code==='CHILD_REFUSED'&&r.out.result.child.ignored===undefined,
  'the response.error of a child is its result, holding an error property, for its caller',r);
 // (b) response.status and response.header: the response of the Flow requested over HTTP.
 r=run(' response.status({ code: 201 })\n response.header({ name: "X-Request-Kind", value: "created" })\n result.id = 7');
 check(r.out.ok===true&&r.out.result.id===7&&JSON.stringify(r.statuses)==='[201]'&&r.header('X-Request-Kind')==='created','status and header reach the HTTP response',r);
 r=run(' response.status({ code: 201 })\n response.status({ code: 202 })');
 check(JSON.stringify(r.statuses)==='[202]','a later status replaces the earlier one',r);
 r=run(' result.value = flow.call({ flow: "Child" })');
 check(r.out.ok===true&&r.out.result.value.child===true&&r.statuses.length===0&&r.headers.length===0,'a child Flow never changes the response of its caller',r);
 r=run(' response.status({ code: 201 })\n response.header({ name: "X-Other", value: "1" })','Other.Child');
 check(r.out.ok===true&&r.statuses.length===0&&r.headers.length===0,'a Flow that is not the requested object leaves the HTTP response unchanged',r);
 // Refusals: an invalid status, CR/LF, a protected header (whatever its case).
 [[' response.status({ code: 99 })','RESPONSE_STATUS_INVALID'],[' response.status({ code: 600 })','RESPONSE_STATUS_INVALID'],
  [' response.header({ name: "X-Split", value: "a\\r\\nSet-Cookie: s=1" })','RESPONSE_HEADER_INVALID'],
  [' response.header({ name: "X-Bad Name", value: "a" })','RESPONSE_HEADER_INVALID'],
  [' response.header({ name: "Set-Cookie", value: "s=1" })','RESPONSE_HEADER_PROTECTED'],
  [' response.header({ name: "content-length", value: "0" })','RESPONSE_HEADER_PROTECTED'],
  [' response.header({ name: "Access-Control-Allow-Origin", value: "*" })','RESPONSE_HEADER_PROTECTED'],
  [' response.header({ name: "Strict-Transport-Security", value: "max-age=0" })','RESPONSE_HEADER_PROTECTED'],
  [' response.header({ name: "X-Convertigo-Authenticated", value: "x" })','RESPONSE_HEADER_PROTECTED']].forEach(function(entry){
  var refused=run(entry[0]);
  check(refused.out.ok===false&&refused.out.error.code===entry[1],entry[0]+' must be refused with '+entry[1],refused);
  check(refused.headers.length===0,entry[0]+' must not set a header',refused);
  check(JSON.stringify(refused.statuses)==='[500]','a refusal is an internal failure (500)',refused);
 });
 print('response-blocks OK');
}finally{IO.deleteDirectory(project);}
