// Exercise the actual asynchronous activation watcher using a real JVM thread.
var file=new java.io.File(String(arguments[0]),'Engine.js'),source=String(Packages.org.apache.commons.io.FileUtils.readFileToString(file,'UTF-8'));
var start=source.indexOf('\tfunction frontendStartDevActivationWatcher('),end=source.indexOf('\n\tfunction ',start+2),snippet=source.substring(start,end);
var done=new java.util.concurrent.CountDownLatch(1),activated=false,errors=[];
function frontendActivatePreparedDev(request,blocks,info,entry){activated=true;done.countDown();}
function frontendWriteDevState(){}
function frontendStudioLog(message){errors.push(message);done.countDown();}
eval(snippet);
var entry={setupKind:'app',status:'ready'};frontendStartDevActivationWatcher({}, {}, {}, entry);
if(!done.await(5,java.util.concurrent.TimeUnit.SECONDS)||!activated||errors.length)throw Error('Activation watcher failed: '+JSON.stringify(errors));entry.activationThread.join(1000);
print(JSON.stringify({ok:true,actualWatcherActivated:true,daemon:Boolean(entry.activationThread.isDaemon())}));
