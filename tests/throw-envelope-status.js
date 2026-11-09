var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var EngineClass=Packages.com.twinsoft.convertigo.engine.Engine;
EngineClass.logEngine=EngineClass.logContext=Packages.org.apache.log4j.Logger.getLogger('offline-throw-envelope');
EngineClass.theApp=new EngineClass();
var invocation=new Packages.com.twinsoft.convertigo.engine.Context('offline-throw-envelope');
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
var context=invocation,__flowProjectDir=String(java.nio.file.Files.createTempDirectory('flow-throw-envelope-').toFile());
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
var statusAttribute=Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute.responseStatus;
// The HTTP status the requester will answer: none set means 200 with the error envelope.
function run(body){
 attributes.remove(String(statusAttribute.value()));
 var text=String(engine.run(JSON.stringify({flowQName:String(flow.getQName()),flowName:'Orders',includeTrace:false,
  flowSource:'function Orders({input, result}) {\n'+body+'\n}'})));
 var statuses=statusAttribute.get(http),codes=[];
 if(statuses)statuses.keySet().forEach(function(code){codes.push(Number(code));});
 return {text:text,out:JSON.parse(text),statuses:codes};
}
function expect(label,body,code,statuses){
 var r=run(body);
 if(r.out.ok!==false||r.out.error.code!==code)throw Error(label+': expected error '+code+': '+r.text);
 if(JSON.stringify(r.statuses)!==JSON.stringify(statuses))throw Error(label+': expected HTTP statuses '+JSON.stringify(statuses)+', got '+JSON.stringify(r.statuses)+': '+r.text);
 // The application marker stays on the thrown error: it never reaches the envelope.
 if(/application/i.test(r.text))throw Error(label+': the internal marker leaked into the response: '+r.text);
 return r.out;
}
// An author's throw without status: 200 with the error envelope, as the SDK and the frontbuilder expect.
var failed=expect('throw without status',' throw { code: "ORDER_NOT_FOUND", message: "No order 42", details: { id: 42 } }','ORDER_NOT_FOUND',[]);
if(failed.error.message!=='No order 42'||!failed.error.details||failed.error.details.id!==42)throw Error('the envelope keeps message and details: '+JSON.stringify(failed));
expect('nested throw without status',' if (input.id == null) {\n  throw { code: "ID_REQUIRED", message: "id is required" }\n }\n result.ok = true','ID_REQUIRED',[]);
// An explicit status stays the author's choice.
expect('throw with status 400',' throw { code: "BAD_INPUT", message: "x", status: 400 }','BAD_INPUT',[400]);
expect('throw with status 503',' throw { code: "LATER", message: "x", status: 503 }','LATER',[503]);
// Internal failures stay 500: an unknown block, a runtime exception.
var unknown=expect('unknown block',' result.value = missing.block({})','FLOWSCRIPT_CANONICAL_INVALID',[500]);
if(JSON.stringify(unknown.error.details).indexOf('UNKNOWN_BLOCK')<0)throw Error('the unknown block is reported: '+JSON.stringify(unknown));
expect('runtime exception',' result.value = json.parse({ text: "{" })','FLOW_ENGINE_ERROR',[500]);
// A throw caught by try is not a failure of the Flow.
var caught=run(' try({$$try(){ throw { code: "SOFT", message: "x" } }, $$catch(){ result.code = local.error.code }})');
if(!caught.out.result||caught.out.result.code!=='SOFT')throw Error('the caught error is the thrown one: '+caught.text);
if(caught.out.ok!==true||caught.statuses.length!==0||/application/i.test(caught.text))throw Error('a caught throw answers its result: '+caught.text);
print('throw-envelope-status OK');
