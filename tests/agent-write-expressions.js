var engineDir = String(new java.io.File(arguments[0] || '_flow').getCanonicalPath());
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory('flow-write-expressions-').toFile();
var __flowProjectDir = String(project.getCanonicalPath());
var FU = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
var engine=eval(String(FU.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
function api(n,r){return JSON.parse(engine[n](JSON.stringify(r)));}
function code(body){return 'function Example({input,result}) {\n'+body+'\n}\n';}
function run(body,input){var r=api('run',{flowSource:code(body),input:input||{},includeTrace:false});assert(r.ok,JSON.stringify(r.error));return r.result;}
try {
 var r=run('result.array = Array.isArray(input.value)\nresult.type = typeof input.value\nresult.missing = typeof local.absent', {value:[1,2]});
 assert(r.array===true && r.type==='object' && r.missing==='undefined',JSON.stringify(r));
 assert(run('result.array = Array.isArray(input.value)\nresult.type = typeof input.value',{value:'hello'}).type==='string','typeof string');
 var body='local.flag = input.flag\nlocal.n = local.flag && date.compare({left:"2026-01-01",right:"2026-01-02"}) < 0\nresult.n = local.n';
 assert(run(body,{flag:false}).n===false,'short circuit false');
 assert(run(body,{flag:true}).n===true,'short circuit true');
 assert(run('result.value = false && json.parse({text:"invalid JSON"})').value===false,'&& never runs RHS');
 assert(run('result.value = "kept" || json.parse({text:"invalid JSON"})').value==='kept','|| preserves left');
 assert(run('result.value = 0 ?? json.parse({text:"invalid JSON"})').value===0,'?? preserves zero');
 assert(run('result.value = input.flag ? date.compare({left:"2026-01-01",right:"2026-01-02"}) : 8',{flag:false}).value===8,'ternary lazy');
 var v=api('flowSourceValidate',{code:code(body),name:'Example'});
 assert(v.ok,JSON.stringify(v));
 var canonical=api('flowSourceValidate',{flowSource:v.source,name:'Example'});
 assert(canonical.ok && JSON.stringify(api('run',{flowSource:canonical.code,input:{flag:true}}).result)==='{"n":true}','canonical roundtrip');
 ['$$nodes: function () { result.n = current }','$$nodes: () => { result.n = current }','$$nodes() { result.n = current }'].forEach(function(slot){
  var src=code('forEach({items:[1,2],'+slot+'})');var v=api('flowSourceValidate',{code:src,name:'Example'});
  assert(v.ok && api('run',{flowSource:src}).result.n===2,'slot form '+slot+' '+JSON.stringify(v.error));
 });
 var repeated=run('result.values = []\nforEach({items:[false,true], $$nodes() {\n local.v = current && date.compare({left:"2026-01-01",right:"2026-01-02"}) < 0\n result.values = result.values.concat([local.v])\n}})');
 assert(JSON.stringify(repeated.values)==='[false,true]','block stays inside iteration');
 assert(run('local.flowExpression1 = 40\nresult.n = local.flowExpression1 + date.compare({left:"2026-01-02",right:"2026-01-01"})').n===41,'generated local avoids source names');
 assert(run('result.n = (input.flag && date.compare({left:"2026-01-02",right:"2026-01-01"})) || 9',{flag:false}).n===9,'nested lazy expression');
 assert(run('result.n = null ?? date.compare({left:"2026-01-02",right:"2026-01-01"})').n===1,'nullish fallback');
 // A prefix operator keeps its place when the expression around a block is lowered (Rhino bounds !x by x alone)
 var B='date.compare({left:"2026-01-01",right:"2026-01-02"}) < 0';
 assert(run('result.v = input.flag && !input.blocked && '+B,{flag:true,blocked:true}).v===false,'! guard stays negated');
 assert(run('result.v = input.flag && !input.blocked && '+B,{flag:true,blocked:false}).v===true,'! guard passes');
 assert(run('result.v = !input.blocked && '+B,{blocked:true}).v===false,'leading ! stays negated');
 assert(run('result.v = !input.blocked ? '+B+' : false',{blocked:true}).v===false,'! in a ternary test');
 assert(run('result.v = input.ok && typeof input.d == "string" && input.d.length == 10 && '+B,{ok:true,d:'2026-01-01'}).v===true,'typeof in a chain');
 assert(run('result.v = typeof (input.d) == "string" && '+B,{d:'x'}).v===true,'typeof with parentheses');
 assert(run('result.v = input.flag && -input.n > 0 && '+B,{flag:true,n:5}).v===false,'unary minus');
 assert(run('result.v = input.flag && !!input.n && '+B,{flag:true,n:0}).v===false,'double negation');
 var tilde=api('run',{flowSource:code('result.v = input.flag && ~input.n && '+B),input:{flag:true,n:-1},includeTrace:false});
 assert(!tilde.ok && JSON.stringify(tilde.error).indexOf('~input.n')>=0,'an unsupported operator is refused, never dropped: '+JSON.stringify(tilde.error));
 var ordered=run('local.before = 3\nresult.n = local.before + set({path:"local.before",value:7})\nresult.after = local.before');
 assert(ordered.n===10 && ordered.after===7,'freeze earlier reads before a block writes: '+JSON.stringify(ordered));
 print('agent-write-expressions OK ('+checks+' checks)');
} finally {FU.deleteDirectory(project);}
