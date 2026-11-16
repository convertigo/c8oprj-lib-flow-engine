// Standalone Rhino integration, all files in java.io.tmpdir and no external service.
var File=java.io.File, IO=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]||'_flow').getCanonicalPath());
var project=java.nio.file.Files.createTempDirectory('boundary-boundaries-').toFile();
var __flowProjectDir=String(project.getCanonicalPath());
var context=null, checks=0;
function assert(value,label){checks++;if(!value)throw Error(label);}
function app(){return {httpServletRequest:{getAttribute:function(){return null;},getSession:function(){return null;}}};}
try{
 IO.writeStringToFile(new File(project,'_private/flow-data/ok.txt'),'data','UTF-8');
 IO.writeStringToFile(new File(project,'_flow/resources/ok.txt'),'asset','UTF-8');
 IO.writeStringToFile(new File(project,'_flow/lib/private.js'),'private','UTF-8');
 IO.writeStringToFile(new File(project,'_private/flow-data/large.txt'),new Array(2049).join('x'),'UTF-8');
 var engine=eval(String(IO.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8')));
 function run(block,props){return JSON.parse(engine.run(JSON.stringify({includeTrace:false,definition:{version:1,nodes:[{id:'probe',block:block,props:props,out:'result.value'}]}})));}
 function refused(block,props,code){var out=run(block,props);assert((!out.ok||out.result&&out.result.value&&out.result.value.ok===false)&&JSON.stringify(out).indexOf(code)>=0,block+' expected '+code+': '+JSON.stringify(out).substring(0,600));}
 context=app();
 refused('block.code.set',{name:'probe.generated',code:'const _meta={sourceVersion:2, runtime:"rhino"};\n(function(){return {run:function(){return 1;}};}())',dry:true},'AUTHORING_FORBIDDEN');
 refused('resource.patch',{path:'_flow/resources/ok.txt',content:'changed',dryRun:true},'AUTHORING_FORBIDDEN');
 assert(run('file.readText',{path:'_private/flow-data/ok.txt'}).result.value==='data','data read');
 refused('file.readText',{path:'_flow/lib/private.js'},'FILE_PATH_NOT_ALLOWED');
 refused('file.readText',{path:'_flow/lib/private.js',unrestrictedPath:true},'AUTHORING_FORBIDDEN');
 assert(run('asset.read',{path:'_flow/resources/ok.txt'}).result.value==='asset','asset read');
 refused('asset.read',{path:'_flow/lib/private.js'},'ASSET_PATH_NOT_ALLOWED');
 refused('http.request',{url:'file://'+project.getCanonicalPath()+'/_private/flow-data/ok.txt'},'HTTP_FILE_REFUSED');
 java.lang.System.clearProperty('convertigo.flow.http.allowedHosts');
 refused('http.request',{url:'http://127.0.0.1:1/'},'HTTP_DESTINATION_REFUSED');
 context=null;
 assert(run('file.readText',{path:'_flow/lib/private.js',unrestrictedPath:true}).result.value==='private','explicit internal file read');
 assert(run('http.get',{url:'file://'+project.getCanonicalPath()+'/_private/flow-data/ok.txt',allowFileUrl:true}).result.value.text==='data','explicit internal file URL');
 java.lang.System.setProperty('convertigo.flow.http.maxResponseBytes','64');
 refused('http.request',{url:'file://'+project.getCanonicalPath()+'/_private/flow-data/large.txt',allowFileUrl:true},'HTTP_RESPONSE_TOO_LARGE');
 var yaml='a: &a '+new Array(65537).join('x')+'\nb: ['+new Array(101).join('*a,')+'*a]\n';
 refused('yaml.parse',{text:yaml},'character budget');
 var cell=run('rows.formatCells',{rows:[{a:'<img src=x onerror="bad()">'}],profile:'table',schema:[{name:'a',type:'text'}]});
 assert(cell.ok&&cell.result.value[0].a.displayValue.indexOf('&lt;img')>=0,'native-dispatch cell escaping: '+JSON.stringify(cell).substring(0,500));
 print('boundary-runtime-boundaries OK ('+checks+' checks)');
}finally{java.lang.System.clearProperty('convertigo.flow.http.maxResponseBytes');IO.deleteDirectory(project);}
