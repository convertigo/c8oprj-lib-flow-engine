// Migrates the FlowScript sources of a project to the ${} value notation: a quoted string holding former
// {{ expression }} placeholders becomes what it meant, the expression itself ("{{ local.x }}" -> local.x) or a
// template literal ("Hi {{ input.name }}" -> `Hi ${input.name}`). Only those strings change: comments and layout
// stay. A rewrite is written only when the Flow parses to the same definition before and after.
//
// Usage (Rhino, Convertigo dependencies jar on the classpath):
//   java -cp dependencies.jar org.mozilla.javascript.tools.shell.Main -version 200 \
//     tools/migrate-value-notation.js <lib_flow_engine/_flow> <project dir> [--write]
var engineDir = String(new java.io.File(arguments[0]).getAbsolutePath());
var projectRoot = new java.io.File(arguments[1]).getAbsoluteFile();
var write = arguments.length > 2 && String(arguments[2]) === "--write";
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectRoot.getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var syntax = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/template-syntax.js"), "UTF-8")));

function cook(token) {
	var quote = token.charAt(0), out = "";
	var escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" };
	for (var i = 1; i < token.length - 1; i++) {
		var ch = token.charAt(i);
		if (ch === "\\") {
			var next = token.charAt(++i);
			if (next === "u") {
				out += String.fromCharCode(parseInt(token.substr(i + 1, 4), 16));
				i += 4;
			} else {
				out += Object.prototype.hasOwnProperty.call(escapes, next) ? escapes[next] : next;
			}
		} else if (ch !== quote) {
			out += ch;
		}
	}
	return out;
}

function templateLiteral(parts) {
	return "`" + parts.map(function (part) {
		return part.expression !== undefined ? "${" + part.expression + "}" : part.literal
			.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
			.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
	}).join("") + "`";
}

// The FlowScript text of a former quoted value, or null when it holds no {{ }}.
function replacement(token) {
	var value = cook(token);
	if (value.indexOf("{{") === -1) {
		return null;
	}
	var parts = syntax.parts(value, true);
	if (!parts || !parts.some(function (part) { return part.expression !== undefined; })) {
		return null;
	}
	return parts.length === 1 ? parts[0].expression : templateLiteral(parts);
}

// Rewrites the quoted strings of a JavaScript-like source, outside comments and template literals.
function rewrite(code) {
	var out = "", i = 0, changed = 0;
	function skipTemplate() {
		var start = i++;
		while (i < code.length && code.charAt(i) !== "`") {
			if (code.charAt(i) === "\\") {
				i += 2;
				continue;
			}
			if (code.charAt(i) === "$" && code.charAt(i + 1) === "{") {
				i += 2;
				var depth = 1;
				while (i < code.length && depth > 0) {
					var c = code.charAt(i);
					if (c === "\"" || c === "'") {
						skipString();
						continue;
					}
					if (c === "`") {
						skipTemplate();
						continue;
					}
					if (c === "{") depth++;
					else if (c === "}") depth--;
					i++;
				}
				continue;
			}
			i++;
		}
		i++;
		return code.substring(start, i);
	}
	function skipString() {
		var quote = code.charAt(i), start = i++;
		while (i < code.length && code.charAt(i) !== quote && code.charAt(i) !== "\n") {
			i += code.charAt(i) === "\\" ? 2 : 1;
		}
		i++;
		return code.substring(start, i);
	}
	while (i < code.length) {
		var ch = code.charAt(i);
		if (ch === "/" && code.charAt(i + 1) === "/") {
			var end = code.indexOf("\n", i);
			end = end < 0 ? code.length : end;
			out += code.substring(i, end);
			i = end;
		} else if (ch === "/" && code.charAt(i + 1) === "*") {
			var close = code.indexOf("*/", i + 2);
			close = close < 0 ? code.length : close + 2;
			out += code.substring(i, close);
			i = close;
		} else if (ch === "`") {
			out += skipTemplate();
		} else if (ch === "\"" || ch === "'") {
			var token = skipString();
			var next = replacement(token);
			if (next === null) {
				out += token;
			} else {
				out += next;
				changed++;
			}
		} else {
			out += ch;
			i++;
		}
	}
	return { code: out, changed: changed };
}

