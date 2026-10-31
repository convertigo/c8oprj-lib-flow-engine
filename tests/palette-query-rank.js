// authoring-palette({ query: "Form", limit: 1 }) on the structure of a page answered ChatComposer, whose description
// mentions a form, and "Textarea" answered Input first: the palette kept the catalog order and cut it at the limit.
// "textarea multi-line" answered nothing. The candidates whose name is the query, or a word of it, now come first.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectDirFile = java.nio.file.Files.createTempDirectory("lib-flow-engine-palette-rank-").toFile();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
function findNode(node, predicate) {
	if (!node) return null;
	if (predicate(node)) return node;
	var children = node.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = findNode(children[i], predicate);
		if (found) return found;
	}
	return null;
}
try {
	var engine = eval(source);
	var modelDir = new java.io.File(projectDirFile, "_flow/frontbuilder/svelte/model/Orders/src/routes");
	modelDir.mkdirs();
	files.writeStringToFile(new java.io.File(modelDir, "+page.flow.svelte"), [
		"<script module>export const _flow = { sourceVersion: 2 };</script>",
		"<FlowComponent $$id=\"orders\" label=\"Orders\">",
		"  <Structure>",
		"    <Button $$id=\"export\" label=\"Export\">",
		"      <Events>",
		"        <OnClick $$id=\"exportClick\"><Actions /></OnClick>",
		"      </Events>",
		"    </Button>",
		"  </Structure>",
		"</FlowComponent>",
		""
	].join("\n"), "UTF-8");
	var request = {
		surface: "frontend",
		builder: "svelte",
		engineSource: ["version: 1", "config:", "  frontbuilder:", "    svelte:", "      target: svelte5",
			"      resourceRoot: " + String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT")),
			"      modelPath: _flow/frontbuilder/svelte/model/Orders/src/routes/+page.flow.svelte", ""].join("\n"),
		projectDir: __flowProjectDir
	};
	var tree = JSON.parse(engine.authoringTree(JSON.stringify(Object.assign({}, request, { detail: "full" }))));
	var structure = findNode(tree, function (node) { return /\.structure$/.test(String(node.path || "")); });
	assert(structure, "the page has its structure");
	function palette(query, limit) {
		return JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({}, request, { focusPath: structure.path, query: query, limit: limit }))));
	}
	function ids(answer) { return (answer.items || []).map(function (item) { return item.id; }); }
	var form = palette("Form", 1);
	assert(form.ok === true && form.eligibleCount > 1, "Form matches several candidates: " + JSON.stringify(form).substring(0, 300));
	assert(ids(form)[0] === "svelte.form", "Form comes first: " + ids(form));
	var textarea = palette("Textarea", 1);
	assert(ids(textarea)[0] === "svelte.textarea", "Textarea comes first: " + ids(textarea));
	var words = palette("textarea multi-line", 3);
	assert(ids(words)[0] === "svelte.textarea", "a word of the query names Textarea: " + JSON.stringify(words).substring(0, 300));
	var formSubmit = palette("Form submit", 3);
	assert(ids(formSubmit)[0] === "svelte.form", "Form submit gives Form first: " + ids(formSubmit));
	var prefix = palette("Date", 5);
	assert(/^svelte\.date/i.test(ids(prefix)[0]), "a name starting with the query before a description match: " + ids(prefix));
	var all = palette("Form", 0);
	assert(all.eligibleCount === all.returnedCount && ids(all).indexOf("svelte.formSection") > 0, "every match is still answered without a limit");

	print("palette-query-rank OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(projectDirFile);
}
