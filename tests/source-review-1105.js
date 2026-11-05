// The statement-only root keeps the same static contracts as the function form.
var dir=new java.io.File(arguments[0]).getCanonicalFile(),__flowEngineDir=String(dir);
var FU=Packages.org.apache.commons.io.FileUtils,File=java.io.File,checks=0;
var project=java.nio.file.Files.createTempDirectory('flow-review-metadata-').toFile(),__flowProjectDir=String(project);
function read(f){return String(FU.readFileToString(f,'UTF-8'));}
function assert(v,m){checks++;if(!v)throw Error(m);}
try{
 var engine=eval(read(new File(dir,'Engine.js')));
 function api(n,a){return JSON.parse(engine[n](JSON.stringify(a)));}
 var corpus=JSON.parse(read(new File(dir,'../tests/fixtures/source-metadata-values.json')));
 corpus.valid.forEach(function(c,i){
  var code='const _flow = {config:{sample:'+c.source+'}}\nresult.sample = config.sample';
  var bare=api('flowSourceValidate',{name:'Value'+i,code:code});
  assert(bare.ok&&JSON.stringify(bare.definition.flow.config.sample)===JSON.stringify(c.value),'literal metadata preserved '+i);
  var set=api('flowCodeSet',{name:'Value'+i,code:code}),before=api('flowCodeRun',{name:'Value'+i});
  assert(set.ok&&before.ok&&JSON.stringify(before.result.sample)===JSON.stringify(c.value),'default active before promote '+i);
  assert(api('flowCodePromote',{name:'Value'+i,revision:set.revision}).ok,'bare metadata promotes '+i);
  assert(JSON.stringify(api('flowCodeRun',{name:'Value'+i}).result)===JSON.stringify(before.result),'runtime unchanged at promote '+i);
 });
 corpus.invalid.forEach(function(token){
  assert(!api('flowSourceValidate',{code:'const _flow={config:{sample:'+token+'}}\nresult.keep = 7'}).ok,'bare root rejects dynamic metadata');
 });
 var metadata='const _flow={sourceVersion:2,config:{value:7},inputs:{name:{type:"string",default:"friend"}},tests:{example:{name:"Ada"}},outputs:{type:"object",properties:{value:{type:"number"},name:{type:"string"}}}}\n';
 var body='result.value = config.value\nresult.name = input.name';
 var bare=api('flowSourceValidate',{code:metadata+body}),wrapped=api('flowSourceValidate',{code:metadata+'function Wrapped({input,config,result}){\n'+body+'\n}'});
 assert(bare.ok&&wrapped.ok&&JSON.stringify(bare.definition.flow)===JSON.stringify(wrapped.definition.flow),'inputs/defaults/tests/outputs have identical contracts');
 var set=api('flowCodeSet',{name:'Contracts',code:metadata+body});
 assert(set.ok&&set.inputDefinitions.name.default==='friend'&&set.testCases.example.name==='Ada','authoring exposes defaults and tests');
 var before=api('flowCodeRun',{name:'Contracts'});
 assert(before.ok&&before.result.value===7,'bare config default active');
 assert(api('flowCodePromote',{name:'Contracts',revision:set.revision}).ok,'contract promotion');
 assert(JSON.stringify(api('flowCodeRun',{name:'Contracts'}).result)===JSON.stringify(before.result),'default input behavior preserved at promote');
 var reserved='const _flow={config:{sample:{"__proto__":{value:3},constructor:"data",prototype:"data",helpers:[]}}}\nresult.sample = config.sample';
 var parsed=api('flowSourceValidate',{code:reserved});
 assert(parsed.ok&&Object.prototype.hasOwnProperty.call(parsed.definition.flow.config.sample,'__proto__'),'reserved business keys retained');
 var oldLocal=api('flowCodeSet',{name:'OldLocal',code:'const _flow={sourceVersion:2}\nresult.value = _flow.sourceVersion'});
 assert(!oldLocal.ok,'metadata is not a runtime local; compatibility change explicit');
 var comment='// This header explains the project.\nconst _flow={sourceVersion:2}\nresult.value = 7';
 var commented=api('flowCodeSet',{name:'Commented',code:comment});
 assert(commented.ok&&api('flowCodeGet',{name:'Commented'}).code===comment,'header comment retained in submitted draft');
 assert(api('flowCodePromote',{name:'Commented',revision:commented.revision}).ok&&api('flowCodeRun',{name:'Commented'}).result.value===7,'comment case preserves program');
 var saved=api('flowCodeGet',{name:'Commented'}).code;
 print(JSON.stringify({program:'source-review-1105',passed:true,checks:checks,headerCommentPreserved:saved.indexOf('This header explains')>=0}));
}finally{FU.deleteDirectory(project);}
