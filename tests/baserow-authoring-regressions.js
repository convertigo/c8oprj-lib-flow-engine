// Reproductions from lib_BaseRow flow-port F08/F16/F19/F22 and nested UNKNOWN_BLOCK.
var root = new java.io.File(arguments[0]).getCanonicalFile(), files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('flow-baserow-authoring-').toFile();
var __flowEngineDir=String(root.getAbsolutePath()),__flowProjectDir=String(project.getAbsolutePath()),__nativeProbeFlow;
var checks=0, failures=[];
function assert(v,m){checks++;if(!v)failures.push(m);}
try {
 var source=String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8'));
 // Replace only DBO discovery: exercise actual engine sync and real RequestableVariable beans without a server.
 source=source.replace('function projectFlowBeanLookup(name, request) {','function projectFlowBeanLookup(name, request) { if (__nativeProbeFlow) return {flow:__nativeProbeFlow,projectName:"Probe",flowName:name};');
 var engine=eval(source);
 function api(m,r){return JSON.parse(engine[m](JSON.stringify(r)));}
 var unknown=api('flowCodeSet',{name:'Unknown',code:'function Unknown({input,result}) {\n local.t = text.upper({ value: text.trim({ value: input.name }) })\n}'});
 assert(!unknown.ok && unknown.error.code==='UNKNOWN_BLOCK','Unknown outer call must precede nested safety: '+JSON.stringify(unknown.error));
 assert(JSON.stringify(unknown).indexOf('candidates')>=0,'Unknown block needs suggestions');
 var passiveUnknown=api('flowCodeCheck',{name:'Unknown',code:'function Unknown({input,result}) {\n local.t = text.upper({ value: text.trim({ value: input.name }) })\n}'});
 assert(!passiveUnknown.ok&&passiveUnknown.error.code==='UNKNOWN_BLOCK'&&JSON.stringify(passiveUnknown).indexOf('candidates')>=0,'Passive code-check resolves unknown vocabulary before nested properties, without corrections: '+JSON.stringify(passiveUnknown));
 var literal=api('flowCodeSet',{name:'LiteralPath',code:'function LiteralPath({result}) {\n result.text = file.readText({path:"docs/flow-port/fixtures/input.csv"})\n}'});
 assert(literal.ok && !(literal.diagnostics||[]).some(function(d){return d.code==='FLOWSCRIPT_INPUT_NOT_DECLARED';}) && !(literal.inputVariables||[]).length,'Literal input.csv is not a scope access: '+JSON.stringify(literal));
 var expression=api('flowCodeCheck',{name:'RealInput',code:'function RealInput({input,result}) {\n result.text = input.actual\n}'});
 assert((expression.diagnostics||[]).some(function(d){return d.code==='FLOWSCRIPT_INPUT_NOT_DECLARED';}),'A real undeclared input still warns');
 __nativeProbeFlow=new Packages.com.twinsoft.convertigo.beans.flow.Flow();__nativeProbeFlow.setName('Native');
 var meta={authenticatedContextRequired:true,inputs:{key:{type:'string',visibility:-1},files:{type:'array',items:{type:'string'},isFileUpload:true}}};
 function sync(m){return api('syncInputs',{name:'Native',project:'Probe',flowSource:'const _flow = '+JSON.stringify(m)+'\nfunction Native({result}) { result.ok = true }'});}
 var a=sync(meta);
 assert(a.ok,'Native input sync failed: '+JSON.stringify(a));
 var key=__nativeProbeFlow.getVariable('key'),upload=__nativeProbeFlow.getVariable('files');
 assert(key && key.getVisibility()===-1,'F08 visibility -1 copied to native bean');
 assert(upload && upload.getIsFileUpload() && upload.isMultiValued(),'F19 file upload + multivalue copied');
 assert(__nativeProbeFlow.getAuthenticatedContextRequired(),'F16 native authentication copied');
 var repeat=sync(meta);
 assert(repeat.ok && repeat.inputSync.updated.length===0 && (repeat.inputSync.metadataUpdated||[]).length===0,'Native sync idempotent');
 meta.inputs.key.visibility=0;meta.inputs.files.isFileUpload=false;meta.authenticatedContextRequired=false;sync(meta);
 assert(key.getVisibility()===0 && !upload.getIsFileUpload() && !__nativeProbeFlow.getAuthenticatedContextRequired(),'Explicit false/zero resets preserved');
 sync({inputs:{key:{type:'string'},files:{type:'array'}}});
 assert(key.getVisibility()===0 && !upload.getIsFileUpload(),'Omitted native metadata preserves existing settings');
 sync({authenticatedContextRequired:true});
 assert(__nativeProbeFlow.getAuthenticatedContextRequired(),'Auth-only metadata does not require an input');
 __nativeProbeFlow=null;
 [{visibility:'-1'}, {visibility:16}, {isFileUpload:'false'}].forEach(function(props,i){var r=api('flowCodeSet',{name:'Bad'+i,code:'const _flow = '+JSON.stringify({inputs:{x:Object.assign({type:'string'},props)}})+'\nfunction Bad'+i+'({result}) { result.ok = true }'});assert(!r.ok,'Invalid native metadata accepted '+JSON.stringify(props));});
 var badAuth=api('flowCodeSet',{name:'BadAuth',code:'const _flow = {authenticatedContextRequired:"false"}\nfunction BadAuth({result}) { result.ok = true }'});assert(!badAuth.ok,'Authentication must not coerce string false to true');
 if(failures.length)throw new Error(failures.join('\n'));
 print('baserow-authoring-regressions OK ('+checks+' assertions)');
}finally{files.deleteDirectory(project);}
