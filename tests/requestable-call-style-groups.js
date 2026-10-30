// Distinct service operations are orchestration, not a row-by-row copy/paste pattern.
var root=new java.io.File(arguments[0]).getCanonicalFile(),files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('flow-call-style-').toFile();
var __flowEngineDir=String(root.getAbsolutePath()),__flowProjectDir=String(project.getAbsolutePath());
var checks=0;function check(value,message){checks++;if(!value)throw Error(message);}
try{
 var engine=eval(String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8')));
 function set(name,targets){var lines=targets.map(function(target,i){return '  local.step'+i+' = requestable.call({requestable:'+target+',input:{}})';});return JSON.parse(engine.flowCodeSet(JSON.stringify({name:name,code:'const _flow={sourceVersion:2}\nfunction '+name+'({input,config,result}) {\n'+lines.join('\n')+'\n  return {ok:true}\n}'})));}
 function repeats(report){return (report.diagnostics||(report.error&&report.error.details&&report.error.details.diagnostics)||[]).filter(function(d){return d.code==='FLOWSCRIPT_REPEATED_EXTERNAL_CALLS';});}
 var distinct=set('DistinctServices',['".Lookup"','".Guard"','".Upgrade"','".Remember"']);
 check(distinct.ok&&repeats(distinct).length===0,'Distinct requestables must not be rejected: '+JSON.stringify(distinct));
 var repeated=set('RepeatedService',['".Lookup"','".Lookup"','".Lookup"','".Lookup"']);
 check(!repeated.ok&&repeats(repeated).length===1,'Repeated same requestable remains a refusal: '+JSON.stringify(repeated));
 var pairs=set('TwoPairs',['".Lookup"','".Lookup"','".Upgrade"','".Upgrade"']);
 check(repeats(pairs).length===0,'The budget belongs to each known target');
 var dynamic=set('DynamicServices',['input.target','input.target','input.target','input.target']);
 check(!dynamic.ok&&repeats(dynamic).length===1,'Unknown dynamic targets retain the conservative refusal: '+JSON.stringify(dynamic));
 print('requestable-call-style-groups OK ('+checks+' checks)');
}finally{files.deleteDirectory(project);}
