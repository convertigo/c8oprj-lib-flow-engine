var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-list-sum-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var items = [2, "3.5", null, "not-a-number", -1];
var run = JSON.parse(engine.run(JSON.stringify({
	definition: {
		version: 1,
		nodes: [{ id: "total", block: "list.sum", props: { items: items, out: "result.total" } }]
	},
	includeTrace: false
})));
assertTrue(run.ok === true && run.result.total === 4.5,
	"list.sum integration Flow failed: " + JSON.stringify(run));

var browserFile = new java.io.File(engineDir, "blocks/list/sum.browser.js");
var browserSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(browserFile, "UTF-8"));
var browserSum = eval("(" + browserSource + ")");
assertTrue(browserSum({ items: items }) === 4.5 && browserSum({ items: null }) === 0,
	"browser list.sum did not match the backend contract");

var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "list.sum total", detail: "full" })));
var block = catalog.blocks.filter(function (item) { return item.blockId === "list.sum"; })[0];
assertTrue(block && block.targets.join(",") === "backend,frontend" &&
	block.implementations.frontend.file === "sum.browser.js" &&
	block.outputs.out.type === "number" &&
	block.props.items.type === "array",
	"catalog did not expose the canonical dual-target list.sum contract");

print("list-sum-block OK");
