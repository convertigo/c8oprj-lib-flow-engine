// Phase 1: source ownership, natural forms, labels, trivia, semantics and revisions.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-natural-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(v,m) { checks++; if (!v) throw new Error(m); }
function equal(a,b,m) { assert(JSON.stringify(a) === JSON.stringify(b),m+': '+JSON.stringify(a)+' != '+JSON.stringify(b)); }
try {
 var engine = eval(String(files.readFileToString(new java.io.File(engineDir,"Engine.js"),"UTF-8")));
 function api(method,args) { return JSON.parse(engine[method](JSON.stringify(args))); }
 function code(body) { return 'function Natural({ input, config, result }) {\n'+body+'\n}\n'; }
 function parse(text) { var v=api('flowSourceValidate',{name:'Natural',code:text}); assert(v.ok,'compile: '+JSON.stringify(v)); return v; }
 function format(v) { var out=api('flowSourceValidate',{name:'Natural',flowSource:v.source,includeHeader:false,includeImplicitReturn:false}); assert(out.ok,'format: '+JSON.stringify(out)); return out; }
 function run(text,input) { return api('run',{flowSource:text,input:input||{},includeTrace:true}); }
 function canonical(v) { function clean(x) { if (Array.isArray(x)) return x.map(clean); if(!x||typeof x!=='object')return x; var o={}; Object.keys(x).sort().forEach(function(k){if(k!=='__flowImplicitId'&&k!=='__flowNameExplicit'&&k.indexOf('__flowScript')!==0)o[k]=clean(x[k]);});return o; } return JSON.stringify(clean(v)); }
 function round(body,input) {
  var text=code(body), before=parse(text), after=format(before), twice=format(parse(after.code));
  equal(twice.code,after.code,'format twice');
  equal(canonical(after.definition),canonical(before.definition),'same tree');
  equal(run(after.code,input).result,run(text,input).result,'same execution');
  return after;
 }
 var emptyCall=parse(code('  result.epoch = date.now()'));
 assert(format(emptyCall).code.indexOf('date.now({})')>=0,'empty argument list is understood without a guess');
 var longSum=new Array(25).join('input.value + ')+'input.value';
 var wide=round('  result.total = '+longSum,{value:2});
 assert(wide.code.split('\n').every(function(line){return line.length<=120;}),'assignment width 120');
 var condition=new Array(15).join('input.value == 2 && ')+'input.value == 2';
 var wideIf=round('  if ('+condition+') {\n    result.ok = true\n  }',{value:2});
 assert(wideIf.code.split('\n').every(function(line){return line.length<=120;}),'if width 120');
 var wideCall=round('  local.rows = list.filter({items:[2],where:'+condition+'})\n  result.rows = local.rows',{value:2});
 assert(wideCall.code.split('\n').every(function(line){return line.length<=120;}),'catalog expression width 120');
 var commentText=new Array(150).join('x');
 assert(round('  // '+commentText+'\n  result.ok = true').code.indexOf('// '+commentText)>=0,'comments never reflow');
 var first=round('  result.answer = input.value + 1',{value:4});
 assert(first.code.indexOf('result.answer = input.value + 1')>=0 && first.code.indexOf('$$id')<0,'natural set');
 equal(first.definition.nodes[0].id,'answer','assignment name');
 var control=round('  checkName: if (input.value > 0) {\n    result.answer = 1\n  } else {\n    result.answer = 2\n  }',{value:0});
 assert(control.code.indexOf('checkName: if (')>=0,'if label');
 round('  throw { code: "BAD", message: "Invalid", status: 400 }');
 var returned=round('  return { answer: input.value + 1 }\n  result.unreachable = true',{value:2});
 assert(run(returned.code,{value:2}).result.unreachable===undefined,'root return stops');
 round('  if (input.value) {\n    return\n  }\n  result.answer = 2',{value:true});
 var labeled=round('  cleanName: local.name = text.trim({ text: " A " })\n  inside: local.n = 3\n  result.name = local.name');
 assert(labeled.code.indexOf('cleanName: local.name = text.trim(')>=0,'call label');
 var legacy=round('  set({ $$id: "answer", path: "result.answer", value: 3 })\n  text.trim({ text: "ok" })');
 assert(legacy.code.indexOf('$$id')<0 && legacy.code.indexOf('answer:')<0,'redundant explicit removed');
 var names=parse(code('  if (true) {\n    text.trim({ text: "first" })\n  }\n  if (true) {\n    text.trim({ text: "second" })\n  }')).definition;
 equal(names.nodes.map(function(n){return n.id;}),['if','if2'],'source counters');
 equal(names.nodes[1].then[0].id,'trim2','local call name');
 var reserved=parse(code('  if2: if (true) {\n  }\n  if (true) {\n  }\n  if (true) {\n  }')).definition;
 assert(reserved.nodes[2].id!=='if2','skip explicit reservation');
 var duplicate=api('flowCodeSet',{name:'Dup',code:'function Dup(){\n x: result.a = 1\n x: result.b = 2\n}'});
 assert(!duplicate.ok && JSON.stringify(duplicate).indexOf('FLOWSCRIPT_DUPLICATE_EXPLICIT_NAME')>=0,'duplicate labels rejected');
 var trivia=round('  // Attached exactly\n  //  Two spaces stay\n  result.a = 1\n\n  // Standalone\n\n  result.b = 2\n  // Tail');
 assert(trivia.definition.nodes[0].comment==='Attached exactly\n Two spaces stay','attached comment');
 assert(trivia.definition.nodes[1].block==='comment' && !Object.keys(trivia.definition.nodes[1].props).length,'comment node');
 assert(trivia.definition.nodes[2].__flowBlankBefore,'blank before');
 var trace=run(trivia.code).trace||[];
 assert(JSON.stringify(trace).indexOf('"block":"comment"')<0,'comments absent from runtime');
 round('  if({ condition:true, $$then:function(){\n    // Inside slot\n    result.a = 1\n\n    // End of slot\n  } })');
 ['set({ $$disabled: true, path: "result.a", value: 1 })','set({ path: "result.a", value: 1, extra: 2 })'].slice(0,1).forEach(function(body){assert(round('  '+body).code.indexOf('set({')>=0,'fallback call');});
 var inline = round('  local.names = list.map({ items: [" A "," B "], select: text.trim({ $$id: "clean", text: current }) })\n  result.names = local.names');
 assert(inline.code.indexOf('select: text.trim({ $$id: "clean"')>=0,'inline property retains $$id');
 equal(run(inline.code).result.names,['A','B'],'inline mapper execution');
 var invalidInline=api('flowCodeSet',{name:'InlineBad',code:'function InlineBad(){\n  local.rows = list.map({items:["x"],select:text.trim({typo:current})})\n}'});
 assert(!invalidInline.ok && JSON.stringify(invalidInline).indexOf('UNKNOWN_BLOCK_PROPERTY')>=0,'inline calls keep catalog property validation');
 assert(JSON.stringify(invalidInline).indexOf('"line":2')>=0,'inline diagnostics use authored statement line');
 var sessionA='function Session(){\n result.a = 1\n result.a = 2\n}';
 var sessionSet=api('flowCodeSet',{name:'Session',code:sessionA});assert(sessionSet.ok,'session fixture');
 var sessionPatch=api('flowCodePatch',{name:'Session',revision:sessionSet.revision,edits:[{oldText:' result.a = 1',newText:' result.a = 0\n result.a = 1'}]});assert(sessionPatch.ok,'insert above');
 var sessionRun=api('flowCodeRun',{name:'Session',includeTrace:true});
 var sessionTrace=JSON.stringify(sessionRun.trace || []);
 assert(sessionTrace.indexOf('a3')>=0,'insert gets next counter: '+JSON.stringify(sessionRun));
 var sessionPromote=api('flowCodePromote',{name:'Session',revision:sessionPatch.revision});assert(sessionPromote.ok,'session promote '+JSON.stringify(sessionPromote));
 var sessionCode=api('flowCodeGet',{name:'Session'}).code;
 assert(sessionCode.indexOf('a3:')<0,'implicit session name must not become a permanent label');
 var afterPromote=api('flowCodeRun',{name:'Session',includeTrace:true});
 assert(JSON.stringify(afterPromote.trace).indexOf('a3')>=0,'session survives promote');
 var sessionExplicit=api('flowCodeSet',{name:'Session',code:'function Session(){\n a3: result.explicit = 0\n result.a = 1\n result.a = 2\n}' });
 assert(sessionExplicit.ok,'explicit names reserve old implicit names: '+JSON.stringify(sessionExplicit));
 var explicitRun=api('flowCodeRun',{name:'Session',includeTrace:true});assert(explicitRun.ok,'reserved explicit executes');
 var branches='function BranchNames(){\n  if (input.a) {\n    return {ok:true}\n  }\n  if (input.b) {\n    return {ok:true}\n  }\n}';
 var branchSet=api('flowCodeSet',{name:'BranchNames',code:branches});assert(branchSet.ok,'branch identity fixture');
 var branchPatch=api('flowCodePatch',{name:'BranchNames',revision:branchSet.revision,edits:[{oldText:'  if (input.a)',newText:'  if (input.c) {\n    return {ok:true}\n  }\n  if (input.a)'}]});assert(branchPatch.ok,'insert branch');
 var branchRun=api('flowCodeRun',{name:'BranchNames',input:{a:true},includeTrace:true});
 assert(branchRun.ok && JSON.stringify(branchRun.trace).indexOf('"id":"ok"')>=0 && JSON.stringify(branchRun.trace).indexOf('"id":"return"')>=0,'unchanged branch retains identical return children: '+JSON.stringify(branchRun));
 var newBranchRun=api('flowCodeRun',{name:'BranchNames',input:{c:true},includeTrace:true});
 assert(newBranchRun.ok && JSON.stringify(newBranchRun.trace).indexOf('"id":"ok3"')>=0 && JSON.stringify(newBranchRun.trace).indexOf('"id":"return3"')>=0,'inserted branch receives new child counters');
 var renameRaw='function RenameProof(){\n  result.answer = 1\n}';
 assert(api('flowCodeSet',{name:'RenameProof',code:renameRaw}).ok,'rename session');
 var named=api('applyMutation',{target:'flow',name:'RenameProof',flowSource:renameRaw,mutation:{op:'replace',nodeId:'answer',property:'$$id',value:'chosen'}});
 assert(named.ok && named.source.indexOf('chosen:')>=0,'Studio Rename writes a label');
 var renamedBack=api('applyMutation',{target:'flow',name:'RenameProof',flowSource:named.source,mutation:{op:'replace',nodeId:'chosen',property:'$$id',value:'answer'}});
 assert(renamedBack.ok && renamedBack.source.indexOf('chosen:')<0 && renamedBack.source.indexOf('answer:')<0,'Rename back removes label');
 var renameRun=api('run',{name:'RenameProof',flowSource:renamedBack.source,includeTrace:true});
 assert(renameRun.ok && JSON.stringify(renameRun.trace).indexOf('"id":"answer"')>=0,'Rename back retains implicit name: '+JSON.stringify(renameRun));
 var reserveSet=api('flowCodeSet',{name:'InlineReserve',code:'function InlineReserve(){\n  result.a = 1\n}'});
 var reservePatch=api('flowCodePatch',{name:'InlineReserve',revision:reserveSet.revision,edits:[{oldText:'  result.a = 1',newText:'  local.rows = list.map({items:[1],select:text.trim({$$id:"a",text:current})})\n  result.a = 1'}]});
 assert(reservePatch.ok,'inline explicit name reservation');
 var reserveRun=api('flowCodeRun',{name:'InlineReserve',includeTrace:true});
 assert(reserveRun.ok && JSON.stringify(reserveRun.trace).indexOf('"id":"a2"')>=0,'inline explicit name wins over retained implicit name');
 var raw='function Ownership(){\r\n  result.x=1   \r\n}';
 var saved=api('flowCodeSet',{name:'Ownership',code:raw}); assert(saved.ok,'set raw');
 equal(api('flowCodeGet',{name:'Ownership'}).code,raw,'draft is byte exact');
 var promoted=api('flowCodePromote',{name:'Ownership',revision:saved.revision}); assert(promoted.ok,'promote '+JSON.stringify(promoted));
 assert(promoted.linted===true && promoted.changedLines>0,'promote lint report');
 var formatted=api('flowCodeGet',{name:'Ownership'});
 var unchanged=api('flowCodeSet',{name:'Ownership',code:formatted.code}); assert(unchanged.ok,'already canonical');
 equal(unchanged.revision,formatted.revision,'unchanged revision');
 var intuitive='function Guess(){\n  result.x = text.trim(" A ")\n}';
 var refused=api('flowCodeSet',{name:'Guess',code:intuitive,autoCorrect:true});
 assert(!refused.ok && refused.proposedPatch && refused.proposedPatch.edits.length,'guess is proposal: '+JSON.stringify(refused));
 equal(api('flowCodeGet',{name:'Guess'}).code,intuitive,'autoCorrect never mutates');
 print('source-natural-phase1 OK ('+checks+' checks)');
} finally { files.deleteDirectory(project); }
