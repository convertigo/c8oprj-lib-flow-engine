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
 code=source('result.items = list.filter({items:input.items, condition:current.enabled})');
 r=propose(code);assert(!r.ok && r.proposedPatch,'filter predicate offers a patch '+JSON.stringify(r));
 assert(api('flowCodeGet',{name:'Example'}).code===code,'filter correction never silently writes');
 fixed=api('flowCodePatch',{name:'Example',revision:r.revision,edits:r.proposedPatch.edits});assert(fixed.ok,'filter patch compiles '+JSON.stringify(fixed));
 var executed=api('run',{flowSource:api('flowCodeGet',{name:'Example'}).code,input:{items:[{enabled:true},{enabled:false}]}});
 assert(executed.ok && executed.result.items.length===1,'predicate executes per item '+JSON.stringify(executed));
 code=source('result.text = input.flag ? "kept" : JSON.stringify(input.value)');
 r=propose(code);assert(!r.ok && r.proposedPatch,'JSON expression offers explicit patch');
 fixed=api('flowCodePatch',{name:'Example',revision:r.revision,edits:r.proposedPatch.edits});assert(fixed.ok,'JSON expression patch compiles '+JSON.stringify(fixed));
 executed=api('run',{flowSource:api('flowCodeGet',{name:'Example'}).code,input:{flag:false,value:[1,2]}});assert(executed.ok && executed.result.text==='[1,2]','JSON expression preserves data');
 executed=api('run',{flowSource:api('flowCodeGet',{name:'Example'}).code,input:{flag:true}});assert(executed.ok && executed.result.text==='kept','JSON expression preserves lazy branch');
 var ambiguity=propose(source('result.items=list.filter({items:input.items, where:current.active, condition:current.enabled})'));
 assert(!ambiguity.ok && !(ambiguity.proposedPatch && ambiguity.proposedPatch.edits.some(function(e){return /FLOWSCRIPT_FILTER_PREDICATE/.test(JSON.stringify(e));})),'never replace an existing predicate');
 print('agent-write-proposals OK ('+checks+' checks)');
} finally {FU.deleteDirectory(temp);}
