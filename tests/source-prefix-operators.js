// Rhino bounds a prefix unary node (!x, -x, typeof x) by its operand alone. Every proposal built by slicing the source
// keeps the operator in place: a call rewritten by the resolver, a positional literal, a lifted statement, metadata.
var engineDir = String(new java.io.File(arguments[0] || '_flow').getCanonicalPath());
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory('flow-prefix-operators-').toFile();
var __flowProjectDir = String(project.getCanonicalPath());
var FU = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
var engine=eval(String(FU.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
function api(n,r){return JSON.parse(engine[n](JSON.stringify(r)));}
function code(name,body){return 'function '+name+'({ input, result }) {\n'+body+'\n}';}
function proposal(name,source){
 var out=api('flowCodeSet',{name:name,code:source});
 assert(!out.ok && out.proposedPatch && out.proposedPatch.edits.length,name+': a proposal is expected '+JSON.stringify(out).substring(0,800));
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
 // A JavaScript global rewritten as a block keeps the operator of its argument
 var negated=proposal('Negated',code('Negated','result.v = JSON.stringify(!input.flag)'));
 assert(negated.proposedPatch.edits[0].newText==='json.stringify({ value: !input.flag })','! kept in the rewritten argument: '+JSON.stringify(negated.proposedPatch.edits));
 assert(applied('Negated',negated,{flag:true}).v==='false','the applied proposal keeps the guard negated');
 var typed=proposal('Typed',code('Typed','result.v = JSON.stringify(typeof input.x)'));
 assert(typed.proposedPatch.edits[0].newText==='json.stringify({ value: typeof input.x })','typeof kept: '+JSON.stringify(typed.proposedPatch.edits));
 var logged=proposal('Logged',code('Logged','console.log(-input.n)'));
 assert(logged.proposedPatch.edits[0].newText==='log({ message: -input.n })','unary minus kept: '+JSON.stringify(logged.proposedPatch.edits));
 // A negative positional literal is a number literal, sign included
 var added=proposal('Added',code('Added','result.v = number.add(5, -2)'));
 assert(added.proposedPatch.edits[0].newText==='number.add({ left: 5, right: -2 })','negative literal kept: '+JSON.stringify(added.proposedPatch.edits));
 assert(applied('Added',added).v===3,'the applied proposal adds -2');
 // Text between an operator and its operand cannot be kept: no proposal, rather than one without the operator
 var commented=api('flowCodeSet',{name:'Commented',code:code('Commented','result.v = JSON.stringify(! /* note */ input.flag)')});
 assert(!commented.ok && !(commented.proposedPatch && commented.proposedPatch.edits.some(function(e){return e.newText.indexOf('!')<0;})),'a commented operator is never dropped: '+JSON.stringify(commented.proposedPatch));
 // A lifted statement keeps its own operator; the intermediate assignment does not take it
 var lifted=proposal('Lifted',code('Lifted','!text.trim({text: text.trim({text: " a "})})')).proposedPatch.edits[0].newText;
 assert(lifted.indexOf('\n!local.autoBlock2\n')>=0 && lifted.indexOf('!local.autoBlock1')<0,'operator stays on its statement: '+lifted);
 // Literal metadata with a negative number is literal metadata
 var meta=proposal('Meta','_flow({ inputs: { n: { type: "number", visibility: -1 } } })\n'+code('Meta','result.v = input.n'));
 assert(meta.proposedPatch.edits[0].newText==='const _flow = { inputs: { n: { type: "number", visibility: -1 } } }','metadata declaration proposed: '+JSON.stringify(meta.proposedPatch.edits));
 assert(applied('Meta',meta,{n:4}).v===4,'the declared metadata runs');
 // Invariant: should positions regress (raw Rhino bounds), a rewrite losing an operator is refused, never proposed
 function module(name){return eval(String(FU.readFileToString(new java.io.File(engineDir,'modules/'+name),'UTF-8')));}
 var parser=module('flow-script-parser-service.js'),resolver=module('intuitive-call-resolver.js');
 assert(parser.prefixOperatorCount('a && !b && -c')===2 && parser.prefixOperatorCount('a &&')===null,'prefix operators counted');
 var raw=resolver.resolve({'json.stringify':{}},'result.v = JSON.stringify(!input.flag)',{},{sourceStart:function(node){return Number(node.getAbsolutePosition());},prefixOperatorCount:parser.prefixOperatorCount});
 assert(!raw.edits.length && raw.unresolved.length===1 && raw.unresolved[0].reason.indexOf('prefix operator')>=0,'a lost operator is refused: '+JSON.stringify(raw));
 print('source-prefix-operators OK ('+checks+' checks)');
} finally { FU.deleteDirectory(project); }
