var engineDir=new java.io.File(arguments[0]).getCanonicalFile(),__flowEngineDir=String(engineDir);
var project=java.nio.file.Files.createTempDirectory('entity-scope-check-').toFile(),__flowProjectDir=String(project),files=Packages.org.apache.commons.io.FileUtils;
function write(p,s){files.writeStringToFile(new java.io.File(project,p),s,'UTF-8');}
function assert(v,m){if(!v)throw Error(m);}
try{
 write('_flow/data/model.yaml',JSON.stringify({version:2,entities:{Item:{fields:{posteId:{type:'int64'},owner:{type:'string'},enabled:{type:'boolean'}}}}}));
 var engine=eval(String(files.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
 function check(scope){return JSON.parse(engine.flowSourceValidate(JSON.stringify({name:'app.entityAccess',blockMode:true,code:'const _meta={sourceVersion:2,properties:{},outputs:{out:{type:"object"}}}\nfunction block({result}) {\nreturn {scope:'+scope+'}\n}'})));}
 var r=check('{posteId:"not-a-number"}');
 assert(!r.ok && r.diagnostics.some(function(d){return d.code==='ENTITY_SCOPE_LITERAL_TYPE';}),'incompatible scope diagnosed: '+JSON.stringify(r));
 r=check('{owner:"__none__"}');assert(r.ok && r.diagnostics.some(function(d){return d.code==='ENTITY_SCOPE_SENTINEL';}),'compatible sentinel warned');
 r=check('{posteId:-1}');assert(r.diagnostics.some(function(d){return d.code==='ENTITY_SCOPE_SENTINEL';}),'negative id warned');
 r=check('{id:""}');assert(r.diagnostics.some(function(d){return d.code==='ENTITY_SCOPE_SENTINEL';}),'empty id warned');
 assert(check('{owner:"alpha",posteId:"12",enabled:true}').ok,'valid typed scope accepted');
 assert(check('{}').ok,'empty scope accepted as unrestricted');
 write('_flow/blocks/entity/list.block.js','const _meta={properties:{entity:{kind:"template",type:"string"},checkAccess:{kind:"expression",type:"boolean"}},outputs:{out:{type:"object"}}}\nfunction block({result}) {return {}}');
 write('_flow/blocks/app/entityAccess.block.js','const _meta={sourceVersion:2,private:true,properties:{request:{type:"object",kind:"expression"}},outputs:{out:{type:"object"}}}\nfunction block({result}) {return {scope:{posteId:"bad"}}}');
 engine.cacheClear(JSON.stringify({localOnly:true}));
 write('_flow/flows/Probe.flow.js','const _flow={sourceVersion:2}\nfunction Probe({result}) {result.rows=entity.list({entity:"Item",checkAccess:true})}');
 r=JSON.parse(engine.flowCodeCheck(JSON.stringify({name:'Probe',maxDiagnostics:100})));
 assert(!r.ok && (r.diagnostics||r.error && r.error.diagnostics||[]).some(function(d){return d.code==='ENTITY_SCOPE_LITERAL_TYPE' && !!d.sourcePath;}),'public code-check checks the application policy: '+JSON.stringify(r));
 print('entity-scope-check OK');
}finally{files.deleteQuietly(project);}
