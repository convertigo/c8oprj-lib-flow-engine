// Stopped sync is actionable; an asynchronous preparation waits, or reports its deadline.
var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var source=String(IO.readFileToString(new File(arguments[0],'Engine.js'),'UTF-8'));
var start=source.indexOf('function frontendSyncDev('),end=source.indexOf('\n\tfunction frontendOpenDev(',start);
var frontendSyncDev=eval('('+source.substring(start,end).trim()+')');
var ticks=0,readyAt=0,entry=null;
var JavaSystem={currentTimeMillis:function(){return ticks;}};
var Packages={java:{lang:{Thread:{sleep:function(ms){ticks+=ms;}}}}};

function assert(ok,message){if(!ok)throw Error(message);}
function frontbuilderSettingsForRequest(){return {};}
function frontendDevEntry(){if(entry && readyAt && ticks>=readyAt)entry={status:'running',generatedRoot:'/fixture',url:'http://app/'};return entry;}
function frontendLastDevDetails(){return {status:'stopped',stopReason:'first-viewer-timeout'};}
function frontendDraftCount(){return 0;}
function frontendDevWaitRequested(request){return request.wait!==false;}
function frontendDevDetails(entry){return {status:entry.status};}
function frontendExecutable(){return 'npm';}
function frontendDependencyManifestFingerprint(){return 'same';}
function frontendRunAction(){return {ok:true};}
function frontendActionStepPerformed(){return false;}
function frontendDevRestartRequired(){return false;}
function frontendDependencyFingerprint(){return 'same';}
function frontendWriteDevState(){}
function frontendStudioBrowser(){return {};}
function frontendNotifyStudioBrowser(){}
function frontendRestoreDevTsconfig(){return null;}
function frontendSmokeDevRoutes(){return {ok:true};}
var out=frontendSyncDev({},{});
assert(out.status==='stopped' && out.stopReason==='first-viewer-timeout' && out.generated===false && out.next==='dev.ensure(wait:true)','stopped sync describes recovery');
['starting','prepared'].forEach(function(status){
 ticks=0;readyAt=150;entry={status:status,activationStarted:true};
 out=frontendSyncDev({wait:true,timeoutMs:500},{});
 assert(ticks>=150 && out.ok && out.openUrl==='http://app/','wait:true waits through '+status+' to the active URL');
 ticks=0;readyAt=0;entry={status:status,activationStarted:true};
 out=frontendSyncDev({wait:true,timeoutMs:100},{});
 assert(out.ok===false && out.pending && out.status===status && out.error.code==='FRONTEND_DEV_READY_TIMEOUT','deadline explicitly reports '+status);
 ticks=0;out=frontendSyncDev({wait:false},{});
 assert(ticks===0 && out.pending && out.status===status && out.generated===false,'wait:false stays nonblocking');
});
print('frontend-dev-sync-readiness OK');
