// Real Engine resource APIs, canonical Java paths and ProjectsDataFilter GET decisions.
// No server or network: the servlet receives request/response adapters; the filter itself is production Java.
var File=java.io.File,Files=java.nio.file.Files,Utils=Packages.org.apache.commons.io.FileUtils;
var engineDir=new File(arguments[0]).getCanonicalFile();
var temp=Files.createTempDirectory(new File(String(java.lang.System.getProperty('java.io.tmpdir'))).toPath(),'resource-publication-').toFile();
var project=new File(temp,'p');project.mkdirs();
var __flowEngineDir=String(engineDir),__flowProjectDir=String(project),__flowWorkspaceDir=String(temp);
var engine=eval(String(Utils.readFileToString(new File(engineDir,'Engine.js'),'UTF-8'))),checks=0;
function assert(ok,message){checks++;if(!ok)throw Error(message);}
function api(name,request){return JSON.parse(String(engine[name](JSON.stringify(request))));}
function patch(path,content,extra){
 var previous=api('resourceGet',{path:path}),before=previous.ok?previous.content:'',old=before?before.replace(/\n$/,'').split('\n'):[],next=content?content.replace(/\n$/,'').split('\n'):[];
 var diff='--- a/'+path+'\n+++ b/'+path+'\n@@ -'+(old.length?1:0)+','+old.length+' +'+(next.length?1:0)+','+next.length+' @@\n';
 old.forEach(function(line){diff+='-'+line+'\n';});next.forEach(function(line){diff+='+'+line+'\n';});
 return api('resourcePatch',Object.assign({path:path,patch:diff,validate:false},extra||{}));
}
function write(path,content){Utils.writeStringToFile(new File(project,path),content,'UTF-8');}
function read(path){return String(Utils.readFileToString(new File(project,path),'UTF-8'));}
function denied(path,code){var out=patch(path,'text');assert(!out.ok&&out.error.code===code,JSON.stringify(out));}
function link(path,target){var f=new File(project,path);f.getParentFile().mkdirs();Files.createSymbolicLink(f.toPath(),new File(project,target).toPath());}
var Engine=Packages.com.twinsoft.convertigo.engine.Engine;
Engine.PROJECTS_PATH=String(temp);Engine.WEBAPP_PATH=String(temp);
Engine.logContext=Engine.logSiteClipper=Engine.logEngine=Packages.org.apache.log4j.Logger.getLogger('resource-publication');
var Properties=Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
Properties.initProperties();
Properties.setProperty(Properties.PropertyName.PROJECTS_DATA_COMPATIBILITY_MODE,'false');
Properties.setProperty(Properties.PropertyName.HIDING_ERROR_INFORMATION,'false');
function proxy(name,fn){var type=java.lang.Class.forName(name);return java.lang.reflect.Proxy.newProxyInstance(type.getClassLoader(),[type],new java.lang.reflect.InvocationHandler({invoke:fn}));}
function get(relative){
 var status=200,uri='/convertigo/projects/p/'+relative,chain=false;
 var request=proxy('jakarta.servlet.http.HttpServletRequest',function(_,method,args){
  var name=String(method.getName());
  if(name==='getMethod')return 'GET';
  if(name==='getRequestURI')return uri;
  if(name==='getRequestURL')return new java.lang.StringBuffer('http://localhost'+uri);
  if(name==='getContextPath')return '/convertigo';
  if(name==='isSecure')return false;
  return null;
 });
 var response=proxy('jakarta.servlet.http.HttpServletResponse',function(_,method,args){
  if(String(method.getName())==='sendError'||String(method.getName())==='setStatus')status=Number(args[0]);
  return null;
 });
 new Packages.com.twinsoft.convertigo.engine.servlets.ProjectsDataFilter().doFilter(request,response,
  new Packages.jakarta.servlet.FilterChain({doFilter:function(){chain=true;}}));
 assert(status===404&&!chain,'GET '+uri+' must be stopped with 404: '+status);
}
try {
 write('.httpignore','!docs/**\n!tests/**\n');
 var preview=patch('tests/x.py','# proof\n',{dryRun:true});
 assert(preview.ok&&!new File(project,'tests').exists()&&read('.httpignore')==='!docs/**\n!tests/**\n','dry run writes nothing: '+JSON.stringify(preview));
 Utils.writeStringToFile(new File(temp,'proof.py'),'# imported proof\n','UTF-8');
 var importedText=api('resourcePatch',{path:'tests/import.py',fromFile:'proof.py',validate:false});
 assert(importedText.ok,'first tests import: '+JSON.stringify(importedText));
 assert(read('.httpignore').endsWith('/_flow/\n/tests/\n/docs/\n'),'host rules precede imported tests');
 assert(patch('tests/x.py','# proof\n').ok,'first tests patch');
 assert(read('.httpignore').endsWith('/_flow/\n/tests/\n/docs/\n'),'host rules precede tests file');
 assert(patch('docs/x.md','# notes\n').ok,'first docs write');
 get('tests/x.py');get('docs/x.md');
 var original=api('resourceGet',{path:'.httpignore'});
 ['/tests/','/docs/','/_flow/'].forEach(function(rule){
  var out=patch('.httpignore',original.content.replace(rule+'\n',''),{baseHash:original.hash});
  assert(!out.ok&&out.error.code==='RESOURCE_HTTPIGNORE_PROTECTED','rule removal refused '+rule);
  get('tests/x.py');get('docs/x.md');
 });
 ['html','jar','bin','class'].forEach(function(ext){denied('tests/a.'+ext,'RESOURCE_PATH_NOT_ALLOWED');});
 denied('tests/../x.py','INVALID_RESOURCE_PATH');
 ['resources','_flow/resources'].forEach(function(target,i){
  write(target+'/a.py','original');link('tests/linked'+i,target);
  denied('tests/linked'+i+'/new.py','RESOURCE_PATH_NOT_ALLOWED');
  link('tests/link'+i+'.py',target+'/a.py');denied('tests/link'+i+'.py','RESOURCE_PATH_NOT_ALLOWED');
  assert(!new File(project,target+'/new.py').exists(),'new canonical target untouched');
 });
 // Import path uses the same precondition; invalid UTF-8 and binary content never enter tests/.
 Utils.writeByteArrayToFile(new File(temp,'binary.py'),java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,2));
 var imported=api('resourcePatch',{path:'tests/binary.py',fromFile:'binary.py',validate:false});
 assert(!imported.ok&&imported.error.code==='RESOURCE_TEST_TEXT_REQUIRED','binary import refused: '+JSON.stringify(imported));
 var malformed=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,2);malformed[0]=-1;malformed[1]=-2;
 Utils.writeByteArrayToFile(new File(temp,'invalid.py'),malformed);
 var invalidText=api('resourcePatch',{path:'tests/invalid.py',fromFile:'invalid.py',validate:false});
 assert(!invalidText.ok&&invalidText.error.code==='RESOURCE_TEST_TEXT_REQUIRED','non-UTF-8 import refused');
 write('resources/ignore.txt','original');Files.move(new File(project,'.httpignore').toPath(),new File(project,'saved-ignore').toPath());
 link('.httpignore','resources/ignore.txt');
 denied('tests/no.py','RESOURCE_PATH_NOT_ALLOWED');
 assert(!new File(project,'tests/no.py').exists(),'linked ignore prevents target write');
 print('resource-publication OK ('+checks+' checks)');
} finally {print('Fixture retained for host gio trash: '+temp);}
