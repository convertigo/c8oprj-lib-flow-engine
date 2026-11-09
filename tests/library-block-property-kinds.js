// No property of a library block or trait declares a value type (boolean, integer, number, array, object) without a
// kind: the kind says how its argument is read, and a block written against the former reading of such a property
// (the text of its argument) must not hide in a library. Checks this engine and, when the layout provides them, the
// neighbour libraries (sql, crud data, entity, Svelte frontbuilder, MCP).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
var VALUE_TYPES = ["boolean", "integer", "number", "array", "object"];

// the _meta object literal of a block or trait source, up to its closing brace (strings and comments skipped)
function metaOf(source, file) {
	var match = /(?:const|let|var)\s+_meta\s*=\s*\{/.exec(source);
	assert(match, "no _meta in " + file);
	var start = match.index + match[0].length - 1, depth = 0, quote = null;
	for (var i = start; i < source.length; i++) {
		var c = source.charAt(i);
		if (quote) {
			if (c === "\\") i++;
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") quote = c;
		else if (c === "/" && source.charAt(i + 1) === "/") i = source.indexOf("\n", i);
		else if (c === "/" && source.charAt(i + 1) === "*") i = source.indexOf("*/", i) + 1;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return eval("(" + source.substring(start, i + 1) + ")");
	}
	throw new Error("unterminated _meta in " + file);
}

function sourceFiles(dir, out) {
	var list = dir.listFiles();
	for (var i = 0; list && i < list.length; i++) {
		var name = String(list[i].getName());
		if (name === "node_modules" || name.charAt(0) === ".") continue;
		if (list[i].isDirectory()) sourceFiles(list[i], out);
		else if (/\.(block|trait)\.js$/.test(name)) out.push(list[i]);
	}
	return out;
}

// {file, property, type} for each property declaring a value type without a kind
function untypedKinds(flowDir) {
	var found = [], scanned = 0;
	sourceFiles(flowDir, []).forEach(function (file) {
		scanned++;
		var meta = metaOf(read(file), file);
		var props = meta.properties || meta.props || {};
		var entries = [];
		if (Object.prototype.toString.call(props) === "[object Array]") {
			props.forEach(function (prop) { if (prop && prop.name) entries.push([String(prop.name), prop]); });
		} else {
			Object.keys(props).forEach(function (key) { entries.push([key, props[key]]); });
		}
		if (meta.additionalProperties && typeof meta.additionalProperties === "object") entries.push(["(additionalProperties)", meta.additionalProperties]);
		entries.forEach(function (entry) {
			var descriptor = entry[1];
			var type = descriptor && typeof descriptor === "object" ? String(descriptor.type || "").toLowerCase() : "";
			if (!descriptor.kind && VALUE_TYPES.indexOf(type) !== -1) {
				found.push({ file: String(flowDir.toPath().relativize(file.toPath())), property: entry[0], type: type });
			}
		});
	});
	return { found: found, scanned: scanned };
}

// the scan finds such a property
var fixture = java.nio.file.Files.createTempDirectory("flow-library-property-kinds-").toFile();
try {
	files.writeStringToFile(new File(fixture, "blocks/demo/flag.block.js"),
		'// a block\nconst _meta = {\n  "description": "Has { braces } in text.",\n  "properties": {\n    "enabled": { "type": "boolean" },\n' +
		'    "count": { "kind": "expression", "type": "integer" },\n    "label": { "type": "string" }\n  },\n}\nfunction flag({ input }) {\n  return input.enabled\n}\n', "UTF-8");
	files.writeStringToFile(new File(fixture, "traits/demo/sized.trait.js"),
		'const _meta = { name: "demo.sized", properties: { size: { type: "number" } } };\n', "UTF-8");
	var probe = untypedKinds(fixture);
	assert(JSON.stringify(probe.found) === JSON.stringify([
		{ file: "blocks/demo/flag.block.js", property: "enabled", type: "boolean" },
		{ file: "traits/demo/sized.trait.js", property: "size", type: "number" }
	]), "the scan finds a typed property without kind: " + JSON.stringify(probe.found));
} finally {
	files.deleteDirectory(fixture);
}

// this engine, then the neighbour libraries the layout provides
var engineProject = engineDir.getParentFile();
var libraries = [{ name: "lib_flow_engine", flowDir: engineDir }];
function addLibrary(name, root) {
	if (!root || !new File(root, "_flow").isDirectory()) return;
	var canonical = String(root.getCanonicalPath());
	if (libraries.some(function (library) { return String(library.flowDir.getParentFile().getCanonicalPath()) === canonical; })) return;
	libraries.push({ name: name, flowDir: new File(root, "_flow").getCanonicalFile() });
}
var siblings = engineProject.getParentFile();
["lib_flow_sql", "lib_flow_crud_data", "lib_flow_entity", "lib_flow_frontbuilder_svelte", "lib_flow_mcp"].forEach(function (name) {
	[name, "c8oprj-" + name.replace(/_/g, "-")].forEach(function (dir) { addLibrary(name, new File(siblings, dir)); });
});
var provider = java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT");
for (var root = provider ? new File(String(provider)).getCanonicalFile() : null; root; root = root.getParentFile()) {
	if (new File(root, "c8oProject.yaml").isFile()) { addLibrary("lib_flow_frontbuilder_svelte", root); break; }
}

var problems = [];
var report = libraries.map(function (library) {
	var scan = untypedKinds(library.flowDir);
	scan.found.forEach(function (entry) {
		problems.push(library.name + ": " + entry.file + " property " + entry.property + " declares type " + entry.type + " without kind");
	});
	return library.name + " " + scan.scanned;
});
assert(Number(report[0].split(" ")[1]) > 100, "the engine blocks are scanned: " + report[0]);
assert(problems.length === 0, problems.length + " library block properties declare a value type without kind (add the kind the block reads):\n" + problems.join("\n"));
print("library-block-property-kinds OK (" + report.join(", ") + " files)");
