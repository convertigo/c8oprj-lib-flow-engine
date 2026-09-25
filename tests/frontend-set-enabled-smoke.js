var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var engineSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var engine = eval(engineSource);
// Own directory: the provider scans the source's parent, never the shared OS temp root.
var sourceFile = new java.io.File(java.nio.file.Files.createTempDirectory("flow-frontend-set-enabled-").toFile(),
	"flow-frontend-set-enabled-smoke.flow.svelte");
var initialSource = [
	'<script module>export const _flow = { sourceVersion: 2 };</script>',
	'<FlowComponent $$id="home" label="Home">',
	'  <Structure>',
	'    <Text $$id="title" text="Visible" />',
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
assertTrue(disabled.ok === true && disabled.target === "flowSvelte",
	"setEnabled(false) did not use the frontend fast path: " + JSON.stringify(disabled));
assertTrue(/<Text\s[^>]*\$\$id="title"/.test(String(disabled.source)) &&
	String(disabled.source).indexOf("$$disabled={true}") !== -1,
	"setEnabled(false) did not preserve the disabled state in source: " + disabled.source);

var reenabled = setEnabled(disabled.source, true);
assertTrue(reenabled.ok === true && reenabled.target === "flowSvelte",
	"setEnabled(true) did not use the frontend fast path: " + JSON.stringify(reenabled));
assertTrue(String(reenabled.source).indexOf("$$disabled") === -1,
	"setEnabled(true) did not restore the frontend node: " + reenabled.source);

var enableMenu = JSON.parse(engine.contextMenu(JSON.stringify({
	targetObject: {
		kind: "frontendWidget",
		definition: { id: "title" },
		info: {
			disabled: true,
			sourceWritable: true,
			sourceMutationPath: mutationPath
		}
	}
})));
assertTrue(enableMenu.items.some(function (item) {
	return item.id === "flow.node.enable" &&
		item.payload.mutation.op === "setEnabled" && item.payload.mutation.enabled === true;
}), "disabled frontend projection did not offer the enable action");

print("frontend-set-enabled-smoke OK");
