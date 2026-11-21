var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var source=String(IO.readFileToString(new File(arguments[0],'Engine.js'),'UTF-8'));
var start=source.indexOf('function frontendSyncDev('),end=source.indexOf('\n\tfunction frontendOpenDev(',start);
var frontendSyncDev=eval('('+source.substring(start,end).trim()+')');
var entry={status:'running',generatedRoot:String(java.nio.file.Files.createTempDirectory('dev-sync-smoke-').toFile())};
function frontbuilderSettingsForRequest(){return {};}
function frontendDevEntry(){return entry;}
function frontendExecutable(){return 'npm';}
function frontendDependencyManifestFingerprint(){return 'same';}
function frontendRunAction(){return {ok:true};}
function frontendActionStepPerformed(){return false;}
function frontendDevRestartRequired(){return false;}
function frontendDependencyFingerprint(){return 'same';}
function frontendWriteDevState(){}
function frontendStudioBrowser(){return {};}
function frontendNotifyStudioBrowser(){}
function frontendDevDetails(){return {};}
function frontendRestoreDevTsconfig(){return null;}
var probed=0,smoke={ok:false,routes:[{route:'/',httpStatus:200,status:'passed'},{route:'/draft/',httpStatus:500,status:'failed'}],logTail:'TypeError: state is null at +page.flow.svelte:4'};
function frontendSmokeDevRoutes(){probed++;return smoke;}
var out=frontendSyncDev({},{});
if(out.ok!==false || probed!==1 || out.error.code!=='FRONTEND_DEV_ROUTE_FAILED' || out.error.details.routes[1].route!=='/draft/' || out.error.details.logTail.indexOf('TypeError')<0)
 throw Error('dev.sync must report a broken route and dev log: '+JSON.stringify(out));
// The message names the failed route and its HTTP status, as a client may show only the text of the error (L28F, 21/11);
// a passed route is not named.
if(out.error.message!=='The generated route /draft/ (HTTP 500) failed its HTTP smoke check.' || out.message.indexOf('/draft/ (HTTP 500)')<0 || out.error.message.indexOf(' / ')>=0)
 throw Error('dev.sync must name the failed route and its status: '+JSON.stringify({error:out.error.message,message:out.message}));
// Several routes: each with its status, an overlay or no answer with the reason of the check.
smoke={ok:false,routes:[{route:'/a/',httpStatus:404,status:'failed'},{route:'/b/',httpStatus:200,status:'failed',message:'Vite served an error overlay.'},
 {route:'/c/',status:'failed',message:'Read timed out'},{route:'/d/[id]/',status:'not_checked'}],logTail:''};
out=frontendSyncDev({},{});
if(out.error.message!=='Generated routes failed their HTTP smoke check: /a/ (HTTP 404), /b/ (HTTP 200: Vite served an error overlay), /c/ (no HTTP answer: Read timed out).')
 throw Error('dev.sync must name every failed route: '+out.error.message);
print('frontend-dev-sync-smoke OK');
