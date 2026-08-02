var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-object-get-default-schema-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var flowCode = [
	"const _flow = {",
	"\tinputs: {",
	"\t\tresponse: {",
	"\t\t\ttype: \"object\",",
	"\t\t\tproperties: {",
	"\t\t\t\tdata: {",
	"\t\t\t\t\ttype: \"object\",",
	"\t\t\t\t\tproperties: { items: { type: \"object\" } }",
	"\t\t\t\t}",
	"\t\t\t}",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function ObjectGetDefaultArray({ input, result }) {",
	"\tvar response = input.response",
	"\tvar items = object.get({ source: response, key: \"data.items\", defaultValue: [] })",
	"\tvar mapped = list.map({ items, select: current.name })",
	"\tresult.items = items",
	"\tresult.mapped = mapped",
	"\treturn result",
	"}",
	""
].join("\n");

var validation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ObjectGetDefaultArray",
	code: flowCode
})));
assertTrue(validation.ok === true, "FlowScript validation failed: " + JSON.stringify(validation));
assertTrue(validation.definition.nodes[2].items === "local.items",
	"FlowScript shorthand property did not resolve to the local value: " + JSON.stringify(validation.definition.nodes[2]));
assertTrue(!validation.diagnostics.some(function (diagnostic) {
	return diagnostic.code === "FLOWSCRIPT_EXPECTED_ARRAY";
}), "object.get default array still triggered FLOWSCRIPT_EXPECTED_ARRAY: " + JSON.stringify(validation.diagnostics));

var analysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: flowCode })));
assertTrue(analysis.ok === true && analysis.schemas["local.items"] &&
	analysis.schemas["local.items"].type === "array",
	"object.get did not preserve the default array schema: " + JSON.stringify(analysis.schemas["local.items"]));

var run = JSON.parse(engine.run(JSON.stringify({
	flowSource: flowCode,
	input: { response: {} },
	includeTrace: false
})));
assertTrue(run.ok === true && run.result.items.length === 0 && run.result.mapped.length === 0,
	"object.get default array runtime behavior changed: " + JSON.stringify(run));

var preciseSourceCode = [
	"const _flow = {",
	"\tinputs: {",
	"\t\tresponse: {",
	"\t\t\ttype: \"object\",",
	"\t\t\tproperties: {",
	"\t\t\t\tdata: {",
	"\t\t\t\t\ttype: \"object\",",
	"\t\t\t\t\tproperties: {",
	"\t\t\t\t\t\titem: { type: \"object\", properties: { name: { type: \"string\" } } }",
	"\t\t\t\t\t}",
	"\t\t\t\t}",
	"\t\t\t}",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function ObjectGetPreciseSource({ input, result }) {",
	"\tvar item = object.get({ source: input.response, key: \"data.item\", defaultValue: [] })",
	"\tresult.item = item",
	"\treturn result",
	"}",
	""
].join("\n");
var preciseAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: preciseSourceCode })));
assertTrue(preciseAnalysis.ok === true && preciseAnalysis.schemas["local.item"].type === "object" &&
	preciseAnalysis.schemas["local.item"].properties.name.type === "string",
	"object.get fallback overrode a precise source schema: " + JSON.stringify(preciseAnalysis.schemas["local.item"]));

print("object-get-default-schema OK");
