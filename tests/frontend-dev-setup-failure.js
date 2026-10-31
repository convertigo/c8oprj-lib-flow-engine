var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var source=String(IO.readFileToString(new File(arguments[0],'Engine.js'),'UTF-8'));
var start=source.indexOf('function frontendStartDevBackground('),end=source.indexOf('\n\tfunction frontendFinishPreparation(',start);
var setup=eval('('+source.substring(start,end).trim()+')');
var root=java.nio.file.Files.createTempDirectory('dev-setup-').toFile();IO.writeStringToFile(new File(root,'package.json'),'{}','UTF-8');
function frontendDevKey(){return 'fixture';} function frontendProjectRootFile(){return root;} function frontendGeneratedRootFile(){return root;} function frontendSvelteResourceRoot(){return root;}
function frontendExecutable(){return 'npm';} function frontendExecutablePathPrefix(){return '';}
function frontendDependencyFingerprint(){return 'same';} function frontendDependencyInstallReusable(){return true;}
function frontendStudioLog(){} function frontendPrepareGeneratedApp(request,blocks,info,entry){entry.status='failed';entry.error={code:'FRONTBUILDER_MODEL_REQUIRED',message:'config.frontbuilder.svelte.modelPath is missing'};}
function frontendWriteDevState(){} function frontendStartDevActivationWatcher(){} function frontendDevDetails(entry){return entry;}
var runtimeState={frontendDevServers:{}};
var out=setup({}, {}, {});
if(out.ok!==false || out.pending!==false || out.error.code!=='FRONTBUILDER_MODEL_REQUIRED' || out.message.indexOf('modelPath')<0)throw Error('Failed dev setup must be reported as failed with its cause: '+JSON.stringify(out));
print('frontend-dev-setup-failure OK');

frontendPrepareGeneratedApp=function(request,blocks,info,entry){entry.status='starting';};
frontendStartDevActivationWatcher=function(request,blocks,info,entry){entry.status='failed';entry.error={code:'FRONTEND_DEV_START_FAILED',message:'Vite activation failed'};};
out=setup({}, {}, {});
if(out.ok!==false || out.pending!==false || out.error.code!=='FRONTEND_DEV_START_FAILED')throw Error('Activation race must not return ok with failed details: '+JSON.stringify(out));
print('frontend-dev-activation-failure OK');
