var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-text-replace-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var cases = [
	{
		name: "unicode",
		input: { text: "Caf\u00e9 \u2615 / Caf\u00e9 \u2615", search: "Caf\u00e9 \u2615", replacement: "Th\u00e9 \ud83c\udf75" },
		expected: "Th\u00e9 \ud83c\udf75 / Th\u00e9 \ud83c\udf75"
	},
	{
		name: "first",
		input: { text: "one one one", search: "one", replacement: "1", all: false },
		expected: "1 one one"
	},
	{
		name: "all",
		input: { text: "one one one", search: "one", replacement: "1", all: true },
		expected: "1 1 1"
	},
	{
		name: "caseInsensitive",
		input: { text: "\u00c9t\u00e9 \u00c9T\u00c9 \u00e9t\u00e9", search: "\u00e9t\u00e9", replacement: "season", caseSensitive: false },
		expected: "season season season"
	},
	{
		name: "caseSensitiveDefault",
		input: { text: "Flow flow", search: "flow", replacement: "block" },
		expected: "Flow block"
	},
	{
		name: "noMatch",
		input: { text: "unchanged", search: "missing", replacement: "found" },
		expected: "unchanged"
	},
	{
		name: "emptySearch",
		input: { text: "unchanged", search: "", replacement: "prefix" },
		expected: "unchanged"
	},
	{
		name: "literalMetacharacters",
		input: { text: "a.*b.*", search: ".*", replacement: "-" },
		expected: "a-b-"
	}
];

var nodes = cases.map(function (testCase) {
	return {
		id: testCase.name,
		block: "text.replace",
		props: Object.assign({}, testCase.input, { out: "result." + testCase.name })
	};
});
nodes.push({
	id: "templateValues",
	block: "text.replace",
	props: {
		text: "{{ input.text }}",
		search: "{{ input.search }}",
		replacement: "{{ input.replacement }}",
		out: "result.templateValues"
	}
});

var run = JSON.parse(engine.run(JSON.stringify({
	definition: { version: 1, nodes: nodes },
	input: { text: "red red", search: "red", replacement: "blue" },
	includeTrace: false
})));
assertTrue(run.ok === true, "text.replace integration Flow failed: " + JSON.stringify(run));
cases.forEach(function (testCase) {
	assertTrue(run.result[testCase.name] === testCase.expected,
		"Rhino mismatch for " + testCase.name + ": " + JSON.stringify(run.result[testCase.name]));
});
assertTrue(run.result.templateValues === "blue blue", "template properties were not rendered");

var browserFile = new java.io.File(engineDir, "blocks/text/replace.browser.js");
var browserSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(browserFile, "UTF-8"));
var browserReplace = eval("(" + browserSource + ")");
cases.forEach(function (testCase) {
	assertTrue(browserReplace(testCase.input) === testCase.expected,
		"browser mismatch for " + testCase.name + ": " + JSON.stringify(browserReplace(testCase.input)));
});

var analysis = JSON.parse(engine.analyze(JSON.stringify({
	definition: {
		version: 1,
		nodes: [{
			id: "replace",
			block: "text.replace",
			props: { text: "value", search: "v", replacement: "V", out: "result.value" }
		}]
	}
})));
assertTrue(analysis.schemas["result.value"] && analysis.schemas["result.value"].type === "string",
	"text.replace hooks did not publish a string schema: " + JSON.stringify(analysis.schemas));

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "text.replace literal", detail: "full" })));
var block = catalog.blocks.filter(function (item) { return item.blockId === "text.replace"; })[0];
assertTrue(block && block.targets.join(",") === "backend,frontend" &&
	block.implementations.backend.runtime === "rhino" &&
	block.implementations.frontend.runtime === "browser" &&
	block.implementations.frontend.file === "replace.browser.js" &&
	block.hooks.file === "replace.hooks.js" && block.outputs.out.type === "string",
	"catalog did not expose the canonical dual-target text.replace contract");
assertTrue(block.props.text.kind === "template" && block.props.text.type === "string" &&
	block.props.search.kind === "template" && block.props.search.type === "string" &&
	block.props.replacement.kind === "template" && block.props.replacement.type === "string" &&
	block.props.all.type === "boolean" && block.props.all["default"] === true &&
	block.props.caseSensitive.type === "boolean" && block.props.caseSensitive["default"] === true,
	"catalog did not expose text.replace property metadata and defaults");

print("text-replace-block OK");
