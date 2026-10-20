var root=new java.io.File(arguments[0]),files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('flow-httpignore-').toFile();
var __flowEngineDir=String(root.getAbsolutePath()),__flowProjectDir=String(project.getAbsolutePath()),checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
try{
 var engine=eval(String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8')));
 function api(m,r){return JSON.parse(engine[m](JSON.stringify(r)));}
 var initial='/_flow/\n/docs/internal/\n';files.writeStringToFile(new java.io.File(project,'.httpignore'),initial,'UTF-8');
 var read=api('resourceGet',{path:'.httpignore'});assert(read.ok && read.content===initial,'F23: root .httpignore must be readable: '+JSON.stringify(read));
 var patch='@@ -1,2 +1,3 @@\n /_flow/\n /docs/internal/\n+/docs/flow-port/\n';
 var preview=api('resourcePatch',{path:'.httpignore',baseHash:read.hash,patch:patch,dryRun:true});assert(preview.ok,'F23 preview '+JSON.stringify(preview));
 assert(String(files.readFileToString(new java.io.File(project,'.httpignore'),'UTF-8'))===initial,'Preview changed file');
 var write=api('resourcePatch',{path:'.httpignore',baseHash:read.hash,patch:patch});assert(write.ok && write.changed,'F23 additive patch writes');
 var now=api('resourceGet',{path:'.httpignore'});
 assert(!api('resourcePatch',{path:'.httpignore',baseHash:read.hash,patch:patch}).ok,'Stale hash refused');
 assert(!api('resourcePatch',{path:'.httpignore',patch:'@@ -0,0 +1 @@\n+# comment\n'}).ok,'Hash mandatory');
 var unsafe=['@@ -1 +0,0 @@\n-/_flow/\n','@@ -3,0 +4 @@\n+!/_flow/\n','@@ -2 +1,0 @@\n-/docs/internal/\n'];
 unsafe.forEach(function(p){assert(!api('resourcePatch',{path:'.httpignore',baseHash:now.hash,patch:p,validate:false}).ok,'No removal, reopening, or validation bypass');});
 assert(!api('resourceDelete',{path:'.httpignore',baseHash:now.hash}).ok,'Privacy file cannot be deleted');
 ['../.httpignore','nested/.httpignore','.env','c8oProject.yaml'].forEach(function(p){assert(!api('resourcePatch',{path:p,patch:patch}).ok,'Only exact project root allowed: '+p);});
 print('baserow-httpignore OK ('+checks+' assertions)');
}finally{files.deleteDirectory(project);}
