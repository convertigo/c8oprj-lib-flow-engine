var engineDir=new java.io.File(arguments[0]).getCanonicalFile(),__flowEngineDir=String(engineDir);
var project=java.nio.file.Files.createTempDirectory('demo-reset-check-').toFile(),__flowProjectDir=String(project),files=Packages.org.apache.commons.io.FileUtils;
function write(p,s){files.writeStringToFile(new java.io.File(project,p),s,'UTF-8');}
function assert(v,m){if(!v)throw Error(m);}
try {
 write('_flow/blocks/entity/demoReset.block.js','const _meta={sourceVersion:2,properties:{},outputs:{out:{type:"object"}}}\nfunction block({result}) {return {}}');
 var engine=eval(String(files.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
 function code(access,body){return 'const _flow={sourceVersion:2'+(access?',accessibility:"'+access+'"':'')+'}\nfunction Reset({result}){\n'+body+'\n}';}
 function check(c){return JSON.parse(engine.flowSourceValidate(JSON.stringify({name:'Reset',code:c})));}
 ['hidden','public',''].forEach(function(access){var r=check(code(access,'result.x=entity.demoReset({})'));assert(!r.ok && (r.diagnostics||[]).some(function(d){return d.code==='FLOW_DEMO_RESET_NOT_PRIVATE';}),'reset must be private: '+access+' '+JSON.stringify(r.diagnostics));});
 assert(check(code('private','result.x=entity.demoReset({})')).ok,'private reset accepted');
 write('_flow/flows/Inner.flow.js',code('private','result.x=entity.demoReset({})'));
 var r=check(code('hidden','result.x=requestable.call({requestable:".Inner"})'));
 assert((r.diagnostics||[]).some(function(d){return d.code==='FLOW_DEMO_RESET_ADMIN_UNVERIFIED';}),'wrapper must warn: '+JSON.stringify(r.diagnostics));
 assert(!(check(code('private','result.x=flow.call({flow:"Inner"})')).diagnostics||[]).some(function(d){return d.code==='FLOW_DEMO_RESET_ADMIN_UNVERIFIED';}),'private wrapper quiet');
 var data=check(code('hidden','result.info={block:"entity.demoReset"}'));
 var inline=check(code('hidden','result.items=list.map({items:[1],select:{reset:entity.demoReset({})}})'));
 assert(data.ok && !inline.ok && (inline.diagnostics||[]).some(function(d){return d.code==='FLOW_DEMO_RESET_NOT_PRIVATE';}),
  'walk executable calls, including projections, without reading business block keys as calls: '+JSON.stringify({data:data.diagnostics,inline:inline.diagnostics,error:inline.error}));
 print('demo-reset-check OK');
}finally{files.deleteQuietly(project);}
