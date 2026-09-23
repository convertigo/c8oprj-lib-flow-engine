var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-typed-collections-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value,message) { if (!value) throw new Error(message); }
function invoke(method,request) { return JSON.parse(engine[method](JSON.stringify(request))); }
function node(block,props,out) { return {block:block,props:props,out:out}; }
function run(nodes,extra) { return invoke("run",Object.assign({definition:{flow:{sourceVersion:2},nodes:nodes},includeTrace:false,includeLocal:true},extra||{})); }
var type={type:"object",properties:{city:{type:"string"},temperature:{type:"number"}},required:["city","temperature"],additionalProperties:false};
var create=node("json.array",{path:"local.weather",itemType:type});
var push=node("json.push",{path:"local.weather",value:{city:"Paris",temperature:18}});
var copy=node("set",{path:"result.weather",value:"{{ local.weather }}"});
[false,true].forEach(function(profile) {
 var good=run([create,push,copy],{profile:profile});
 assert(good.ok && good.result.weather[0].temperature===18,JSON.stringify(good));
 var bad=run([create,node("json.push",{path:"local.weather",value:{city:"Paris",temperature:"warm"}})],{profile:profile});
 assert(!bad.ok && bad.error.code==="VALUE_TYPE_MISMATCH",JSON.stringify(bad));
 var replace=run([create,node("set",{path:"local.weather",value:"oops"})],{profile:profile});
 assert(!replace.ok && replace.error.code==="VALUE_TYPE_MISMATCH","compiled write guard: "+JSON.stringify(replace));
});
var map=run([node("json.map",{path:"local.byCity",valueType:{type:"number"}}),node("json.put",{path:"local.byCity",key:"{{ input.city }}",value:18.5}),node("set",{path:"result.weather",value:"{{ local.byCity }}"})],{input:{city:"Paris"}});
assert(map.ok && map.result.weather.Paris===18.5,JSON.stringify(map));
var source='const _flow={sourceVersion:2};\nfunction Typed(){\njson.array({path:"local.weather",itemType:'+JSON.stringify(type)+'});\njson.push({$$id:"push",path:"local.weather",value:{city:"Paris",temperature:"warm"}});\n}';
var analysis=invoke("analyze",{flowSource:source});
assert(analysis.ok && analysis.schemas["local.weather"].items.properties.temperature.type==="number",JSON.stringify(analysis));
assert(analysis.errors.some(function(error){return error.code==="VALUE_TYPE_MISMATCH" && error.property==="value";}),"static mismatch: "+JSON.stringify(analysis));
var context=invoke("context",{flowSource:source,node:"push",property:"value"});
assert(context.ok && context.scopes.local.paths.some(function(entry){return entry.path==="local.weather[0].temperature" && entry.type==="number";}),"empty typed picker: "+JSON.stringify(context));
var tree=invoke("describeTree",{target:"flow",flowSource:source});
function find(n) { if(n.path==="nodes[0]")return n; for(var i=0;i<(n.children||[]).length;i++){var got=find(n.children[i]);if(got)return got;} }
var info=JSON.parse(find(tree).info);
assert(info.propertyDefinitions.itemType.editorClass==="flow-schema-editor","schema editor descriptor: "+JSON.stringify(info));
var editedType={type:"object",properties:{name:{type:"string"},values:{type:"array",items:{type:"integer"}}},required:["name"],additionalProperties:false};
var edited=invoke("applyMutation",{target:"flow",flowSource:source,flowName:"Typed",mutation:{op:"replace",path:"nodes[0].props.itemType",value:editedType}});
assert(edited.ok,JSON.stringify(edited));
var reopened=invoke("analyze",{flowSource:edited.source});
assert(reopened.ok && JSON.stringify(reopened.schemas["local.weather"].items)===JSON.stringify(editedType),"source/editor/reparse preserves type: "+JSON.stringify(reopened));
var sourceContext=invoke("context",{flowSource:source,node:"push",property:"value"});
assert(!sourceContext.schemaSources,"ordinary picker responses are not inflated by complete schemas");
var second='const _flow={sourceVersion:2};\nfunction Types(){\njson.array({path:"local.known",itemType:{type:"number"}});\njson.array({$$id:"second",path:"local.second",itemType:{type:"string"}});\n}';
var typeContext=invoke("context",{flowSource:second,node:"second",property:"itemType"});
assert(typeContext.ok && typeContext.schemaSources.some(function(entry){return entry.path==="local.known" && entry.schema.items.type==="number";}),"copy known type picker: "+JSON.stringify(typeContext));
var unknownSource=source.replace('value:{city:"Paris",temperature:"warm"}', 'value:"{{ input.unknown }}"');
var unknown=invoke("analyze",{flowSource:unknownSource});
assert(unknown.ok && unknown.errors.some(function(error){return error.code==="UNKNOWN_VALUE_TYPE" && error.severity==="warning";}),"unknown must remain explicit: "+JSON.stringify(unknown));
print("typed collections runtime: declared empty schemas, Rhino execution, compiled/profiled guards, static diagnostics, picker and projection OK");
