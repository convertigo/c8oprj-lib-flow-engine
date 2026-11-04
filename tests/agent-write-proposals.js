var engineDir=String(arguments[0]), File=java.io.File, FU=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=engineDir, temp=java.nio.file.Files.createTempDirectory('flow-write-proposals-').toFile(), __flowProjectDir=String(temp);
var engine=eval(String(FU.readFileToString(new File(engineDir,'Engine.js'),'UTF-8'))), checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
function api(n,r){return JSON.parse(engine[n](JSON.stringify(r)));}
function source(body){return 'function Example({input,result}) {\n'+body+'\n}\n';}
function propose(code){return api('flowCodeSet',{name:'Example',code:code});}
try {
 var code=source('forEach({items:[1,2], $$nodes: function () {\n result.n = current\n})');
 var r=propose(code);assert(!r.ok && r.written && r.proposedPatch,'missing brace proposal '+JSON.stringify(r));
 assert(api('flowCodeGet',{name:'Example'}).code===code,'source preserved');
 var edit=r.proposedPatch.edits[0];assert(edit.oldText && edit.before===edit.oldText && edit.after===edit.newText && edit.line,'complete edit');
 var fixed=api('flowCodePatch',{name:'Example',revision:r.revision,edits:r.proposedPatch.edits});assert(fixed.ok,'brace patch compiles '+JSON.stringify(fixed));
 r=propose(source('try({$$try(){ forEach({items:[1], $id:"each", $nodes: function () { result.n = current }}) }, $$catch(){result.failed=true}})'));
 assert(!r.ok && r.proposedPatch,'dollar proposal');fixed=api('flowCodePatch',{name:'Example',revision:r.revision,edits:r.proposedPatch.edits});assert(fixed.ok,'dollar patch compiles '+JSON.stringify(fixed));
 r=propose(source('throw {code:input.code,message:"failed"}'));
 assert(!r.ok && r.proposedPatch && r.proposedPatch.requiresChoice,'literal error code choice '+JSON.stringify(r));
 assert(r.proposedPatch.edits[0].newText.indexOf('CHOOSE_ERROR_CODE')>=0,'never guess error code');
 print('agent-write-proposals OK ('+checks+' checks)');
} finally {FU.deleteDirectory(temp);}
