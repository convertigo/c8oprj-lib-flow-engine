// FlowScript v2 -> v3 migration of the Flows of a project (lot L2, flowscript-v3.md section 14). For each
// _flow/flows/**/*.flow.js written in v2, the v2 text is read, its definition rendered in v3 and read back: the v3 text
// is kept only when it gives the same definition (the guard of flowCodeMigrateV3). A Flow whose guard fails stays in
// v2 and is reported with the cause. A dry run by default: --write writes the v3 texts, and never writes anything for
// a project where one Flow raised an unexpected error. The FlowScript sources written in strings of the project's
// tests are counted, never changed.
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
	graphBlocks: 0
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

listFiles(new java.io.File(projectRoot, "_flow/blocks"), /\.block\.js$/).forEach(function (file) {
	if (/^function [A-Za-z_$][\w$]*\(\{/m.test(String(FileUtils.readFileToString(file, "UTF-8")))) report.graphBlocks++;
});

if (write && !report.flows.errors.length) {
	planned.forEach(function (entry) { FileUtils.writeStringToFile(entry.file, entry.code, "UTF-8"); });
	report.written = planned.length > 0;
}
report.summary = report.project + ": " + report.flows.total + " Flows, " + report.flows.migrated.length + " migrated" +
	(write ? (report.written ? " and written" : report.flows.errors.length ? ", nothing written (unexpected errors)" : "") : " (dry run)") +
	", " + report.flows.keptV2.length + " kept in v2, " + report.flows.alreadyV3.length + " already v3, " + report.flows.errors.length +
	" unexpected errors; tests: " + report.tests.sources + " FlowScript strings in " + report.tests.files.length + " files (" + report.tests.v2 + " v2, " +
	report.tests.v3 + " v3), " + report.tests.flowFiles.length + " .flow.js fixtures; " + report.graphBlocks + " FlowScript graph blocks (not migrated).";
print(JSON.stringify(report, null, 1));
