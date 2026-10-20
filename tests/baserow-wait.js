var root=new java.io.File(arguments[0]),files=Packages.org.apache.commons.io.FileUtils;
var project=java.nio.file.Files.createTempDirectory('flow-wait-cache-').toFile(),__flowEngineDir=String(root.getAbsolutePath()),__flowProjectDir=String(project),checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
try{
 var engine=eval(String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8')));
 function api(m,r){return JSON.parse(engine[m](JSON.stringify(r)));}
 function run(name,body){var write=api('flowCodeSet',{name:name,code:'function '+name+'({result}) {\n'+body+'\n}'});assert(write.ok,name+' catalog/compile: '+JSON.stringify(write));return api('flowCodeRun',{name:name});}
 var wait=run('Wait','result.wait = flow.wait({delayMs:0})');assert(wait.ok&&wait.result.wait.waitedMs>=0,'Zero wait');
 var poll=run('Poll','local.attempts = 0\nlocal.poll = flow.poll({until:local.attempts >= 3,intervalMs:10,timeoutMs:1000,maxAttempts:3,$$nodes:function(){\n local.attempts = local.attempts + 1\n}})\nresult.attempts = local.attempts\nresult.completed = local.poll.completed');
 assert(poll.ok&&poll.result.attempts===3&&poll.result.completed,'F13 poll completes exactly three attempts '+JSON.stringify(poll));
 var timeout=run('Limit','flow.poll({until:false,intervalMs:10,timeoutMs:1000,maxAttempts:2,$$nodes:function(){result.attempts = 1}})');assert(!timeout.ok&&JSON.stringify(timeout.error).indexOf('POLL_TIMEOUT')>=0,'Attempt bound is visible');
 var early=run('Early','flow.poll({until:false,intervalMs:10,timeoutMs:1000,maxAttempts:2,$$nodes:function(){throw({code:"POLL_CHILD_ERROR",message:"Visible child failure",status:409})}})\nresult.after = true');assert(!early.ok&&JSON.stringify(early.error).indexOf('POLL_CHILD_ERROR')>=0,'Child failures stay visible');
 var invalid=run('BadWait','flow.wait({delayMs:60001})');assert(!invalid.ok&&JSON.stringify(invalid.error).indexOf('WAIT_DELAY_INVALID')>=0,'Wait hard cap');
 function block(name){var code=String(files.readFileToString(new java.io.File(root,'blocks/'+name+'.block.js'),'UTF-8'));return eval(code.substring(code.indexOf('(function')));}
 var context={props:function(n){return n;},canContinue:function(){return false;},template:function(v){return v;},raise:function(code,message){var e=new Error(message);e.code=code;throw e;}};
 var waiter=block('flow/wait'),waitCancelled=false;try{waiter.run(context,{delayMs:1000});}catch(e){waitCancelled=e.code==='FLOW_EXECUTION_CANCELLED';}assert(waitCancelled,'Waiting honors cancellation');
 // Deterministic sleeping proof: instrument Java clock/sleep in memory, not elapsed wall time.
 var ticks=0,sleeps=[],sleepSource=String(files.readFileToString(new java.io.File(root,'blocks/flow/wait.block.js'),'UTF-8'));
 var fakeSystem={nanoTime:function(){return ticks;}},fakeThread={sleep:function(ms){sleeps.push(ms);ticks+=ms*1000000;}};
 sleepSource=sleepSource.replace('Packages.java.lang.System','fakeSystem').replace('Packages.java.lang.Thread','fakeThread');
 context.canContinue=function(){return true;};var sleeping=eval(sleepSource.substring(sleepSource.indexOf('(function'))).run(context,{delayMs:250});
 assert(sleeps.join(',')==='100,100,50'&&sleeping.waitedMs===250,'Wait yields the thread in bounded slices; no busy polling');
 print('baserow-wait OK ('+checks+' assertions)');
}finally{files.deleteDirectory(project);}
