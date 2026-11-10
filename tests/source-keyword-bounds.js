// Rhino bounds a keyword literal (null, true, false, this) followed by another token with that token ("null,",
// "true)"), and a node ending with one inherits that end. Every text sliced by position ends at the keyword: a
// rewritten call, a positional literal, a lowered operand, metadata where an input is declared.
var engineDir = String(new java.io.File(arguments[0] || '_flow').getCanonicalPath());
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory('flow-keyword-bounds-').toFile();
var __flowProjectDir = String(project.getCanonicalPath());
var FU = Packages.org.apache.commons.io.FileUtils, checks = 0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
var engine=eval(String(FU.readFileToString(new java.io.File(engineDir,'Engine.js'),'UTF-8')));
function api(n,r){return JSON.parse(engine[n](JSON.stringify(r)));}
function code(name,body){return 'function '+name+'({ input, result }) {\n'+body+'\n}';}
function proposal(name,source){
 var out=api('flowCodeSet',{name:name,code:source});
 assert(out.proposedPatch && out.proposedPatch.edits.length,name+': a proposal is expected '+JSON.stringify(out).substring(0,800));
 return out;
}
function applied(name,out,input){
 var patched=api('flowCodePatch',{name:name,revision:out.revision,edits:out.proposedPatch.edits});
 assert(patched.ok,name+': the proposal applies '+JSON.stringify(patched).substring(0,800));
 var run=api('flowCodeRun',{name:name,input:input||{}});
 assert(run.ok,name+': runs '+JSON.stringify(run).substring(0,800));
 return run.result;
}
function ran(name,source,input){
 var out=api('flowCodeSet',{name:name,code:source});
 assert(out.ok,name+': accepted '+JSON.stringify(out).substring(0,800));
 var run=api('flowCodeRun',{name:name,input:input||{}});
 assert(run.ok,name+': runs '+JSON.stringify(run).substring(0,800));
 return run.result;
}
try {
 // The parser helper: a keyword literal ends with its keyword, and so does a node ending with one
 var parser=eval(String(FU.readFileToString(new java.io.File(engineDir,'modules/flow-script-parser-service.js'),'UTF-8')));
 function ends(source,simpleName){
  var options=new Packages.org.mozilla.javascript.CompilerEnvirons();options.setLanguageVersion(200);
  var out=[];
  new Packages.org.mozilla.javascript.Parser(options).parse(source,'keyword-bounds',1).visit(new Packages.org.mozilla.javascript.ast.NodeVisitor({visit:function(node){
   if(String(node.getClass().getSimpleName())===simpleName)out.push(source.substring(parser.sourceStart(node,source),parser.sourceEnd(node,source)));
   return true;
  }}));
  return out;
 }
 assert(ends('f(a, null, true)','KeywordLiteral').join('|')==='null|true','keyword literals end with their keyword: '+ends('f(a, null, true)','KeywordLiteral'));
 assert(ends('x = { b: false}','ObjectProperty')[0]==='b: false','a property ends with its keyword value: '+ends('x = { b: false}','ObjectProperty'));
 assert(ends('f(a || null, c ? 1 : this)','InfixExpression')[0]==='a || null' && ends('f(a || null, c ? 1 : this)','ConditionalExpression')[0]==='c ? 1 : this','an operation ends with its keyword operand');
 assert(ends('f(!true, 1)','UnaryExpression')[0]==='!true','a prefix operator and its keyword operand are kept whole');
 assert(ends('x = null;\ny = 1','ExpressionStatement')[0]==='x = null;' && ends('x = null\ny = 1','ExpressionStatement')[0]==='x = null','a statement keeps its own semicolon, never the next line');
 // A JavaScript global rewritten as a block: JSON.stringify(value, null, indent) is json.stringify with pretty
 var pretty=proposal('Pretty',code('Pretty','result.v = JSON.stringify(input.x, null, 2)'));
 assert(pretty.proposedPatch.edits[0].newText==='json.stringify({ value: input.x, pretty: true })','null replacer recognized: '+JSON.stringify(pretty.proposedPatch.edits));
 assert(applied('Pretty',pretty,{x:{a:1}}).v==='{\n  "a": 1\n}','the applied proposal writes indented JSON');
 var negated=proposal('NegatedKeyword',code('NegatedKeyword','result.v = JSON.stringify(!true, null, 2)'));
 assert(negated.proposedPatch.edits[0].newText==='json.stringify({ value: !true, pretty: true })','operator and keyword kept: '+JSON.stringify(negated.proposedPatch.edits));
 // A positional keyword argument is a literal of its own type, written as it is
 var positional=proposal('Positional',code('Positional','result.v = json.stringify(input.x, true)'));
 assert(positional.proposedPatch.edits[0].newText==='json.stringify({ value: input.x, pretty: true })','true named by its type: '+JSON.stringify(positional.proposedPatch.edits));
 var split=proposal('Split',code('Split','result.v = text.split(input.s, ",", true)'));
 assert(split.proposedPatch.edits[0].newText==='text.split({ text: input.s, separator: ",", trim: true })','true sliced exactly: '+JSON.stringify(split.proposedPatch.edits));
 var nulled=proposal('Nulled',code('Nulled','result.v = number.add(5, null)'));
 assert(nulled.proposedPatch.edits[0].newText==='number.add({ left: 5, right: null })','null sliced exactly: '+JSON.stringify(nulled.proposedPatch.edits));
 // An input declared after a last metadata property whose value is a keyword lands inside the object
 var declared=proposal('Declared','const _flow = { sourceVersion: 2, hidden: true}\n'+code('Declared','result.v = input.s'));
 assert(declared.proposedPatch.edits[0].newText.indexOf('hidden: true, "inputs": {')>=0,'input declared inside the metadata: '+JSON.stringify(declared.proposedPatch.edits));
 assert(applied('Declared',declared,{s:'x'}).v==='x','the declared input runs');
 // An operand ending with a keyword lowers whole, whatever follows it
 assert(ran('Joined',code('Joined','result.v = input.flag===true&&text.trim({ text: input.s })'),{flag:true,s:' a '}).v==='a','a keyword before && lowers');
 assert(ran('Chosen',code('Chosen','result.v = text.trim({ text: input.s }) ? null: input.s'),{s:' a '}).v===null,'a keyword before : lowers');
 print('source-keyword-bounds OK ('+checks+' checks)');
} finally { FU.deleteDirectory(project); }
