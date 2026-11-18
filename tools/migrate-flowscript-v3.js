// FlowScript v2 -> v3 migration of the Flows of a project (lot L2, flowscript-v3.md section 14). For each
// _flow/flows/**/*.flow.js written in v2, the v2 text is read, its definition rendered in v3 and read back: the v3 text
// is kept only when it gives the same definition (the guard of flowCodeMigrateV3). A Flow whose guard fails stays in
// v2 and is reported with the cause. A dry run by default: --write writes the v3 texts, and never writes anything for
// a project where one Flow or block raised an unexpected error. The FlowScript sources written in strings of the
// project's tests are counted, never changed.
//
// The blocks of _flow/blocks written in FlowScript (a _meta declaring sourceVersion 2, a FlowScript implementation for
// the backend) go through the same guard, then the whole v3 block file (its _meta with sourceVersion 3, unchanged
// otherwise, and the v3 text of its implementation) is compiled by the engine as it loads a block: it is kept only
// when its contract and its definition are those of the v2 file. A block is written whole or not at all; Rhino blocks,
// frontend blocks and blocks without a declared sourceVersion are counted, never changed.
//
// Usage (Rhino, Convertigo engine and dependencies jars on the classpath; tools/migrate-flowscript-v3.sh sets it):
//   java -cp <classpath> org.mozilla.javascript.tools.shell.Main -version 200 \
//     tools/migrate-flowscript-v3.js <lib_flow_engine/_flow> <project dir> [--write]
var engineDir = String(new java.io.File(arguments[0]).getCanonicalPath());
var projectRoot = new java.io.File(arguments[1]).getCanonicalFile();
var write = Array.prototype.slice.call(arguments, 2).map(String).indexOf("--write") >= 0;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectRoot.getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));

function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }

function relative(file) { return String(projectRoot.toPath().relativize(file.toPath())); }

function listFiles(dir, pattern) {
	if (!dir.isDirectory()) return [];
	var out = [], found = FileUtils.listFiles(dir, null, true).toArray();
	for (var i = 0; i < found.length; i++) {
		var path = String(found[i].getPath());
		if (/[\/\\]node_modules[\/\\]/.test(path)) continue;
		if (pattern.test(String(found[i].getName()))) out.push(found[i]);
	}
	return out.sort(function (a, b) { return String(a.getPath()) < String(b.getPath()) ? -1 : 1; });
}

