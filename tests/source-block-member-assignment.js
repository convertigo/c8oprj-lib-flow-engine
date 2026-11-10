// A scope assignment reading a static member of a block result (result.x = block(...).y) runs as
// const x = block(...).y does: the block into a local of its own, then the read. Any other form keeps its refusal
// with an exact proposal: a dynamic index, a comparison, a method of the result, a block in a per-item expression.
var engineDir = String(new java.io.File(arguments[0] || '_flow').getCanonicalPath());
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory('flow-block-member-').toFile();
var __flowProjectDir = String(project.getCanonicalPath());
var FU = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
var engine=eval(String(FU.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
function api(n,r){return JSON.parse(engine[n](JSON.stringify(r)));}
function code(name,body){return 'function '+name+'({ input, result }) {\n'+body+'\n}';}
function ran(name,source,input){
 var out=api('flowCodeSet',{name:name,code:source});
 assert(out.ok,name+': accepted '+JSON.stringify(out).substring(0,800));
 var run=api('flowCodeRun',{name:name,input:input||{}});
 assert(run.ok,name+': runs '+JSON.stringify(run).substring(0,800));
 return run.result;
}
function refused(name,source){
 var out=api('flowCodeSet',{name:name,code:source});
 assert(!out.ok,name+': refused '+JSON.stringify(out).substring(0,400));
 return out;
}
function applied(name,out,input){
 var patched=api('flowCodePatch',{name:name,revision:out.revision,edits:out.proposedPatch.edits});
 assert(patched.ok,name+': the proposal applies '+JSON.stringify(patched).substring(0,800));
 var run=api('flowCodeRun',{name:name,input:input||{}});
 assert(run.ok,name+': runs '+JSON.stringify(run).substring(0,800));
 return run.result;
}
try {
 // A member, an element and a quoted key of a block result, in result.* and local.* assignments
 assert(ran('Count',code('Count','result.count = list.filter({ items: [1, 2, 3], where: current > 1 }).length')).count===2,'a member of a block result is read');
 assert(ran('Second',code('Second','local.second = text.split({ text: "a,b", separator: "," })[1]\nresult.v = local.second')).v==='b','an element of a block result is read');
 assert(ran('Quoted',code('Quoted','result.v = json.parse({ text: input.json })["a-b"].c'),{json:'{"a-b":{"c":2}}'}).v===2,'a quoted key then a member are read');
 // The promoted source writes the block and the read as statements of their own
 var promoted=api('flowCodePromote',{name:'Count'});
 assert(promoted.ok,'promoted '+JSON.stringify(promoted).substring(0,400));
 var saved=api('flowCodeGet',{name:'Count'}).code;
 assert(saved.indexOf('local.countSource = list.filter(')>=0 && saved.indexOf('result.count = json.select({ source: local.countSource, path: "length" })')>=0,'block then read: '+saved);
 assert(ran('Count',saved).count===2,'the promoted source runs the same');
 // The local of the block never takes the name of a local the Flow already uses
 var kept=ran('Kept',code('Kept','local.vSource = "mine"\nresult.v = text.split({ text: "a,b", separator: "," }).length\nresult.kept = local.vSource'));
 assert(kept.v===2 && kept.kept==='mine','an existing local is kept: '+JSON.stringify(kept));
 // A call of anything but a block stays an expression
 assert(ran('Method',code('Method','result.n = input.s.trim().length'),{s:' a '}).n===1,'a method chain on a scope path is an expression');
 // A dynamic index is not a static member: refused with the intermediate to write, in both assignment forms
 ['Dynamic','DynamicConst'].forEach(function(name){
  var body=name==='Dynamic' ? 'local.k = 1\nresult.v = text.split({ text: "x,y", separator: "," })[local.k]'
   : 'local.k = 1\nconst x = text.split({ text: "x,y", separator: "," })[local.k]\nresult.v = x';
  var dynamic=refused(name,code(name,body));
  assert(dynamic.error.code==='FLOWSCRIPT_EXPRESSION_UNSUPPORTED','dynamic index refused: '+JSON.stringify(dynamic.error).substring(0,300));
  assert(dynamic.proposedPatch.edits[0].newText.indexOf('local.autoBlock1 = text.split({ text: "x,y", separator: "," })\n')>=0
   && dynamic.proposedPatch.edits[0].newText.indexOf('local.autoBlock1[local.k]')>=0,'intermediate proposed: '+JSON.stringify(dynamic.proposedPatch.edits));
  assert(applied(name,dynamic).v==='y','the proposal reads the element of local.k');
 });
 // A block result in a comparison: refused with the intermediate to write
 var compared=refused('Compared',code('Compared','result.all = list.filter({ items: [1, 2], where: current > 1 }).length === length([1, 2])'));
 assert(compared.proposedPatch.edits[0].newText.indexOf('local.autoBlock1 = list.filter({ items: [1, 2], where: current > 1 })\nresult.all = local.autoBlock1.length === length([1, 2])')>=0,'comparison intermediate: '+JSON.stringify(compared.proposedPatch.edits));
 assert(applied('Compared',compared).all===false,'the proposal compares the count');
 // A block in an object value: refused with the intermediate to write
 var inObject=refused('InObject',code('InObject','local.payload = { text: text.trim({ text: input.s }), n: 1 }\nresult.v = local.payload'));
 assert(inObject.proposedPatch.edits[0].newText.indexOf('local.autoBlock1 = text.trim({ text: input.s })\nlocal.payload = { text: local.autoBlock1, n: 1 }')>=0,'object intermediate: '+JSON.stringify(inObject.proposedPatch.edits));
 assert(applied('InObject',inObject,{s:' a '}).v.text==='a','the proposal trims');
 // A block in a per-item expression: the refusal says to iterate, never to assign it before the iteration
 var perItem=refused('PerItem',code('PerItem','local.rows = [{ d: "2026-01-02" }, { d: "2025-12-30" }]\nresult.v = list.filter({ items: local.rows, where: date.compare({ left: current.d, right: "2026-01-01" }) >= 0 })'));
 assert(perItem.error.message.indexOf('runs once per item')>=0 && perItem.error.message.indexOf('forEach({ items, $$nodes() { local.v = date.compare(')>=0 && perItem.error.message.indexOf('before the if')<0,'per-item advice: '+perItem.error.message);
 var iterated=ran('Iterated',code('Iterated','local.rows = [{ d: "2026-01-02" }, { d: "2025-12-30" }]\njson.array({ path: "local.kept", itemType: { type: "object" } })\nforEach({ items: local.rows, $$nodes() {\n  local.v = date.compare({ left: current.d, right: "2026-01-01" })\n  if (local.v >= 0) { json.push({ path: "local.kept", value: current }) }\n} })\nresult.v = local.kept'));
 assert(iterated.v.length===1 && iterated.v[0].d==='2026-01-02','the advised iteration keeps the matching item: '+JSON.stringify(iterated));
 // A block in a condition outside an iteration keeps the advice to assign it before the if
 var condition=refused('Condition',code('Condition','if (!input.s || !date.isValid({ value: input.s })) {\n  result.v = "bad"\n}'));
 assert(condition.error.message.indexOf('before the if')>=0,'condition advice: '+condition.error.message);
 print('source-block-member-assignment OK ('+checks+' checks)');
} finally { FU.deleteDirectory(project); }
