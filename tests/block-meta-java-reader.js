// The _meta header of a block source is read by the Java BlockMetaReader (libs/src) and falls back to the JavaScript
// reading for anything the reader does not take on: same meta, same code, same bounds, same errors. The corpus is every
// block, trait and resource source of this library and of the libraries beside it (../lib_flow_*, v2 and v3 headers).
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var dir = new File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
var parser = eval(read(new File(dir, "modules/flow-script-parser-service.js")));
var reader = eval(read(new File(dir, "modules/block-code-source-service.js")));
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var env = {
	raise: function (code, message) { var error = new Error(message); error.code = code; throw error; },
	parseFlowScriptMetadataValue: function (text, line) { return parser.parseFlowScriptMetadataValue(text, line, env); }
};
var Native = Packages.com.convertigo.libflowengine.BlockMetaReader;
assert(String(Native.extract("const _meta = {};\nfunction A(){}")).indexOf('"meta"') >= 0, "BlockMetaReader is not on the class path");

function outcome(read) {
	try {
		var found = read();
		return JSON.stringify({ meta: found.meta, code: found.code, header: found.header || null });
	} catch (error) {
		return "throws " + error.code + ": " + error.message;
	}
}
function same(source, label) {
	var expected = outcome(function () { return reader.extractMetaJs(source, env); });
	var actual = outcome(function () { return reader.extractMeta(source, env); });
	assert(actual === expected, "Different reading of " + label + "\njs   " + expected.substring(0, 400) + "\njava " + actual.substring(0, 400));
	return expected;
}

// the corpus
var sources = [];
function collect(folder) {
	var children = folder.listFiles();
	if (!children) return;
	for (var i = 0; i < children.length; i++) {
		var child = children[i], name = String(child.getName());
		if (child.isDirectory()) { if (name !== "node_modules" && name.charAt(0) !== ".") collect(child); }
		else if (/\.js$/.test(name)) sources.push(child);
	}
}
var project = dir.getParentFile(), beside = project.getParentFile().listFiles(), neighbours = 0;
for (var i = 0; i < beside.length; i++) {
	var library = beside[i], libraryName = String(library.getName());
	if (!/^lib_flow_|^c8oprj-lib-flow-/.test(libraryName) && libraryName !== "samples-m1") continue;
	neighbours++;
	["blocks", "traits", "resources"].forEach(function (kind) { collect(new File(library, "_flow/" + kind)); });
	if (libraryName === "samples-m1") collect(library);
}
assert(sources.length > 0, "No block source found");
var before = reader.metaReads(), headers = 0;
sources.forEach(function (file) {
	var text = read(file), result = same(text, String(file.getPath()));
	if (result.indexOf('"header":{') >= 0) headers++;
});
var after = reader.metaReads();
// the Java reader answered every one of them: a reading that is not counted was made by the JavaScript
assert(after.java - before.java === sources.length, "Headers not read in Java: " + (sources.length - (after.java - before.java)) + " of " + sources.length);
assert(after.fallback - before.fallback === 0, "Unexpected fallbacks: " + (after.fallback - before.fallback));
// the library beside it and this one carry more than 400 headers; this library alone more than 150
assert(headers >= (neighbours > 1 ? 400 : 150), "Too few headers compared: " + headers);

// what the reader does not take on, read by the JavaScript with its own messages
var fixtures = JSON.parse(read(new File(project, "tests/fixtures/portable-metadata-headers.json")));
var refused = fixtures.invalid.concat([
	"const _meta = {a: `x`};\nfunction A(){}",
	"const _meta = {a: 1 + 1};\nfunction A(){}",
	"const _meta = {a: 1, a: 2};\nfunction A(){}",
	"const _meta = {a: 1};\nconst _meta = {b: 2};\nfunction A(){}",
	"const _meta = {a: 1}\nfoo bar;\nfunction A(){}",
	"const _meta = {a: 1;\nfunction A(){}",
	"const _meta\nfunction A(){}",
	"/* open comment\nconst _meta = {};",
	"const _meta = {a: 'x\\qy'};\nfunction A(){}",
	"const _meta = {a: \"line\nbreak\"};\nfunction A(){}"
]);
var fallbacks = reader.metaReads().fallback;
refused.forEach(function (source) {
	assert(Native.extract(source) === null, "The Java reader took on a header it must leave: " + source);
	same(source, source);
});
assert(reader.metaReads().fallback - fallbacks === refused.length, "A refused header was not counted as a fallback");
// the valid ones of the portable corpus are read by Java as well
var reads = reader.metaReads().java;
fixtures.valid.forEach(function (item) { same(item.source, item.source); });
assert(reader.metaReads().java - reads === fixtures.valid.length, "A valid header was not read in Java");
var errors = refused.filter(function (source) { return /^throws/.test(outcome(function () { return reader.extractMeta(source, env); })); });
assert(errors.length >= 10, "The refused headers no longer raise");
print("block-meta-java-reader OK (" + headers + " headers of " + sources.length + " sources, " + refused.length + " fallbacks, " + checks + " checks)");
