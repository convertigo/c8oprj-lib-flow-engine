var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var engine = eval(engineSource);
var sourceFile = new java.io.File(Packages.java.lang.System.getProperty("java.io.tmpdir"),
	"flow-frontend-set-enabled-smoke.flow.svelte");
var initialSource = [
	'<FlowComponent id="home" label="Home">',
	'  <Structure>',
	'    <Text id="title" text="Visible" />',
	'  </Structure>',
	'</FlowComponent>',
	''
].join("\n");
var mutationPath = "frontAst.slots.structure.children[0]";

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function setEnabled(source, enabled) {
	return JSON.parse(engine.applySourceMutation(JSON.stringify({
		sourceFile: String(sourceFile.getAbsolutePath()),
		sourcePath: String(sourceFile.getAbsolutePath()),
		source: source,
		mutation: {
			op: "setEnabled",
			path: mutationPath,
			enabled: enabled
		}
	})));
}

var disabled = setEnabled(initialSource, false);
assertTrue(disabled.ok === true && disabled.target === "frontAst",
	"setEnabled(false) did not use the frontend fast path: " + JSON.stringify(disabled));
assertTrue(String(disabled.source).indexOf('<Text id="title"') !== -1 &&
	String(disabled.source).indexOf("enabled={false}") !== -1,
	"setEnabled(false) did not preserve the disabled state in source: " + disabled.source);

var reenabled = setEnabled(disabled.source, true);
assertTrue(reenabled.ok === true && reenabled.target === "frontAst",
	"setEnabled(true) did not use the frontend fast path: " + JSON.stringify(reenabled));
assertTrue(String(reenabled.source).indexOf("enabled={false}") === -1,
	"setEnabled(true) did not restore the frontend node: " + reenabled.source);

print("frontend-set-enabled-smoke OK");
