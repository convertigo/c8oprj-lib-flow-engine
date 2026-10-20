const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": [
    "backend"
  ],
  "description": "Invalidates one application cache key of the current Convertigo project, including legacy context.project.get/set caches. Does not clear response caches or the Flow engine catalog.",
  "properties": {
    "key": {
      "type": "string",
      "kind": "value",
      "description": "Exact application cache key (1..255 characters), not a property path."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "removed": {
          "type": "boolean"
        }
      }
    }
  },
  "summary": "invalidate project cache {{key}}",
  "tags": [
    "project",
    "cache",
    "invalidate",
    "clear",
    "legacy"
  ]
}

// Use Rhino 1.9.0 features: https://mozilla.github.io/rhino/compat/engines.html
(function(){return {run:function(ctx,node){
 var key=String(ctx.template(ctx.props(node).key)||'');
 if(!key||key.length>255||/[\x00-\x1f\x7f]/.test(key))ctx.raise('PROJECT_CACHE_KEY_INVALID','project.cacheRemove needs an application key of 1..255 characters, without controls.');
 if(!ctx.canContinue())ctx.raise('FLOW_EXECUTION_CANCELLED','Project cache invalidation cancelled.');
 var project=ctx.convertigoContext().project;
 // MCP code-run keeps the HTTP context of McpServer. The authoritative
 // execution scope identifies the target project, never an input property.
 var requested=typeof ctx.read==='function'?String(ctx.read('request.project')||''):'';
 if(requested&&(!project||String(project.getName())!==requested)){
  var app=Packages.com.twinsoft.convertigo.engine.Engine.theApp;
  project=app&&app.databaseObjectsManager?app.databaseObjectsManager.getOriginalProjectByName(requested,false):null;
 }
 if(!project||typeof project.get!=='function'||typeof project.set!=='function')ctx.raise('PROJECT_CACHE_UNAVAILABLE','A live Convertigo project application cache is required.');
 var previous=project.get(key);project.set(key,null);
 return {key:key,removed:previous!==null&&previous!==undefined};
}};}())
