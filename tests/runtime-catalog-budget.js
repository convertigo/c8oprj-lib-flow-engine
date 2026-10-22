// Count descriptor builds on the actual execution path, independent of wall time.
var files = Packages.org.apache.commons.io.FileUtils;
var root = new java.io.File(arguments.length ? arguments[0] : "_flow");
var __flowEngineDir = String(root.getAbsolutePath());
var builds = 0;
var source = String(files.readFileToString(new java.io.File(root, "Engine.js"), "UTF-8"));
var anchor = "function graphBlockCatalog(definition) {";
if (source.indexOf(anchor) !== source.lastIndexOf(anchor)) throw new Error("Non-unique instrumentation anchor");
source = source.replace(anchor, anchor + " builds++;");
var engine = eval(source);
var nodes = [];
for (var i = 0; i < 100; i++) nodes.push({ id: "n" + i, block: "if", props: { condition: true }, then: [
	{ block: "json.parse", props: { text: '{"value":42}' }, out: "result.value" }
] });
var request = JSON.stringify({ flowQName: "Budget.Repeated", definition: { version: 1, nodes: nodes } });
var expected;
for (var call = 0; call < 3; call++) {
	var previous = builds;
	var result = JSON.parse(String(engine.run(request)));
	if (!result.ok || result.result.value.value !== 42) throw new Error("Execution contract changed");
	var value = JSON.stringify(result.result);
	if (expected && value !== expected) throw new Error("Hot execution changed the result");
	expected = value;
	var count = builds - previous;
	if (count > (call === 0 ? 6 : 0)) throw new Error("Repeated descriptor construction: " + count);
	print("CATALOG_BUDGET " + JSON.stringify({ call: call, constructions: count, nodes: 200 }));
}
print("runtime catalogue budget passed");
