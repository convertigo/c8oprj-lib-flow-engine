// Native DBO properties are checked before setters; business input coercion is a different contract.
var root=new java.io.File(arguments[0]).getCanonicalFile(),files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('flow-native-properties-').toFile();
var __flowEngineDir=String(root),__flowProjectDir=String(project),__nativeProbeFlow;
var assertions=0,failures=[];
function assert(v,m){assertions++;if(!v)failures.push(m);}
try{
 var contract=eval(String(files.readFileToString(new java.io.File(root,'modules/native-property-contract.js'),'UTF-8')));
 var source=String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8'));
 source=source.replace('function projectFlowBeanLookup(name, request) {','function projectFlowBeanLookup(name, request) { if (__nativeProbeFlow) return {flow:__nativeProbeFlow,projectName:"Probe",flowName:name};');
 var engine=eval(source);
 function api(m,r){return JSON.parse(engine[m](JSON.stringify(r)));}
 function code(meta){return '// the word required here must not be a location\nconst _flow = '+JSON.stringify(meta,null,2)+'\nfunction Probe({result}) {\n result.ok = true\n}';}
 function diagnostic(r){return r.error&&r.error.diagnostics&&r.error.diagnostics[0]||r.error&&r.error.details&&r.error.details.diagnostics&&r.error.details.diagnostics[0]||r.diagnostics&&r.diagnostics[0];}
 function rejected(meta,path){
  var sourceText=code(meta),lastKey=path.substring(path.lastIndexOf('.')+1),expectedLine=0;
  sourceText.split('\n').forEach(function(line,index){if(!expectedLine&&line.indexOf('"'+lastKey+'":')>=0)expectedLine=index+1;});
  ['flowCodeCheck','flowCodeSet'].forEach(function(m){
   var r=api(m,{name:'Probe',code:sourceText,maxDiagnostics:25}),d=diagnostic(r);
   assert(!r.ok,m+' must reject '+JSON.stringify(meta));
   assert(d&&d.line===expectedLine&&d.message.indexOf(path)>=0&&d.message.indexOf('takes')>=0,'Property, accepted value and exact source line '+expectedLine+': '+JSON.stringify(r));
  });
 }
 ['abc','Bogus','yes',60,null,{},[]].forEach(function(v){
  rejected({inputs:{x:{type:'integer',required:v}}},'_flow.inputs.x.required');
  rejected({authenticatedContextRequired:v},'_flow.authenticatedContextRequired');
  rejected({inputs:{x:{type:'array',isFileUpload:v}}},'_flow.inputs.x.isFileUpload');
 });
 ['abc','Bogus','yes','private',16,-2,2147483648,1.5,true,null].forEach(function(v){rejected({inputs:{x:{type:'string',visibility:v}}},'_flow.inputs.x.visibility');});
 ['abc','Bogus','yes',' 60 ',60,{},null].forEach(function(v){rejected({accessibility:v},'_flow.accessibility');});
 ['Bogus','abc','yes',{},60,null].forEach(function(v){rejected({inputs:{x:{type:v}}},'_flow.inputs.x.type');});
 rejected({inputs:{x:{type:'integer',default:'abc'}}},'_flow.inputs.x.default');
 rejected({inputs:{x:{type:'string',description:{bad:true}}}},'_flow.inputs.x.description');
 // DBO.setName normalizes dollar signs; reject the external signature instead of renaming it.
 var nativeName=new Packages.com.twinsoft.convertigo.beans.variables.RequestableVariable();nativeName.setName('$records');
 assert(String(nativeName.getName())==='_records','The real native bean silently normalizes a dollar sign');
 rejected({inputs:{'$records':{type:'integer'}}},'_flow.inputs.$records');
 rejected({inputs:{'cost$value':{type:'integer'}}},'_flow.inputs.cost$value');
 // Each source fix must say what changed; no string truthiness and no fallback enum.
 var raw={accessibility:' Private ',authenticatedContextRequired:' TRUE ',inputs:{x:{type:' INTEGER ',required:' false ',visibility:' -1 ',description:'Keep text spaces '},files:{type:'array',isFileUpload:'TRUE',multi:' true '}}};
 var check=api('flowCodeCheck',{name:'Probe',code:code(raw),maxDiagnostics:25});
 assert(check.ok,'Safe metadata spellings accepted: '+JSON.stringify(check));
 assert((check.diagnostics||[]).filter(function(d){return d.code==='NATIVE_PROPERTY_NORMALIZED'&&d.line>1;}).length===7,'Passive check signals all seven canonicalizations');
 var set=api('flowCodeSet',{name:'Probe',code:code(raw),maxDiagnostics:25});
 if(!set.ok)throw new Error('Normalization failed: '+JSON.stringify(set));
 assert(set.ok&&set.fixes&&set.fixes.length===7,'code-set returns seven fixes: '+JSON.stringify(set));
 assert(set.code&&set.code.indexOf('"required": false')>=0&&set.code.indexOf('"visibility": -1')>=0,'Source contains canonical values');
 assert(set.inputDefinitions&&set.inputDefinitions.x.required===false&&set.inputDefinitions.x.type==='integer','Normalized definitions returned to Java and MCP');
 assert(set.fixes&&set.fixes.every(function(f){return f.line>1&&f.property&&f.before!==f.after;}),'Every correction identifies its property and original line');
 __nativeProbeFlow=new Packages.com.twinsoft.convertigo.beans.flow.Flow();__nativeProbeFlow.setName('Probe');
 function sync(meta){return api('syncInputs',{name:'Probe',project:'Probe',flowSource:code(meta)});}
 var synced=sync(raw),x=__nativeProbeFlow.getVariable('x'),upload=__nativeProbeFlow.getVariable('files');
 assert(synced.ok&&synced.normalizations.length===7,'Native sync signals normalizations: '+JSON.stringify(synced));
 assert(x&&String(x.isRequired())==='false'&&x.getVisibility()===-1&&String(x.getSchemaType())==='xsd:integer','Real variable receives false, -1 and integer schema');
 assert(upload&&upload.getIsFileUpload()&&upload.isMultiValued(),'Real upload variable receives true');
 assert(__nativeProbeFlow.getAuthenticatedContextRequired(),'Real authentication property receives true');
 assert(synced.inputDefinitions&&synced.inputDefinitions.x&&synced.inputDefinitions.x.required===false&&synced.inputDefinitions.files.multi===true,'Java replay receives normalized flags, never raw optBoolean input: '+JSON.stringify(synced));
 var invalidSync=sync({authenticatedContextRequired:false,inputs:{x:{type:'string',required:'yes',description:'must not write'}}});
 assert(!invalidSync.ok,'syncInputs rejects invalid source directly');
 assert(__nativeProbeFlow.getAuthenticatedContextRequired()&&String(x.getDescription())==='Keep text spaces ','Whole batch refused before the first bean change');
 __nativeProbeFlow=null;
 var mutation=api('applyMutation',{target:'flow',definition:{flow:{inputs:{x:{type:'string'}}},nodes:[]},mutation:{op:'replace',path:'flow.inputs.x.required',value:'yes'},includeTree:false});
 assert(!mutation.ok,'Authoring metadata mutations cannot bypass validation: '+JSON.stringify(mutation));
 function scalarBad(value,spec,path){try{contract.scalar(value,spec,path);assert(false,'Accepted '+path+'='+JSON.stringify(value));}catch(e){assert(e.message.indexOf(path)>=0&&e.message.indexOf('takes')>=0,'Readable scalar refusal');}}
 ['abc','Bogus','private','yes','',true,{},[],null,2147483648].forEach(function(v){scalarBad(v,{type:'integer',min:1,max:2147483647},'listeners[0].chunk');});
 var integer=contract.scalar(' 60 ',{type:'integer',min:1,max:2147483647},'listeners[0].chunk');
 assert(integer.value===60&&integer.normalizations.length===1,'Trimmed number is reported, never silently becomes zero');
 var enumeration=contract.scalar('private',{enum:['Public','Hidden','Private']},'accessibility');
 assert(enumeration.value==='Private'&&enumeration.normalizations.length===1,'Native enum casing is canonical and reported');
 assert(contract.scalar('the label',{enum:[{name:'NAME',label:'The Label'}]},'enum').value==='NAME','Unique enum display label accepted');
 scalarBad('label',{enum:[{name:'A',label:'Label'},{name:'B',label:'LABEL'}]},'ambiguous');
 if(failures.length)throw new Error(failures.join('\n'));
 print('native-property-values OK ('+assertions+' assertions)');
}finally{files.deleteDirectory(project);}
