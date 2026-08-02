var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-yaml-parse-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function parseNode(id, text, out) {
	return {
		id: id,
		block: "yaml.parse",
		props: {
			text: text,
			out: out
		}
	};
}

var convertigoYaml = [
	"accessibility: Hidden",
	"\u2193marketplace [core.Project]:",
	"  comment: March\u00e9 Convertigo \u2615",
	"  \u2191convertigo: 8.4.0",
	"  \u2192script: |",
	"    return true;",
	""
].join("\n");

var run = JSON.parse(engine.run(JSON.stringify({
	definition: {
		version: 1,
		nodes: [
			parseNode("mapping", "name: Flow\ncount: 2\nenabled: true\n", "result.mapping"),
			parseNode("list", "- alpha\n- 2\n- false\n", "result.list"),
			parseNode("integer", "42\n", "result.integer"),
			parseNode("boolean", "true\n", "result.boolean"),
			parseNode("scalar", "plain text\n", "result.scalar"),
			parseNode("unicode", "title: Caf\u00e9 \u2615\n", "result.unicode"),
			parseNode("convertigo", convertigoYaml, "result.convertigo"),
			{
				id: "mappingName",
				block: "object.get",
				props: { source: "result.mapping", key: "name", out: "result.mappingName" }
			},
			{
				id: "listCount",
				block: "list.count",
				props: { items: "result.list", out: "result.listCount" }
			}
		]
	},
	includeTrace: false
})));

assertTrue(run.ok === true, "yaml.parse integration Flow failed: " + JSON.stringify(run));
assertTrue(run.result.mapping.name === "Flow" && run.result.mapping.count === 2 && run.result.mapping.enabled === true,
	"yaml.parse did not preserve mapping values");
assertTrue(run.result.list.length === 3 && run.result.list[0] === "alpha" && run.result.list[1] === 2 && run.result.list[2] === false,
	"yaml.parse did not preserve list values");
assertTrue(run.result.integer === 42 && run.result.boolean === true && run.result.scalar === "plain text",
	"yaml.parse did not preserve scalar values");
assertTrue(run.result.unicode.title === "Caf\u00e9 \u2615",
	"yaml.parse did not preserve Unicode");
assertTrue(run.result.convertigo["\u2193marketplace [core.Project]"].comment === "March\u00e9 Convertigo \u2615" &&
	run.result.convertigo["\u2193marketplace [core.Project]"]["\u2191convertigo"] === "8.4.0" &&
	run.result.convertigo["\u2193marketplace [core.Project]"]["\u2192script"] === "return true;\n",
	"yaml.parse did not preserve Convertigo arrow keys or block scalars");
assertTrue(run.result.mappingName === "Flow" && run.result.listCount === 3,
	"yaml.parse output was not consumable by object/list blocks");

var invalid = JSON.parse(engine.run(JSON.stringify({
	definition: {
		version: 1,
		nodes: [parseNode("invalid", "root: [one, two\n", "result.invalid")]
	},
	includeTrace: false
})));
assertTrue(invalid.ok === false && invalid.error.code === "YAML_PARSE_ERROR" &&
	String(invalid.error.message || "").indexOf("YAML parse failed:") === 0 &&
	String(invalid.error.hint || "").indexOf("Check YAML") === 0,
	"yaml.parse did not return a clear syntax error: " + JSON.stringify(invalid));

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "yaml.parse", detail: "full" })));
var block = catalog.blocks.filter(function (item) { return item.blockId === "yaml.parse"; })[0];
assertTrue(block && block.targets.join(",") === "backend" && block.outputs.out.type === "unknown",
	"catalog did not expose the canonical backend yaml.parse contract");

print("yaml-parse-block OK");
