var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]||'_flow').getCanonicalPath());
var project=java.nio.file.Files.createTempDirectory('audit-http-').toFile(),__flowProjectDir=String(project);
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8'))),checks=0;
function assert(value,label){checks++;if(!value)throw Error(label);}
var received=new java.util.concurrent.atomic.AtomicInteger();
var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress('127.0.0.1',0),0);
var workers=java.util.concurrent.Executors.newCachedThreadPool();server.setExecutor(workers);
var base='http://127.0.0.1:'+server.getAddress().getPort();
server.createContext('/',function(exchange){
 received.incrementAndGet();var path=String(exchange.getRequestURI().getPath()),bytes=new java.lang.String('ok').getBytes('UTF-8');
 if(path==='/redirect'){exchange.getResponseHeaders().add('Location','http://127.0.0.2:'+server.getAddress().getPort()+'/ok');exchange.sendResponseHeaders(302,-1);}
 else if(path==='/hugeRedirect'){exchange.getResponseHeaders().add('Location','/ok');exchange.sendResponseHeaders(302,0);try{for(var i=0;i<100000;i++)exchange.getResponseBody().write(bytes);}catch(closed){} }
 else {exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);}
 exchange.close();
});server.start();
function run(path){return JSON.parse(engine.run(JSON.stringify({includeTrace:false,definition:{version:1,nodes:[{id:'http',block:'http.request',props:{url:base+path,responseType:'text'},out:'result.value'}]}})));}
try{
 java.lang.System.clearProperty('convertigo.flow.http.allowedHosts');
 var denied=run('/ok');assert(!denied.ok&&denied.error.code==='HTTP_DESTINATION_REFUSED'&&received.get()===0,'denied before connection: '+JSON.stringify(denied));
 java.lang.System.setProperty('convertigo.flow.http.allowedHosts','127.0.0.1');
 var ok=run('/ok');assert(ok.ok&&ok.result.value.text==='ok','allowed host: '+JSON.stringify(ok));
 var redirect=run('/redirect');assert(!redirect.ok&&JSON.stringify(redirect).indexOf('HTTP_DESTINATION_REFUSED')>=0&&received.get()===2,'redirect destination checked: '+JSON.stringify(redirect));
 java.lang.System.setProperty('convertigo.flow.http.maxResponseBytes','8');
 var short=run('/hugeRedirect');assert(short.ok&&short.result.value.text==='ok','redirect body discarded without draining: '+JSON.stringify(short));
 print('audit-http-runtime OK ('+checks+' checks)');
}finally{java.lang.System.clearProperty('convertigo.flow.http.allowedHosts');java.lang.System.clearProperty('convertigo.flow.http.maxResponseBytes');server.stop(0);workers.shutdownNow();IO.deleteDirectory(project);}
