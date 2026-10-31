var File=java.io.File,files=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var project=java.nio.file.Files.createTempDirectory('flow-night-authoring-').toFile();
var __flowProjectDir=String(project.getCanonicalPath());
var engine=eval(String(files.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
function api(method,request){return JSON.parse(engine[method](JSON.stringify(request)));}
function assert(value,msg){if(!value)throw Error(msg);}
['$nodes','$$$nodes'].forEach(function(sigil,index){
 var source='function Slots'+index+'({input,result}) {\n forEach({items:[1,2],'+sigil+':function(){result.n=1}})\n}';
 var refused=api('flowCodeSet',{name:'Slots'+index,code:source});assert(!refused.ok,'without autoCorrect a bad slot stays refused');
 var corrected=api('flowCodeSet',{name:'Slots'+index,code:source,autoCorrect:true});
 assert(corrected.ok && corrected.fixes.some(function(f){return f.code==='FLOWSCRIPT_SLOT_SIGIL_CORRECTED';}),'known function slot repaired and reported: '+JSON.stringify(corrected));
 assert(corrected.code.indexOf('$$nodes')>=0,'canonical double sigil');
});
var draft=api('flowCodeSet',{name:'Same',code:'function Same({result}) {\n result.value=1\n}'});
assert(draft.ok,'initial draft');
var promoted=api('flowCodePromote',{name:'Same',revision:draft.revision});assert(promoted.ok,'promoted');
var saved=api('flowCodeGet',{name:'Same'});
var same=api('flowCodePatch',{name:'Same',revision:saved.revision,edits:[{oldText:'result.value',newText:'result.value'}]});
assert(same.ok && same.unchanged===true && same.written===false && same.draft===false,'identity patch leaves saved Flow active: '+JSON.stringify(same));
assert(!/promote/.test(same.next),'no new promote instruction');
var status=api('flowCodeStatus',{name:'Same'});assert(!status.dirty,'identity patch creates no dirty draft');
print('night-authoring-regressions OK');
