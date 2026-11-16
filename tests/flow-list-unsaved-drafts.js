var File=java.io.File,IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]).getCanonicalPath());
var __flowProjectDir=String(java.nio.file.Files.createTempDirectory('flow-unsaved-list-').toFile());
var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
function assert(ok,message){if(!ok)throw Error(message);}
var draft=JSON.parse(engine.flowCodeSet(JSON.stringify({projectDir:__flowProjectDir,name:'Draft',code:'function Draft({ input, config, result }) {\n result.ok = true\n}\n'})));
assert(draft.ok && draft.draft,'backend still creates a draft: '+JSON.stringify(draft));
function list(){var out=JSON.parse(engine.run(JSON.stringify({flowSource:'function Audit({ input, config, result }) {\n result.list = flow.list({ projectDir: "'+__flowProjectDir+'" })\n}\n'})));assert(out.ok,'list ran: '+JSON.stringify(out));return out.result.list;}
var out=list();
assert(out.unsavedSources.count===1 && out.unsavedSources.items[0].qname==='Draft','a new unsaved Flow appears without any file: '+JSON.stringify(out));
var saved=JSON.parse(engine.flowCodePromote(JSON.stringify({projectDir:__flowProjectDir,name:'Draft',revision:draft.revision})));
assert(saved.ok,'draft promotes: '+JSON.stringify(saved));
assert(list().unsavedSources.count===0,'promoted source is absent from the unsaved list');
print('flow-list-unsaved-drafts OK');
