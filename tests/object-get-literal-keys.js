var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-object-get-literal-keys-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var flowCode = [
	"const _flow = {",
	"\tinputs: {",
	"\t\tdynamicKey: { type: \"string\" },",
	"\t\tmetadata: {",
	"\t\t\ttype: \"object\",",
	"\t\t\tproperties: {",
	"\t\t\t\t\"\u2191convertigo\": { type: \"string\" },",
	"\t\t\t\t\"display name\": { type: \"string\" },",
	"\t\t\t\t\"x-y\": { type: \"string\" },",
	"\t\t\t\t\"data.items\": { type: \"string\" },",
	"\t\t\t\t\"dynamic-value\": { type: \"string\" }",
	"\t\t\t}",
	"\t\t},",
	"\t\tnested: {",
	"\t\t\ttype: \"object\",",
	"\t\t\tproperties: {",
	"\t\t\t\tdata: {",
	"\t\t\t\t\ttype: \"object\",",
	"\t\t\t\t\tproperties: { items: { type: \"array\", items: { type: \"string\" } } }",
	"\t\t\t\t}",
	"\t\t\t}",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function ObjectGetLiteralKeys({ input, result }) {",
	"\tvar arrow = object.get({ source: input.metadata, key: \"\u2191convertigo\", defaultValue: \"\" })",
	"\tvar display = object.get({ source: input.metadata, key: \"display name\", defaultValue: \"\" })",
	"\tvar hyphen = object.get({ source: input.metadata, key: \"x-y\", defaultValue: \"\" })",
	"\tvar dotted = object.get({ source: input.metadata, key: \"data.items\", defaultValue: \"\" })",
	"\tvar nested = object.get({ source: input.nested, key: \"data.items\", defaultValue: [] })",
	"\tvar dynamic = object.get({ source: input.metadata, key: input.dynamicKey, defaultValue: \"\" })",
	"\tresult.arrow = arrow",
	"\tresult.display = display",
	"\tresult.hyphen = hyphen",
	"\tresult.dotted = dotted",
	"\tresult.nested = nested",
	"\tresult.dynamic = dynamic",
	"\treturn result",
	"}",
	""
].join("\n");

var validation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ObjectGetLiteralKeys",
	code: flowCode
})));
assertTrue(validation.ok === true && !validation.diagnostics.some(function (diagnostic) {
	return diagnostic.code === "INVALID_EXPRESSION";
}), "literal object keys were rejected as expressions: " + JSON.stringify(validation.diagnostics));
assertTrue(validation.definition.nodes[0].key === "\u2191convertigo" &&
	validation.definition.nodes[1].key === "display name" &&
	validation.definition.nodes[2].key === "x-y" &&
	validation.definition.nodes[3].key === "data.items" &&
	validation.definition.nodes[5].key === "{{ input.dynamicKey }}",
	"object.get keys did not preserve literal/dynamic intent: " + JSON.stringify(validation.definition.nodes));

var run = JSON.parse(engine.run(JSON.stringify({
	flowSource: flowCode,
	input: {
		dynamicKey: "dynamic-value",
		metadata: {
			"\u2191convertigo": "8.4.0",
			"display name": "Convertigo Marketplace",
			"x-y": "hyphen",
			"data.items": "direct dotted key",
			"dynamic-value": "dynamic key"
		},
		nested: { data: { items: ["one", "two"] } }
	},
	includeTrace: false
})));
assertTrue(run.ok === true && run.result.arrow === "8.4.0" &&
	run.result.display === "Convertigo Marketplace" && run.result.hyphen === "hyphen" &&
	run.result.dotted === "direct dotted key" && run.result.nested.join(",") === "one,two" &&
	run.result.dynamic === "dynamic key",
	"object.get did not resolve literal, dotted or dynamic keys: " + JSON.stringify(run));

var analysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: flowCode })));
assertTrue(analysis.ok === true && analysis.schemas["local.arrow"].type === "string" &&
	analysis.schemas["local.display"].type === "string" && analysis.schemas["local.hyphen"].type === "string" &&
	analysis.schemas["local.dotted"].type === "string" && analysis.schemas["local.nested"].type === "array" &&
	analysis.schemas["local.dynamic"].type === "string",
	"object.get hooks did not preserve key schemas: " + JSON.stringify(analysis.schemas));

var legacyDynamic = JSON.parse(engine.run(JSON.stringify({
	definition: {
		version: 1,
		nodes: [{
			id: "legacyDynamic",
			block: "object.get",
			props: { source: "input.metadata", key: "input.dynamicKey", out: "result.value" }
		}]
	},
	input: { dynamicKey: "dynamic-value", metadata: { "dynamic-value": "legacy dynamic key" } },
	includeTrace: false
})));
assertTrue(legacyDynamic.ok === true && legacyDynamic.result.value === "legacy dynamic key",
	"object.get no longer supports existing raw dynamic key expressions: " + JSON.stringify(legacyDynamic));

var browserFile = new java.io.File(engineDir, "blocks/object/get.browser.js");
var browserSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(browserFile, "UTF-8"));
var browserGet = eval("(" + browserSource + ")");
assertTrue(browserGet({ source: { "data.items": "direct", data: { items: "nested" } }, key: "data.items" }) === "direct" &&
	browserGet({ source: { data: { items: "nested" } }, key: "data.items" }) === "nested",
	"object.get browser implementation diverged from direct-key/path semantics");

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "object.get", detail: "full" })));
var block = catalog.blocks.filter(function (item) { return item.blockId === "object.get"; })[0];
assertTrue(block && block.props.key.kind === "value" && block.targets.join(",") === "backend,frontend",
	"object.get catalog did not expose the literal/source key contract");

print("object-get-literal-keys OK");
