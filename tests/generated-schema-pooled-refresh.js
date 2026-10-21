// Two actual Rhino engine instances with the same server-owned Java registries.
// A promotion refreshes every pooled runtime; only the new generation should probe
// shared dependencies, not one repeat per pooled runtime catching up to it.
var File=java.io.File,files=Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir=String(new File(arguments[0]||'_flow').getCanonicalPath());
var temporary=java.nio.file.Files.createTempDirectory('flow-schema-pool-').toFile(),__flowProjectDir=String(temporary);
var registries={},probes=0,__schemaClock=1700000000000;
function __schemaSharedMap(key,fallback,initialize){
 if(!registries[key]){registries[key]=new java.util.concurrent.ConcurrentHashMap();if(initialize)initialize(registries[key]);}
 return registries[key];
}
function assert(v,m){if(!v)throw new Error(m);}
try {
 files.writeStringToFile(new File(temporary,'c8oProject.yaml'),'↓SchemaPool [core.Project]:\n','UTF-8');
 var source=String(files.readFileToString(new File(__flowEngineDir,'Engine.js'),'UTF-8'));
 function replaceOnce(a,b){assert(source.split(a).length===2,'Observation anchor changed: '+a);source=source.replace(a,b);}
 // Standalone Engine.theApp is absent. Supply only its generic Java registry;
 // parsing, fingerprints, caching and bridge generations remain real.
 replaceOnce('var shared = null;','return __schemaSharedMap(key, fallback, initialize); var shared = null;');
 replaceOnce('var config = [loadProjectEngineDefinition(), projectConfigService().parentConfigs(projectConfigEnv())];','probes++; var config = [loadProjectEngineDefinition(), projectConfigService().parentConfigs(projectConfigEnv())];');
 var start=source.indexOf('function generatedSchemaDependencies()'),end=source.indexOf('function generatedSchemaIdentity(',start);
 var dependencySource=source.substring(start,end);
 assert(dependencySource.split('Number(JavaSystem.currentTimeMillis())').length===4,'Dependency clock observation changed');
 source=source.substring(0,start)+dependencySource.replace(/Number\(JavaSystem.currentTimeMillis\(\)\)/g,'__schemaClock')+source.substring(end);
 var a=eval(source),b=eval(source),code='const _flow={sourceVersion:2}\nfunction Simple({result}) { result.value=1 }\n';
 function output(engine){var r=JSON.parse(String(engine.outputSchema(JSON.stringify({flowName:'Simple',flowSource:code,allowRequestableSchema:false}))));assert(r.ok,'Analysis failed: '+JSON.stringify(r));}
 output(a);output(b);
 var before=probes;
 Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge.invalidateDataCaches();
 a.cacheClear('{}');output(a);var refreshed=probes;
 assert(refreshed===before+1,'A new bridge generation must recompute its dependencies');
 b.cacheClear('{}');output(b);
 assert(probes===refreshed,'A pooled runtime catching up must not evict new shared dependencies');
 b.cacheClear('{}');output(b);
 assert(probes===refreshed,'Disposing an already current pooled runtime must not evict shared dependencies either');
 a.cacheClear();output(a);
 assert(probes===refreshed+1,'An explicit clear on a current runtime must still force an immediate probe');
 __schemaClock+=1001;output(b);
 assert(probes===refreshed+2,'External filesystem fallback must probe after its deterministic clock expiry');
 print('generated-schema-pooled-refresh: generation refresh shared across real engines, explicit invalidation preserved');
} finally { files.deleteDirectory(temporary); }
