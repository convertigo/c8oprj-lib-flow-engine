// F18: invalidate actual legacy-map values through the project store, never a fake success.
var root=new java.io.File(arguments[0]),files=Packages.org.apache.commons.io.FileUtils,checks=0;
function assert(v,m){checks++;if(!v)throw new Error(m);}
var source=new java.io.File(root,'blocks/project/cacheRemove.block.js');assert(source.isFile(),'F18: application cache invalidation block must exist');
var __flowEngineDir=String(root.getCanonicalPath()),engine=eval(String(files.readFileToString(new java.io.File(root,'Engine.js'),'UTF-8')));
var discovered=JSON.parse(engine.catalog(JSON.stringify({query:'project.cacheRemove',detail:'signature'})));
assert((discovered.blocks||[]).some(function(b){return b.block==='project.cacheRemove';}),'F18: application cache invalidation must be discoverable without includeInternal');
var code=String(files.readFileToString(source,'UTF-8')),cache=eval(code.substring(code.indexOf('(function')));
var map=new java.util.HashMap(),other=new java.util.HashMap(),legacy=new java.util.HashMap();legacy.put('table','id');map.put('table_id_cache',legacy);other.put('table_id_cache','other project');
var ctx={props:function(n){return n;},template:function(v){return v;},canContinue:function(){return true;},convertigoContext:function(){return {project:{get:function(k){return map.get(k);},set:function(k,v){if(v===null)map.remove(k);else map.put(k,v);}}};},raise:function(code,message){var e=new Error(message);e.code=code;throw e;}};
var removed=cache.run(ctx,{key:'table_id_cache'});assert(removed.removed&&!map.containsKey('table_id_cache'),'Removes a legacy Java Map');
assert(String(other.get('table_id_cache'))==='other project','Invalidation is isolated to the current project');
assert(!cache.run(ctx,{key:'table_id_cache'}).removed,'Idempotent absence is explicit');
['','a\nkey',new Array(257).join('k')].forEach(function(key){var caught=false;try{cache.run(ctx,{key:key});}catch(e){caught=e.code==='PROJECT_CACHE_KEY_INVALID';}assert(caught,'Unsafe cache key refused');});
ctx.canContinue=function(){return false;};map.put('keep','value');var cancelled=false;try{cache.run(ctx,{key:'keep'});}catch(e){cancelled=e.code==='FLOW_EXECUTION_CANCELLED';}assert(cancelled&&map.containsKey('keep'),'Cancellation precedes mutation');
ctx.canContinue=function(){return true;};ctx.convertigoContext=function(){return {};};var unavailable=false;try{cache.run(ctx,{key:'key'});}catch(e){unavailable=e.code==='PROJECT_CACHE_UNAVAILABLE';}assert(unavailable,'No fake success without a native project cache');
// A code-run HTTP context belongs to MCP; invalidate the named execution project instead.
var requested='TargetApp',resolved='',target=new java.util.HashMap(),host=new java.util.HashMap();target.put('shared','app');host.put('shared','mcp');
var fakeManager={getOriginalProjectByName:function(name){resolved=String(name);return {get:function(k){return target.get(k);},set:function(k,v){target.remove(k);}};}};
var fakeEngine={theApp:{databaseObjectsManager:fakeManager}};
var PackagesMock={java:Packages.java,com:{twinsoft:{convertigo:{engine:{Engine:fakeEngine}}}}};
var scoped=(function(Packages){return eval(code.substring(code.indexOf('(function')));})(PackagesMock);
ctx.read=function(path){assert(path==='request.project','Execution metadata only');return requested;};
ctx.convertigoContext=function(){return {project:{getName:function(){return 'lib_flow_mcp';},get:function(k){return host.get(k);},set:function(k,v){host.remove(k);}}};};
var scopedResult=scoped.run(ctx,{key:'shared'});assert(scopedResult.removed&&resolved==='TargetApp'&&!target.containsKey('shared')&&String(host.get('shared'))==='mcp','MCP invocation cannot redirect invalidation to the host project');
print('project-cache-remove OK ('+checks+' assertions)');
