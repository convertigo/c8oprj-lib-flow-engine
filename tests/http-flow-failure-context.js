var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var policy=eval(String(IO.readFileToString(new File(__flowEngineDir,'modules/http-flow-failure.js'),'UTF-8')));
var EngineClass=Packages.com.twinsoft.convertigo.engine.Engine;
EngineClass.logEngine=EngineClass.logContext=Packages.org.apache.log4j.Logger.getLogger('offline-http-status');
EngineClass.theApp=new EngineClass();
var invocation=new Packages.com.twinsoft.convertigo.engine.Context('offline-http-status');
EngineClass.theApp=null;
var requester=new Packages.com.twinsoft.convertigo.engine.requesters.JsonServletRequester();requester.context=invocation;
var flow=new Packages.com.twinsoft.convertigo.beans.flow.Flow();flow.setName('Read');invocation.requestedObject=flow;
var attributes=new java.util.HashMap();attributes.put('convertigo.requester',requester);
var iface=java.lang.Class.forName('jakarta.servlet.http.HttpServletRequest');
var http=java.lang.reflect.Proxy.newProxyInstance(iface.getClassLoader(),[iface],new java.lang.reflect.InvocationHandler({invoke:function(proxy,method,args){
 var name=String(method.getName());if(name==='getAttribute')return attributes.get(String(args[0]));if(name==='setAttribute'){attributes.put(String(args[0]),args[1]);return null;}if(name==='toString')return 'OfflineHttpRequest';return null;
}}));invocation.httpServletRequest=http;
policy.apply({flowQName:String(flow.getQName())},{ok:false,error:{code:'UNKNOWN_BLOCK'}},invocation);
var statuses=Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute.responseStatus.get(http);
if(!statuses || !statuses.containsKey(java.lang.Integer.valueOf(500)))throw Error('The real Context.setResponseStatus must carry HTTP 500 to the servlet');
// Exercise Engine.run too, with an uncaught block failure owned by this same HTTP request.
var context=invocation,__flowProjectDir=String(java.nio.file.Files.createTempDirectory('flow-http-status-').toFile());
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
attributes.remove(String(Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute.responseStatus.value()));
var failed=JSON.parse(engine.run(JSON.stringify({flowQName:String(flow.getQName()),flowName:'Read',flowSource:'function Read({result}) {\n result.value = missing.block({})\n}',includeTrace:false})));
if(failed.ok!==false)throw Error('Fixture must fail execution');
statuses=Packages.com.twinsoft.convertigo.engine.enums.RequestAttribute.responseStatus.get(http);
if(!statuses || !statuses.containsKey(java.lang.Integer.valueOf(500)))throw Error('Engine failure boundary must set status 500');
print('http-flow-failure-context OK');
