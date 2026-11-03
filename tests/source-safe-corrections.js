// Every former correction is either understood without editing, or proposed for explicit review.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory('flow-correction-proposals-').toFile();
var __flowProjectDir = String(project), files=Packages.org.apache.commons.io.FileUtils, checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
try {
 var engine=eval(String(files.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
 function api(method,args){return JSON.parse(engine[method](JSON.stringify(args)));}
 function code(name,body){return 'function '+name+'({ input, config, result }) {\n'+body+'\n}';}
 function verify(name,body,manual,input){
  var original=code(name,body),written=api('flowCodeSet',{name:name,code:original,autoCorrect:true});
  assert(api('flowCodeGet',{name:name}).code===original,name+': writer must not edit source');
  assert(!written.autoCorrected&&!written.fixes,name+': no correction applied');
  var passes=0;
  while(!written.ok && passes++<4){
   assert(written.proposedPatch&&written.proposedPatch.edits.length,name+': missing suggested patch '+JSON.stringify(written));
   assert(written.proposedPatch.edits.every(function(edit){return edit.line>0&&typeof edit.before==='string'&&typeof edit.after==='string';}),name+': line/before/after contract');
   written=api('flowCodePatch',{name:name,revision:written.revision,edits:written.proposedPatch.edits});
  }
  assert(written.ok,name+': reviewed source failed '+JSON.stringify(written));
  var run=api('flowCodeRun',{name:name,input:input||{}}),expected=api('flowCodeRun',{name:name+'Manual',code:code(name+'Manual',manual),input:input||{}});
  assert(run.ok&&expected.ok&&JSON.stringify(run.result)===JSON.stringify(expected.result),name+': reviewed semantics '+JSON.stringify({run:run,expected:expected}));
 }
 verify('Nested','result.value = date.diff({ from: date.add({ value: "2025-12-31", months: 2, days: 15 }), to: "2026-03-16" })','local.due = date.add({ value: "2025-12-31", months: 2, days: 15 })\nresult.value = date.diff({ from: local.due, to: "2026-03-16" })');
 verify('Arithmetic','result.value = date.compare({ left: "2026-03-15", right: "2026-03-16" }) + 1','local.c = date.compare({ left: "2026-03-15", right: "2026-03-16" })\nresult.value = local.c + 1');
 verify('Positional','result.value = text.trim("été")','result.value = text.trim({ text: "été" })');
 verify('Triple','result.value = text.trim({text:text.trim({text:text.trim({text:" three "})})})','local.a = text.trim({text:" three "})\nlocal.b = text.trim({text:local.a})\nresult.value = text.trim({text:local.b})');
 verify('Methods','result.value = input.q.toLowerCase().indexOf("b")','result.value = input.q.toLowerCase().indexOf("b")',{q:'B'});
 verify('Projection','local.rows = list.map({items:input.rows,select:{label:text.trim({text:current.name})}})\nresult.rows = local.rows','local.rows = list.map({items:input.rows,select:{label:text.trim({text:current.name})}})\nresult.rows = local.rows',{rows:[{name:' A '},{name:' B '}]});
 verify('Branch','if (input.enabled) {\nresult.value = text.trim({text:text.trim({text:" ok "})})\n} else {\nresult.value = "off"\n}','if (input.enabled) {\nlocal.t = text.trim({text:" ok "})\nresult.value = text.trim({text:local.t})\n} else {\nresult.value = "off"\n}',{enabled:true});
 assert(api('flowCodeRun',{name:'Branch',input:{enabled:false}}).result.value==='off','lifting stays in branch');
 ['result.value = input.ok && text.trim({text:"a"})','result.value = input.ok ? text.trim({text:"a"}) : "b"','result.value = input.before + text.trim({text:"a"})'].forEach(function(body,index){
  var name='Unsafe'+index,original=code(name,body),out=api('flowCodeSet',{name:name,code:original,autoCorrect:true});
  assert(!out.ok&&!out.autoCorrected,'unsafe expression is refused');assert(api('flowCodeGet',{name:name}).code===original,'unsafe expression remains unchanged');
 });
 var inputs=code('Inputs','result.value = input.rows');
 var inputSet=api('flowCodeSet',{name:'Inputs',code:inputs});
 assert(inputSet.ok&&inputSet.proposedPatch,'input declaration is suggested without coercing the authored program');
 assert(api('flowCodeGet',{name:'Inputs'}).code===inputs,'undeclared inputs never rewrite text');
 var raw=code('Raw','result.value = "date.now() input.ghost ${input.literal}"');
 var rawSet=api('flowCodeSet',{name:'Raw',code:raw});assert(rawSet.ok&&!rawSet.proposedPatch,'quoted text never becomes a call or input read');
 var draft=api('flowCodeGet',{name:'Nested'}),updated=api('flowCodePatch',{name:'Nested',revision:draft.revision,edits:[{oldText:'2026-03-16',newText:'2026-03-17'}]});
 assert(updated.ok,'revision patch');
 var stale=api('flowCodePatch',{name:'Nested',revision:draft.revision,code:code('Nested','result.value = 0')});assert(!stale.ok&&stale.error.code==='FLOW_CODE_REVISION_MISMATCH','stale patch stays refused');
 var bad=api('flowCodePatch',{name:'Nested',revision:updated.revision,edits:[{oldText:'missing text',newText:'x'}]});assert(!bad.ok&&api('flowCodeGet',{name:'Nested'}).revision===updated.revision,'invalid patch changes nothing');
 var promote=api('flowCodePromote',{name:'Nested'});assert(promote.ok&&promote.promoted&&typeof promote.linted==='boolean'&&typeof promote.changedLines==='number','guarded promote selects unique draft');
 var payload=api('flowCodePromote',{name:'Injected',code:code('Injected','result.value = 1')});assert(!payload.ok&&payload.error.code==='FLOW_CODE_REVISION_REQUIRED','supplied source needs revision');
 print('source-safe-corrections OK ('+checks+' checks)');
} finally {files.deleteDirectory(project);}
