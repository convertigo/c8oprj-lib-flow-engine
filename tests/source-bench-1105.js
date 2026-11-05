// Each of the ten submitted gcd sources, including the invalid _flow call.
var dir=new java.io.File(arguments[0]).getCanonicalFile(),__flowEngineDir=String(dir);
var FU=Packages.org.apache.commons.io.FileUtils,File=java.io.File,checks=0;
var project=java.nio.file.Files.createTempDirectory('flow-1105-').toFile(),__flowProjectDir=String(project);
function read(f){return String(FU.readFileToString(f,'UTF-8'));}
function assert(v,m){checks++;if(!v)throw Error(m);}
try {
 var engine=eval(read(new File(dir,'Engine.js')));
 function api(n,a){return JSON.parse(engine[n](JSON.stringify(a)));}
 var cases=JSON.parse(read(new File(dir,'../tests/fixtures/bench-1105-format.json')));
 cases.forEach(function(c,i){
  api('flowCodeDiscard',{name:c.name});
  var set=api('flowCodeSet',{name:c.name,code:c.code});
  assert(api('flowCodeGet',{name:c.name}).code===c.code,'case '+(i+1)+' keeps exact submitted text');
  if(i===0){
   assert(!set.ok && set.error.code==='FLOWSCRIPT_METADATA_DECLARATION_REQUIRED','_flow call refused at set');
   assert(set.proposedPatch && set.proposedPatch.edits.length===1,'exact metadata patch');
   set=api('flowCodePatch',{name:c.name,revision:set.revision,edits:set.proposedPatch.edits});
  }
  assert(set.ok,'case '+(i+1)+' valid draft '+JSON.stringify(set));
  var before=api('flowCodeRun',{name:c.name,input:{a:'12',b:'18'}});
  var promoted=api('flowCodePromote',{name:c.name,revision:set.revision});
  assert(promoted.ok,'case '+(i+1)+' promote '+JSON.stringify(promoted));
  var get=api('flowCodeGet',{name:c.name}),after=api('flowCodeRun',{name:c.name,input:{a:'12',b:'18'}});
  assert(before.ok && after.ok && JSON.stringify(before.result)===JSON.stringify(after.result),'same execution '+(i+1));
  if(i>0)assert(after.result.gcd===6,'case '+(i+1)+' gcd result');
  var validate=api('flowSourceValidate',{name:c.name,code:get.code});
  assert(validate.ok && !validate.definition.nodes.some(function(n){return n.props && n.props.path==='local._flow';}),'header is not a local');
  if(/const _flow/.test(c.code)||i===0)assert(validate.definition.flow.inputs.a,'input metadata preserved '+(i+1));
  var again=api('flowCodeSet',{name:c.name,code:get.code});
  var twice=api('flowSourceValidate',{name:c.name,flowSource:validate.source,includeHeader:false,includeImplicitReturn:false});
  assert(again.ok && twice.ok && twice.code===get.code && again.revision===get.revision,'idempotent '+(i+1));
  if(i===1||i===2||i===9){
   [{a:'0',b:'5',gcd:5},{a:'270',b:'192',gcd:6}].forEach(function(input){
    var r=api('flowCodeRun',{name:c.name,input:input});assert(r.ok && r.result.gcd===input.gcd,'Euclidean loop '+(i+1));
   });
   var bad=api('flowCodeRun',{name:c.name,input:{a:'0',b:'0'}});
   assert(!bad.ok && bad.error.code==='BAD_INPUT','compound if + throw '+(i+1));
  }
 });
 var business=api('flowCodeSet',{name:'Business',code:'result.value = { helpers: [], __flowScriptValue: "kept" }'});
 assert(business.ok && api('flowCodePromote',{name:'Business',revision:business.revision}).ok,'business data still compared and saved');
 print('source-bench-1105 OK ('+checks+' checks)');
} finally {FU.deleteDirectory(project);}
