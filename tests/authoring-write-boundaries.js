// Public authoring boundaries reject writes the runtime cannot execute; indexed reads stay valid.
var File=java.io.File, IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var __flowProjectDir=String(java.nio.file.Files.createTempDirectory('flow-write-boundaries-').toFile());
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
var failures=[],checks=0;
function assert(value,message){checks++;if(!value)throw Error(message);}
function scenario(name,fn){try{fn();print('PASS '+name);}catch(e){failures.push(name+': '+e);print('FAIL '+name+': '+e);}}
function code(body){return 'const _flow={sourceVersion:2};\nfunction Probe({input,result}) {\n'+body+'\n}';}
scenario('computed destinations are refused at code-set and promote',function(){
 ['local.map[input.key] = input.value','local.map[input.key] = json.object({})','set({path:"local.map[input.key]",value:input.value})'].forEach(function(body){
  var out=JSON.parse(engine.flowCodeSet(JSON.stringify({name:'Probe',code:code(body)})));
  assert(out.ok===false,'computed destination accepted: '+body+' '+JSON.stringify(out));
  var diagnostics=out.error&&out.error.details&&out.error.details.diagnostics||out.diagnostics||[];
  var issue=diagnostics.filter(function(d){return d.code==='INVALID_DESTINATION';})[0];
  assert(issue && issue.line===3 && issue.property && /groups|group/i.test(issue.hint||''),'need line, property and grouping alternative: '+JSON.stringify(out));
  var promoted=JSON.parse(engine.flowCodePromote(JSON.stringify({name:'Probe',revision:out.revision})));
  assert(promoted.ok===false,'invalid destination promoted');
 });
 var valid=JSON.parse(engine.flowCodeSet(JSON.stringify({name:'Probe',code:code('result.value = input.map[input.key]')})));
 assert(valid.ok,'indexed source read must remain valid: '+JSON.stringify(valid));
});
scenario('current aliases explain the innermost item and the outer local',function(){
 var out=JSON.parse(engine.flowSourceValidate(JSON.stringify({code:code('result.value = list.map({items:input.items,select:current0.key})')})));
 var text=JSON.stringify(out);
 assert(out.ok===false && /innermost/.test(text) && /local.k/.test(text) && !/current.current0/.test(text),'misleading alias correction: '+text);
});
scenario('literal enumerations are checked before execution; templates stay dynamic',function(){
 IO.writeStringToFile(new File(__flowProjectDir,'_flow/blocks/probe/policy.block.js'),
  'const _meta={sourceVersion:2,properties:{onError:{kind:"template",type:"string",enum:["throw","return"]}},runtime:"rhino"};\n(function(){return {run:function(){return {};}};}())','UTF-8');
 var out=JSON.parse(engine.flowCodeSet(JSON.stringify({name:'Policy',code:code('probe.policy({onError:"raise"})')})));
 assert(out.ok===false && /BLOCK_PROPERTY_ENUM_INVALID/.test(JSON.stringify(out)) && /onError/.test(JSON.stringify(out)) && /throw/.test(JSON.stringify(out)),'literal choice accepted: '+JSON.stringify(out));
 ['"throw"','"return"','`${input.policy}`'].forEach(function(value){
  var good=JSON.parse(engine.flowCodeSet(JSON.stringify({name:'Policy',code:code('probe.policy({onError:'+value+'})')})));
  assert(good.ok,'valid/dynamic choice refused: '+JSON.stringify(good));
 });
});
if(failures.length)throw Error(failures.join('\n'));
print('authoring-write-boundaries OK ('+checks+' checks)');
