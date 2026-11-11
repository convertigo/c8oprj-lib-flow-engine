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
var probed=0;
function frontendSmokeDevRoutes(){probed++;return {ok:false,routes:[{route:'/draft/',httpStatus:500,status:'failed'}],logTail:'TypeError: state is null at +page.flow.svelte:4'};}
var out=frontendSyncDev({},{});
if(out.ok!==false || probed!==1 || out.error.code!=='FRONTEND_DEV_ROUTE_FAILED' || out.error.details.routes[0].route!=='/draft/' || out.error.details.logTail.indexOf('TypeError')<0)
 throw Error('dev.sync must report a broken route and dev log: '+JSON.stringify(out));
print('frontend-dev-sync-smoke OK');