// The string literals of a JavaScript file (quotes and template literals, outside comments and regular expressions).
function stringLiterals(code) {
	var out = [], i = 0, last = "";
	function readQuoted(quote) {
		var start = i++, value = "";
		while (i < code.length && code.charAt(i) !== quote) {
			if (code.charAt(i) === "\\") { value += code.substr(i, 2); i += 2; continue; }
			if (quote === "`" && code.charAt(i) === "$" && code.charAt(i + 1) === "{") {
				var depth = 1; value += "${"; i += 2;
				while (i < code.length && depth) {
					var c = code.charAt(i);
					if (c === "\"" || c === "'" || c === "`") { value += readQuoted(c); continue; }
					if (c === "{") depth++; else if (c === "}") depth--;
					value += c; i++;
				}
				continue;
			}
			value += code.charAt(i++);
		}
		i++;
		out.push({ quote: quote, value: value, at: start });
		return quote + value + quote;
	}
	while (i < code.length) {
		var ch = code.charAt(i), next = code.charAt(i + 1);
		if (ch === "/" && next === "/") { while (i < code.length && code.charAt(i) !== "\n") i++; continue; }
		if (ch === "/" && next === "*") { var close = code.indexOf("*/", i + 2); i = close < 0 ? code.length : close + 2; continue; }
		if (ch === "\"" || ch === "'" || ch === "`") { readQuoted(ch); last = "x"; continue; }
		if (ch === "/" && /^$|[(,=:\[!&|?{};+\-*%<>~^]$/.test(last)) {
			i++;
			var inClass = false;
			while (i < code.length && code.charAt(i) !== "\n") {
				var r = code.charAt(i);
				if (r === "\\") { i += 2; continue; }
				if (r === "[") inClass = true; else if (r === "]") inClass = false;
				else if (r === "/" && !inClass) { i++; break; }
				i++;
			}
			last = "x";
			continue;
		}
		if (!/\s/.test(ch)) last = ch;
		i++;
	}
	return out;
}

// A FlowScript source starts with its header or its Flow function.
var SOURCE_START = /(?:\bconst\s+_flow\s*=|\bfunction\s+[A-Za-z_$][\w$]*\s*\(\s*\{\s*input\b)/;

function testStrings(file) {
	var literals = stringLiterals(String(FileUtils.readFileToString(file, "UTF-8"))), sources = 0, v3 = 0;
	literals.forEach(function (literal) {
		if (!SOURCE_START.test(literal.value)) return;
		sources++;
		if (/sourceVersion\s*:\s*3\b/.test(literal.value)) v3++;
	});
	return { sources: sources, v3: v3, v2: sources - v3 };
}

var report = {
	project: String(projectRoot.getName()),
	mode: write ? "write" : "dry-run",
	written: false,
	flows: { total: 0, migrated: [], keptV2: [], alreadyV3: [], errors: [] },
	tests: { files: [], sources: 0, v2: 0, v3: 0, flowFiles: [] },
	blocks: { total: 0, migrated: [], keptV2: [], alreadyV3: [], errors: [], outOfScope: [] }
};

var flowFiles = listFiles(new java.io.File(projectRoot, "_flow/flows"), /\.flow\.js$/);
var planned = [];
flowFiles.forEach(function (file) {
	var name = String(file.getName()).replace(/\.flow\.js$/, ""), code = String(FileUtils.readFileToString(file, "UTF-8"));
	report.flows.total++;
	var out;
	try { out = api("flowCodeMigrateV3", { name: name, code: code }); }
	catch (error) { out = { ok: false, error: { code: "MIGRATION_EXCEPTION", message: String(error) } }; }
	if (out.error) {
		report.flows.errors.push({ flow: relative(file), code: String(out.error.code || ""), message: String(out.error.message || "").substring(0, 600) });
		return;
	}
	if (out.sourceVersion === 3 && !out.migrated) { report.flows.alreadyV3.push(relative(file)); return; }
	if (!out.ok) {
		report.flows.keptV2.push({ flow: relative(file), reason: String(out.reason || "").substring(0, 900) });
		return;
	}
	report.flows.migrated.push({ flow: relative(file), natural: out.natural, calledByGuard: (out.called || []).map(function (entry) {
		return { node: entry.key, kind: entry.kind, reason: String(entry.reason || "").substring(0, 400) };
	}) });
	planned.push({ file: file, code: out.code });
});

listFiles(new java.io.File(projectRoot, "tests"), /\.(?:c|m)?js$/).forEach(function (file) {
	if (/\.flow\.js$/.test(String(file.getName()))) { report.tests.flowFiles.push(relative(file)); return; }
	var found = testStrings(file);
	if (!found.sources) return;
	report.tests.files.push({ file: relative(file), sources: found.sources, v2: found.v2, v3: found.v3 });
	report.tests.sources += found.sources;
	report.tests.v2 += found.v2;
	report.tests.v3 += found.v3;
});

// The _meta object literal at the start of a block file: { start, end, text }, end after its closing brace (and ;).
function blockMeta(code) {
	var found = /(^|\n)const _meta\s*=\s*\{/.exec(code);
	if (!found) return null;
	var start = found.index + found[1].length, i = found.index + found[0].length, depth = 1, quote = "";
	for (; i < code.length && depth; i++) {
		var ch = code.charAt(i);
		if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = ""; continue; }
		if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
		else if (ch === "/" && code.charAt(i + 1) === "/") { while (i < code.length && code.charAt(i) !== "\n") i++; }
		else if (ch === "{") depth++;
		else if (ch === "}") depth--;
	}
	if (depth) return null;
	if (code.charAt(i) === ";") i++;
	return { start: start, end: i, text: code.substring(start, i) };
}

var codeService = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
var renderer = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-renderer.js"), "UTF-8")));
var yamlMapper = new Packages.com.fasterxml.jackson.dataformat.yaml.YAMLMapper(), jsonMapper = new Packages.com.fasterxml.jackson.databind.ObjectMapper();
function yamlValue(text) { return JSON.parse(String(jsonMapper.writeValueAsString(yamlMapper.readValue(String(text), java.lang.Class.forName("java.lang.Object"))))); }

// The block as the engine compiles it from a file: its contract and its definition, comparable across source versions
// as the guard compares a Flow (guardDefinition: runtime defaults, a step computed in a hidden local then assigned).
function compiledBlock(name, code) {
	var out = api("blockCodeSet", { name: name, code: code, dry: true });
	if (!out.ok) return { error: String(out.error && (out.error.code + ": " + out.error.message) || JSON.stringify(out)).substring(0, 600) };
	var descriptor = JSON.parse(JSON.stringify(out.descriptor || {})), definition = yamlValue(out.implementationSource || "{}");
	delete descriptor.sourceVersion;
	definition.flow = Object.assign({}, definition.flow || {});
	definition = renderer.guardDefinition(definition);
	delete definition.flow.sourceVersion;
	return { descriptor: codeService.comparableDefinition(descriptor), definition: codeService.comparableDefinition(definition), fixes: out.fixes || [] };
}

// Where two comparable texts first differ, with some context.
function firstDifference(expected, actual) {
	var at = 0;
	while (at < expected.length && expected.charAt(at) === actual.charAt(at)) at++;
	return "at " + at + ": expected …" + expected.substring(Math.max(0, at - 60), at + 80) + "… read …" + actual.substring(Math.max(0, at - 60), at + 80) + "…";
}

var blocksDir = new java.io.File(projectRoot, "_flow/blocks"), plannedBlocks = [];
listFiles(blocksDir, /\.block\.js$/).forEach(function (file) {
	var code = String(FileUtils.readFileToString(file, "UTF-8"));
	if (!/^function [A-Za-z_$][\w$]*\(\{/m.test(code)) return;
	var name = String(blocksDir.toPath().relativize(file.toPath())).replace(/\\/g, "/").replace(/\.block\.js$/, "").replace(/\//g, ".");
	var meta = blockMeta(code), path = relative(file);
	report.blocks.total++;
	if (!meta) { report.blocks.outOfScope.push({ block: path, reason: "no _meta object at the start of the file" }); return; }
	var versions = meta.text.match(/(["']?)sourceVersion\1\s*:\s*(\d+)/g) || [];
	var runtime = /(["']?)runtime\1\s*:\s*["']([a-z]+)["']/.exec(meta.text.replace(/(["']?)implementations\1\s*:\s*\{[\s\S]*$/, ""));
	if (versions.length === 1 && /3$/.test(versions[0])) { report.blocks.alreadyV3.push(path); return; }
	if (runtime && runtime[2] !== "flow") { report.blocks.outOfScope.push({ block: path, reason: "runtime " + runtime[2] }); return; }
	if (/(["']?)targets\1\s*:\s*\[/.test(meta.text) && !/(["']?)targets\1\s*:\s*\[[^\]]*["']backend["']/.test(meta.text)) {
		report.blocks.outOfScope.push({ block: path, reason: "frontend block (its function is not a backend implementation)" });
		return;
	}
	if (versions.length !== 1 || !/2$/.test(versions[0])) { report.blocks.outOfScope.push({ block: path, reason: "the _meta does not declare sourceVersion 2" }); return; }
	var rest = code.substring(meta.end), fn = /^function ([A-Za-z_$][\w$]*)\(/m.exec(rest);
	var out;
	try {
		var before = compiledBlock(name, code);
		if (before.error) { report.blocks.keptV2.push({ block: path, reason: "the v2 block does not compile as a block of the project: " + before.error }); return; }
		if (before.fixes.length) { report.blocks.keptV2.push({ block: path, reason: "the v2 source gets corrections: " + JSON.stringify(before.fixes).substring(0, 400) }); return; }
		out = api("flowCodeMigrateV3", { name: fn ? fn[1] : name.replace(/\./g, "_"), code: rest });
		if (out.error) throw new Error(String(out.error.code || "") + ": " + String(out.error.message || ""));
		if (!out.ok) { report.blocks.keptV2.push({ block: path, reason: String(out.reason || "").substring(0, 900) }); return; }
		var candidate = code.substring(0, meta.start) + meta.text.replace(/((["']?)sourceVersion\2\s*:\s*)2/, function (_, declared) { return declared + "3"; }) + "\n\n" + out.code.replace(/\s*$/, "\n");
		var after = compiledBlock(name, candidate);
		var reason = after.error ? "the v3 block does not compile: " + after.error
			: after.fixes.length ? "the v3 block gets corrections: " + JSON.stringify(after.fixes).substring(0, 400)
			: after.descriptor !== before.descriptor ? "the v3 block changes the contract"
			: after.definition !== before.definition ? "the engine reads another definition from the v3 block: " + firstDifference(before.definition, after.definition) : "";
		if (reason) { report.blocks.keptV2.push({ block: path, reason: reason }); return; }
	} catch (error) {
		report.blocks.errors.push({ block: path, message: String(error.message || error).substring(0, 600) });
		return;
	}
	report.blocks.migrated.push({ block: path, natural: out.natural, calledByGuard: (out.called || []).map(function (entry) {
		return { node: entry.key, kind: entry.kind, reason: String(entry.reason || "").substring(0, 400) };
	}) });
	plannedBlocks.push({ file: file, code: candidate });
});

if (write && !report.flows.errors.length && !report.blocks.errors.length) {
	planned.concat(plannedBlocks).forEach(function (entry) { FileUtils.writeStringToFile(entry.file, entry.code, "UTF-8"); });
	report.written = planned.length + plannedBlocks.length > 0;
}
var unexpected = report.flows.errors.length + report.blocks.errors.length;
report.summary = report.project + ": " + report.flows.total + " Flows, " + report.flows.migrated.length + " migrated" +
	(write ? (report.written ? " and written" : unexpected ? ", nothing written (unexpected errors)" : "") : " (dry run)") +
	", " + report.flows.keptV2.length + " kept in v2, " + report.flows.alreadyV3.length + " already v3, " + report.flows.errors.length +
	" unexpected errors; FlowScript blocks: " + report.blocks.total + ", " + report.blocks.migrated.length + " migrated, " + report.blocks.keptV2.length +
	" kept in v2, " + report.blocks.alreadyV3.length + " already v3, " + report.blocks.outOfScope.length + " out of scope, " + report.blocks.errors.length +
	" unexpected errors; tests: " + report.tests.sources + " FlowScript strings in " + report.tests.files.length + " files (" + report.tests.v2 + " v2, " +
	report.tests.v3 + " v3), " + report.tests.flowFiles.length + " .flow.js fixtures.";
print(JSON.stringify(report, null, 1));