function definitionOf(name, code) {
	var out = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: name, code: code })));
	if (!out.ok && !out.source) {
		return { error: JSON.stringify(out.error || out.diagnostics || out).substring(0, 400) };
	}
	return { source: String(out.source) };
}

// A graph block: its _meta values (display, default) are stored values, written in the current notation; its
// FlowScript body is rewritten as a Flow is.
function migrateBlock(file, name, code) {
	var metaEnd = code.indexOf("\n}\n");
	if (code.indexOf("const _meta") !== 0 || metaEnd < 0) {
		return null;
	}
	var meta = code.substring(0, metaEnd + 3), body = code.substring(metaEnd + 3);
	var metaChanged = 0;
	var nextMeta = meta.replace(/("(?:display|default)"\s*:\s*)"((?:[^"\\]|\\.)*)"/g, function (all, key, value) {
		if (value.indexOf("{{") === -1) {
			return all;
		}
		var mapped = syntax.map(cook("\"" + value + "\""), null, true);
		metaChanged++;
		return key + JSON.stringify(mapped);
	});
	var graph = /^function [A-Za-z_$][\w$]*\(\{/m.test(body);
	var nextBody = graph ? rewrite(body) : { code: body, changed: 0 };
	if (!metaChanged && !nextBody.changed) {
		return { changed: 0 };
	}
	if (nextBody.changed) {
		var header = /^const _flow\b/m.test(body) ? "" : "const _flow = { sourceVersion: 2 }\n";
		var before = definitionOf(name, header + body), after = definitionOf(name, header + nextBody.code);
		if (before.error || after.error || before.source !== after.source) {
			return { changed: metaChanged + nextBody.changed, refused: before.error || after.error || "the definition changes", before: before.source, after: after.source };
		}
	}
	return { changed: metaChanged + nextBody.changed, code: nextMeta + nextBody.code };
}

var blocksDir = new java.io.File(projectRoot, "_flow/blocks");
var blockFiles = blocksDir.isDirectory() ? FileUtils.listFiles(blocksDir, ["js"], true).toArray() : [];
var blockReport = { migrated: [], refused: [] };
for (var b = 0; b < blockFiles.length; b++) {
	if (!/\.block\.js$/.test(String(blockFiles[b].getName()))) {
		continue;
	}
	var blockName = String(blockFiles[b].getName()).replace(/\.block\.js$/, "");
	var migrated = migrateBlock(blockFiles[b], blockName, String(FileUtils.readFileToString(blockFiles[b], "UTF-8")));
	if (!migrated || !migrated.changed) {
		continue;
	}
	var relative = String(blocksDir.toPath().relativize(blockFiles[b].toPath()));
	if (migrated.refused) {
		blockReport.refused.push({ block: relative, reason: migrated.refused, before: migrated.before, after: migrated.after });
		continue;
	}
	if (write) {
		FileUtils.writeStringToFile(blockFiles[b], migrated.code, "UTF-8");
	}
	blockReport.migrated.push({ block: relative, strings: migrated.changed });
}

var flowsDir = new java.io.File(projectRoot, "_flow/flows");
var files = flowsDir.isDirectory() ? FileUtils.listFiles(flowsDir, ["js"], true).toArray() : [];
var report = { project: String(projectRoot.getName()), migrated: [], unchanged: 0, refused: [], blocks: blockReport };
for (var f = 0; f < files.length; f++) {
	var file = files[f];
	if (!/\.flow\.js$/.test(String(file.getName()))) {
		continue;
	}
	var name = String(file.getName()).replace(/\.flow\.js$/, "");
	var code = String(FileUtils.readFileToString(file, "UTF-8"));
	var next = rewrite(code);
	if (!next.changed) {
		report.unchanged++;
		continue;
	}
	var before = definitionOf(name, code), after = definitionOf(name, next.code);
	if (before.error || after.error || before.source !== after.source) {
		report.refused.push({ flow: name, reason: before.error || after.error || "the definition changes", before: before.source, after: after.source });
		continue;
	}
	if (write) {
		FileUtils.writeStringToFile(file, next.code, "UTF-8");
	}
	report.migrated.push({ flow: name, strings: next.changed });
}
print(JSON.stringify(report, null, 1));
