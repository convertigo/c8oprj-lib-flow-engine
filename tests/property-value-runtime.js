var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-property-value-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(ok, message) { if (!ok) throw new Error(message); }
function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
function decode(definition, text) { return api("propertyValue", {propertyDefinition:definition,text:text}); }
var source = 'const _flow={sourceVersion:2};\nfunction Values(){number.add({$$id:"sum",left:input.n,right:2,$$out:"result.sum"});}';
var number = decode({kind:"value",type:"number"}, "7");
assert(number.ok && number.value === 7, JSON.stringify(number));
var changed = api("applyMutation", {target:"flow",flowSource:source,flowName:"Values",mutation:{op:"replace",path:"nodes[0].props.left",value:number.value}});
assert(changed.ok, JSON.stringify(changed));
var run = api("run", {flowSource:changed.source,includeTrace:false});
assert(run.ok && run.result.sum === 9, "Typed editor/source/runtime chain: " + JSON.stringify(run));
assert(!/left:\s*"7"/.test(changed.source), changed.source);
var expression = decode({kind:"value",type:"boolean"}, "{{ input.flag }}");
assert(expression.ok && expression.value === "{{ input.flag }}", JSON.stringify(expression));
assert(decode({kind:"value",type:"boolean"}, "false").value === false, "Boolean false lost");
assert(decode({kind:"template",type:"string"}, "7").value === "7", "Template is text");
assert(decode({kind:"expression",type:"unknown"}, "7").value === "7", "Expression is source text");
assert(decode({kind:"text",type:"string"}, "null").value === "null", "Text must not become null");
assert(decode({kind:"literal",type:"null"}, "null").value === null, "Null lost");
assert(decode({kind:"binding",type:"number"}, '{"mode":"literal","value":7}').value.value === 7, "Frontend binding envelope lost");
var invalid = decode({kind:"value",type:"number"}, '"7"');
assert(!invalid.ok && invalid.error.code === "INVALID_PROPERTY_VALUE", JSON.stringify(invalid));
print("property value runtime: actual provider descriptors, numeric source roundtrip and execution OK");
