var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var EngineClass=Packages.com.twinsoft.convertigo.engine.Engine;
EngineClass.logEngine=EngineClass.logContext=Packages.org.apache.log4j.Logger.getLogger('offline-throw-fields');
EngineClass.theApp=new EngineClass();
var invocation=new Packages.com.twinsoft.convertigo.engine.Context('offline-throw-fields');
EngineClass.theApp=null;
var requester=new Packages.com.twinsoft.convertigo.engine.requesters.JsonServletRequester();requester.context=invocation;
var flow=new Packages.com.twinsoft.convertigo.beans.flow.Flow();flow.setName('Stats');invocation.requestedObject=flow;
// A running requester: blocks run (the cancellation check reads Sequence.isRunning).
flow.context=invocation;invocation.project=new Packages.com.twinsoft.convertigo.beans.core.Project();flow.runningThread=new Packages.com.twinsoft.convertigo.beans.core.RequestableObject$RequestableThread(flow);flow.runningThread.bContinue=true;
var attributes=new java.util.HashMap();attributes.put('convertigo.requester',requester);
var iface=java.lang.Class.forName('jakarta.servlet.http.HttpServletRequest');
var http=java.lang.reflect.Proxy.newProxyInstance(iface.getClassLoader(),[iface],new java.lang.reflect.InvocationHandler({invoke:function(proxy,method,args){
 var name=String(method.getName());if(name==='getAttribute')return attributes.get(String(args[0]));if(name==='setAttribute'){attributes.put(String(args[0]),args[1]);return null;}if(name==='toString')return 'OfflineHttpRequest';return null;
}}));invocation.httpServletRequest=http;
var context=invocation,__flowProjectDir=String(java.nio.file.Files.createTempDirectory('flow-throw-fields-').toFile());
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
var statusAttribute=Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute.responseStatus;
function run(body){
 attributes.remove(String(statusAttribute.value()));
 return JSON.parse(engine.run(JSON.stringify({flowQName:String(flow.getQName()),flowName:'Stats',includeTrace:false,
  flowSource:'function Stats({result}) {\n'+body+'\n}'})));
}
// A field beside code/message/status is placed at the top of the error, evaluated like a details value.
var failed=run(' throw { code: "BAD_CSV", message: "x", status: 400, line: 1 + 2, details: { kept: true } }');
if(failed.ok!==false)throw Error('throw must fail the Flow: '+JSON.stringify(failed));
if(failed.error.code!=='BAD_CSV')throw Error('error.code must stay BAD_CSV: '+JSON.stringify(failed.error));
if(failed.error.line!==3)throw Error('error.line must be 3: '+JSON.stringify(failed.error));
if(!failed.error.details||failed.error.details.kept!==true)throw Error('details must stay as is: '+JSON.stringify(failed.error));
var statuses=statusAttribute.get(http);
if(!statuses||!statuses.containsKey(java.lang.Integer.valueOf(400)))throw Error('throw status 400 must reach the HTTP response');
failed=run(' throw { code: "BAD_CSV", message: "x", status: 400, line: 3 }');
if(failed.error.line!==3||failed.error.message!=='x')throw Error('a literal line must give error.line 3: '+JSON.stringify(failed.error));
failed=run(' local.lineNo = 3\n throw { code: "BAD_CSV", message: "x", status: 400, line: local.lineNo }');
if(failed.error.line!==3)throw Error('a path line must give error.line 3: '+JSON.stringify(failed.error));
// Reserved envelope names are refused, never written over the envelope.
['path: "elsewhere"','stack: "s"','__private: 1','"convertigo.user": "u"'].forEach(function(field){
 var refused=run(' throw { code: "BAD_CSV", message: "x", status: 400, '+field+' }');
 var text=JSON.stringify(refused);
 if(refused.ok!==false||refused.error.code==='BAD_CSV'||text.indexOf('RESERVED')<0)throw Error('reserved field '+field+' must be refused: '+text);
});
print('throw-error-fields OK');
