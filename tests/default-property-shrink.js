// Shrink / unshrink of block property defaults, as Convertigo project YAML does:
// a property set to its declared default is not written, and the runtime gives the
// default back to the block when the canonical source omits it.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-default-shrink-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var definition = {
	version: 1,
	flow: { sourceVersion: 2 },
	nodes: [{ id: "fail", block: "throw", props: { code: "CUSTOM_CODE", message: "Stop" } }]
};
function replaceCode(value) {
	return JSON.parse(engine.applyMutation(JSON.stringify({
		target: "flow",
		definition: definition,
		includeTree: false,
		mutation: { op: "replace", path: "nodes[0].props.code", value: value }
	})));
}

var reset = replaceCode("FLOW_THROW");
assertTrue(reset.ok === true && reset.source.indexOf("CUSTOM_CODE") < 0 && reset.source.indexOf("FLOW_THROW") < 0,
	"A property set to its declared default must be omitted: " + reset.source);
var changed = replaceCode("OTHER_CODE");
assertTrue(changed.ok === true && changed.source.indexOf("OTHER_CODE") >= 0,
	"A non-default value must be written: " + changed.source);

var run = JSON.parse(engine.run(JSON.stringify({
	definition: { version: 1, flow: { sourceVersion: 2 }, nodes: [{ id: "assign", block: "set", props: { value: 5 } }] },
	includeTrace: false
})));
assertTrue(run.ok === true && run.result.value === 5,
	"An omitted property must receive its declared default at runtime: " + JSON.stringify(run));

print("default-property-shrink OK");
