// Exercise real native outputSchema requests against learned files, not a mocked cache.
var File=java.io.File,files=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]||'_flow').getCanonicalPath());
var temporary=java.nio.file.Files.createTempDirectory('flow-schema-invalidation-').toFile(),__flowProjectDir=String(temporary);
function check(v,m){if(!v)throw new Error(m);}
function write(path,text){files.writeStringToFile(new File(temporary,path),text,'UTF-8');}
try {
 write('c8oProject.yaml','↓SchemaInvalidation [core.Project]:\n');
 var source='const _flow = {sourceVersion:2, inputs:{text:{type:"string"}}}\nfunction Learned({input,result}) {\n result.record = json.parse({text:input.text})\n}\n';
 write('_flow/flows/Learned.flow.js',source);
 var analyses=0;
 var engineSource=String(files.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8'));
 var anchor='function analyzeFlowDefinition(blocks, definition, request) {';
 check(engineSource.split(anchor).length===2,'Analysis observation anchor changed');
 var engine=eval(engineSource.replace(anchor,anchor+' analyses++;'));
 var req={flowName:'Learned',flowSource:source,allowRequestableSchema:false};
 function output(){var out=JSON.parse(String(engine.outputSchema(JSON.stringify(req))));check(out.ok,'Output analysis failed: '+JSON.stringify(out));return out;}
 var before=JSON.stringify(output()),coldAnalyses=analyses;
 check(JSON.stringify(output())===before,'An unchanged schema must be stable');
 check(analyses===coldAnalyses,'An unchanged output must reuse its static analysis');
 var run=JSON.parse(String(engine.run(JSON.stringify({name:'Learned',flowSource:source,includeTrace:false,learnResultSchema:true,input:{text:'{"learnedOnly":7}'}}))));
 check(run.ok,'Run failed');
 var after=JSON.stringify(output());
 check(after.indexOf('learnedOnly')>=0,'Learning must invalidate an already cached schema immediately: '+after+' run '+JSON.stringify(run));
 check(after!==before,'A newly learned contract must become visible');
 check(JSON.parse(String(engine.schemaReset(JSON.stringify({name:'Learned',flowSource:source})))).deleted,'Learned schema reset did not delete the files');
 check(JSON.stringify(output()).indexOf('learnedOnly')<0,'Reset must invalidate the learned contract immediately');
 req.flowSource='const _flow={sourceVersion:2}\nfunction Learned({result}) { result.changedSource = 42 }\n';
 check(JSON.stringify(output()).indexOf('changedSource')>=0,'A source change must bypass the previous snapshot');
 // Actual configuration and referenced-block fingerprints are recomputed after
 // the explicit invalidation already required for external filesystem edits.
 write('_flow/engine.yaml','version: 1\nconfig:\n  sample: 7\n');engine.cacheClear();
 var previous=analyses;
 check(JSON.stringify(output()).indexOf('changedSource')>=0,'Configuration invalidation lost the Flow contract');
 check(analyses===previous+1,'A changed configuration must force static reanalysis');
 function block(type){return 'const _meta={runtime:"rhino",properties:{},outputs:{out:{type:"'+type+'"}}}\n(function(){return {run:function(){return null;}}}())\n';}
 write('_flow/blocks/sample/value.block.js',block('string'));engine.cacheClear();
 req.flowSource='const _flow={sourceVersion:2}\nfunction Learned({result}) { result.item = sample.value({}) }\n';
 check(output().schema.properties.item.type==='string','Project block output missing');
 write('_flow/blocks/sample/value.block.js',block('number'));engine.cacheClear();
 check(output().schema.properties.item.type==='number','A changed project block must invalidate its consumers');
 print('generated-schema-invalidation: immediate learn/reset, source and explicit configuration invalidation OK');
} finally { files.deleteDirectory(temporary); }
