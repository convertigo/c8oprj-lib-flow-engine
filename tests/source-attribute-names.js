// Standalone Rhino contract test; does not activate the new source dialect.
var root = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
function read(file) {
	return String(Packages.org.apache.commons.io.FileUtils.readFileToString(file, "UTF-8"));
}
var codec = eval(read(new java.io.File(root, "modules/source-attribute-name-codec.js")));
var cases = JSON.parse(read(new java.io.File(root, "../../tests/fixtures/source-attribute-names.json")));
function assert(value, message) { if (!value) throw new Error(message); }
function rejects(fn, code) {
	try { fn(); } catch (error) { assert(error.code === code, String(error)); return; }
	throw new Error("Expected " + code);
}
cases.forEach(function (item) {
	var decoded = codec.decode(item.source);
	assert(decoded.namespace === item.namespace && decoded.name === item.name, item.source);
	assert(codec.encode(decoded.namespace, decoded.name) === item.source, "roundtrip " + item.source);
	// JSON property bags preserve even __proto__; evaluating JS object literals does not.
	var parsed = JSON.parse("{" + JSON.stringify(item.source) + ":false}");
	assert(Object.prototype.hasOwnProperty.call(parsed, item.source), "Rhino key " + item.source);
});
var literal = eval('({$$id:"node", $$$id:5, id:6})');
assert(literal.$$id === "node" && literal.$$$id === 5 && literal.id === 6, "Rhino syntax");
assert(!Object.prototype.hasOwnProperty.call(eval('({"__proto__":false})'), "__proto__"),
	"JS object evaluation is not a lossless property parser");
rejects(function () { codec.decode("$$"); }, "FLOW_SOURCE_ATTRIBUTE_NAME_INVALID");
rejects(function () { codec.decode(null); }, "FLOW_SOURCE_ATTRIBUTE_NAME_INVALID");
rejects(function () { codec.encode("engine", "$id"); }, "FLOW_SOURCE_ATTRIBUTE_NAMESPACE_INVALID");
rejects(function () { codec.resolve("$$typo", ["id", "disabled"]); }, "FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN");
assert(codec.resolve("$$id", ["id"]).namespace === "engine", "known engine attribute");
assert(codec.resolve("$$$id", []).name === "$$id", "escaped business property");
for (var dollars = 2; dollars < 32; dollars++) {
	var name = new Array(dollars + 1).join("$") + "value";
	assert(codec.decode(codec.encode("property", name)).name === name, "escape " + dollars);
}
print("source-attribute-names OK (Rhino, namespace separation, escaping, roundtrip, diagnostics)");
