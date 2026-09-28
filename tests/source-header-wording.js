// The rendered FlowScript header describes the current product (FlowScript v2,
// no Flow YAML); sources written with the earlier "spike" header still parse.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-header-wording-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function stable(value) {
	if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
	if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + stable(value[key]); }).join(",") + "}";
	return JSON.stringify(value);
}
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var body = 'const _flow = {sourceVersion:2}\nfunction Header({ input, config, result }) {\n  result.ok = true\n}';
	var parsed = api("flowSourceValidate", { name: "Header", code: body });
	assert(parsed.ok, "Fixture: " + JSON.stringify(parsed));

	var rendered = api("flowSourceValidate", { name: "Header", flowSource: parsed.source });
	var header = rendered.code.split("\n").filter(function (line) { return line.indexOf("// c8o:") === 0; });
	assert(header.length === 2 && header[0].indexOf("FlowScript, sourceVersion 2") !== -1, "New header expected: " + rendered.code);
	assert(!/spike|Flow YAML|compiles/i.test(header.join("\n")), "Stale header wording: " + header.join("\n"));
	var bare = api("flowSourceValidate", { name: "Header", flowSource: parsed.source, includeHeader: false });
	assert(bare.code.indexOf("// c8o:") === -1, "includeHeader:false must not write a header");

	var old = "// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.\n" +
		"// c8o: Patch with the returned revision. The engine validates and compiles this code back to Flow YAML.\n\n";
	var legacy = api("flowSourceValidate", { name: "Header", code: old + body });
	assert(legacy.ok && stable(legacy.definition) === stable(parsed.definition), "A source with the old header must still parse identically: " + JSON.stringify(legacy));
	var fresh = api("flowSourceValidate", { name: "Header", code: rendered.code });
	assert(fresh.ok && stable(fresh.definition) === stable(parsed.definition), "A source with the new header must parse identically: " + JSON.stringify(fresh));
	var legacyRun = api("run", { flowSource: old + body, includeTrace: false });
	assert(legacyRun.ok && legacyRun.result.ok === true, "A source with the old header must run: " + JSON.stringify(legacyRun));

	print("source-header-wording OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
