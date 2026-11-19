// Declares the accessibility of the Flows of a project that declare none. A server takes the accessibility of a Flow from
// _flow.accessibility in the header of its source, else from the accessibility: line of its YAML, else from the default
// of the class, which is Private since Convertigo 8.5.0 (Public before). Each [flow.Flow] of c8oProject.yaml is listed
// with what declares its accessibility: the header, the YAML or nothing. A Flow that declares nothing raises
// FLOW_ACCESSIBILITY_UNDECLARED. A dry run by default; the exit code is 1 when such a Flow exists, or when a Flow could
// not be read, and 0 otherwise, so that a library can run it in its suite as a check.
//
// --write adds accessibility: "public" (the former default) to the _flow header of these Flows only, in the style of the
// header: on its line when the header is written on one line, on its own line after sourceVersion when it is written on
// several lines (as the first property without sourceVersion). It changes nothing else: neither the rest of the file,
// nor the YAML, nor a Flow that declares an accessibility, whatever its value. Running it again changes nothing.
//
// The guard reads the text with the engine, through the v2 reader or the Java v3 reader as its sourceVersion says, before
// writing and again from the file once written: the server must read Public, and the definition must be the one of the
// file before, but for _flow.accessibility. Otherwise nothing is written, or the written file is put back byte for byte,
// and the Flow is reported. A Flow whose source is missing or unreadable is reported, never written. The .flow.svelte
// files and the blocks are out of scope.
//
// Usage (Rhino, Convertigo engine and dependencies jars on the classpath; tools/declare-flow-accessibility.sh sets it):
//   java -cp <classpath> org.mozilla.javascript.tools.shell.Main -version 200 \
//     tools/declare-flow-accessibility.js <lib_flow_engine/_flow> <project dir> [--write]
var engineDir = String(new java.io.File(arguments[0]).getCanonicalPath());
var projectRoot = new java.io.File(arguments[1]).getCanonicalFile();
var write = Array.prototype.slice.call(arguments, 2).map(String).indexOf("--write") >= 0;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var Files = java.nio.file.Files;
var UTF8 = java.nio.charset.StandardCharsets.UTF_8;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectRoot.getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var codeService = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));

function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }

function relative(file) { return String(projectRoot.toPath().relativize(file.toPath())).replace(/\\/g, "/"); }

function errorText(out) { return String(out && out.error ? (out.error.code || "") + ": " + (out.error.message || "") : JSON.stringify(out)).substring(0, 600); }

var ACCESSIBILITIES = ["Public", "Hidden", "Private"];
function accessibilityName(value) {
	var text = String(value).trim().replace(/^(["'])(.*)\1$/, "$2");
	for (var i = 0; i < ACCESSIBILITIES.length; i++) if (ACCESSIBILITIES[i].toLowerCase() === text.toLowerCase()) return ACCESSIBILITIES[i];
	return text;
}

// The [flow.Flow] of c8oProject.yaml, each with the accessibility: line of its properties (inline, or at the top of the
// _c8oProject/<file> it names), null without one.
var FLOW_ENTRY = /^(\s*)\u2193(\S+) \[flow\.Flow(?:-\d+)?\]:?\s*(?:(?:\uD83D\uDDCF\s*)?(\S+))?\s*$/;
var ACCESSIBILITY_LINE = /^accessibility:\s*(\S.*?)\s*$/;
function projectFlows(yaml) {
	var lines = yaml.split(/\r?\n/), flows = [];
	lines.forEach(function (line, index) {
		var entry = FLOW_ENTRY.exec(line);
		if (!entry) return;
		var indent = entry[1].length, declared = null, found;
		if (entry[3]) {
			var file = new java.io.File(projectRoot, "_c8oProject/" + entry[3]);
			var sub = file.isFile() ? String(FileUtils.readFileToString(file, "UTF-8")).split(/\r?\n/) : [];
			for (var i = 0; i < sub.length && sub[i].charAt(0) !== "\u2193"; i++) if ((found = ACCESSIBILITY_LINE.exec(sub[i]))) declared = found[1];
		} else {
			for (var j = index + 1; j < lines.length; j++) {
				var text = lines[j], at = text.search(/\S/);
				if (at < 0) continue;
				if (at <= indent) break;
				if (at === indent + 2 && (found = ACCESSIBILITY_LINE.exec(text.substring(at)))) declared = found[1];
			}
		}
		flows.push({ name: entry[2], yaml: declared === null ? null : accessibilityName(declared) });
	});
	return flows;
}

// The code with the text of its comments and strings (template literals included) blanked, newlines kept, so that the
// structure of the header can be read with regular expressions and brace counts.
function blankedCode(code) {
	var out = [], i = 0, n = code.length;
	function blank(from, to) { for (var k = from; k < to; k++) out.push(code.charAt(k) === "\n" || code.charAt(k) === "\r" ? code.charAt(k) : " "); }
	function stringEnd(at) {
		var quote = code.charAt(at), j = at + 1;
		while (j < n) {
			var ch = code.charAt(j);
			if (ch === "\\") { j += 2; continue; }
			if (ch === quote) return j + 1;
			if (quote !== "`" && ch === "\n") return j;
			if (quote === "`" && ch === "$" && code.charAt(j + 1) === "{") { j = expressionEnd(j + 2); continue; }
			j++;
		}
		return n;
	}
	function expressionEnd(at) {
		var depth = 1, j = at;
		while (j < n && depth) {
			var ch = code.charAt(j);
			if (ch === "\"" || ch === "'" || ch === "`") { j = stringEnd(j); continue; }
			if (ch === "/" && code.charAt(j + 1) === "/") { while (j < n && code.charAt(j) !== "\n") j++; continue; }
			if (ch === "/" && code.charAt(j + 1) === "*") { var close = code.indexOf("*/", j + 2); j = close < 0 ? n : close + 2; continue; }
			if (ch === "{") depth++; else if (ch === "}") depth--;
			j++;
		}
		return j;
	}
	while (i < n) {
		var ch = code.charAt(i), next = code.charAt(i + 1), end;
		if (ch === "/" && next === "/") { end = code.indexOf("\n", i); end = end < 0 ? n : end; blank(i, end); i = end; continue; }
		if (ch === "/" && next === "*") { end = code.indexOf("*/", i + 2); end = end < 0 ? n : end + 2; blank(i, end); i = end; continue; }
		if (ch === "\"" || ch === "'" || ch === "`") {
			end = stringEnd(i);
			out.push(ch); blank(i + 1, Math.max(i + 1, end - 1));
			if (end - 1 > i) out.push(code.charAt(end - 1));
			i = end;
			continue;
		}
		out.push(ch);
		i++;
	}
	return out.join("");
}

// The _flow object of the header, before the first function as the engine splits a source:
// { open, close, properties: [{ key, start, keyEnd, end, comma }] } (end: after the value, comma: -1 without one), null
// without a _flow declaration, { error } when it cannot be read with certainty.
function flowHeader(code) {
	var blanked = blankedCode(code);
	var fn = /(^|\n)[ \t]*(?:flow|function)\s+[A-Za-z_$][\w$]*\s*\(/.exec(blanked);
	var prelude = fn ? fn.index : blanked.length;
	var declaration = /(^|[\n;])[ \t]*(?:const|let|var)\s+_flow\s*=\s*/g, found = [], match;
	while ((match = declaration.exec(blanked)) && match.index < prelude) found.push(match.index + match[0].length);
	if (!found.length) return null;
	if (found.length > 1) return { error: "several _flow declarations" };
	var open = found[0];
	if (blanked.charAt(open) !== "{") return { error: "_flow is not an object literal" };
	var depth = 0, close = -1, i;
	for (i = open; i < blanked.length; i++) {
		var ch = blanked.charAt(i);
		if ("{[(".indexOf(ch) >= 0) depth++;
		else if ("}])".indexOf(ch) >= 0 && --depth === 0) { close = i; break; }
	}
	if (close < 0) return { error: "the _flow object is not closed" };
	var properties = [], start = open + 1;
	depth = 0;
	for (i = open + 1; i <= close; i++) {
		var c = blanked.charAt(i);
		if (i < close && "{[(".indexOf(c) >= 0) { depth++; continue; }
		if (i < close && "}])".indexOf(c) >= 0) { depth--; continue; }
		if (i < close && (c !== "," || depth)) continue;
		var segment = blanked.substring(start, i), lead = segment.search(/\S/);
		if (lead >= 0) {
			var at = start + lead, end = start + segment.replace(/\s+$/, "").length, key = null, keyEnd = at;
			var bare = /^[A-Za-z_$][\w$]*/.exec(blanked.substring(at, end));
			if (bare) { key = bare[0]; keyEnd = at + key.length; }
			else if (/["']/.test(blanked.charAt(at))) {
				var closing = blanked.indexOf(blanked.charAt(at), at + 1);
				if (closing > at && closing < end) { key = code.substring(at + 1, closing); keyEnd = closing + 1; }
			}
			if (key === null || !/^\s*:/.test(blanked.substring(keyEnd, end))) return { error: "a property of _flow is not a plain key: value" };
			properties.push({ key: key, start: at, keyEnd: keyEnd, end: end, comma: c === "," && i < close ? i : -1 });
		}
		start = i + 1;
	}
	return { open: open, close: close, properties: properties, blanked: blanked };
}

function propertyNamed(header, name) {
	for (var i = 0; i < header.properties.length; i++) if (header.properties[i].key === name) return i;
	return -1;
}

// Where accessibility: "public" goes, as insertions [{ at, text }] into the code: after sourceVersion, else first,
// written like the keys of the header (quoted or not, the space after the colon).
function declarationEdits(code, header) {
	var props = header.properties, anchorIndex = propertyNamed(header, "sourceVersion");
	var anchor = anchorIndex >= 0 ? props[anchorIndex] : null, next = anchor ? props[anchorIndex + 1] : props[0];
	var model = props[0], quote = model && /["']/.test(code.charAt(model.start)) ? code.charAt(model.start) : "";
	var colon = model ? /^\s*:[ \t]*/.exec(header.blanked.substring(model.keyEnd, model.end))[0].replace(/^\s+/, "") : ": ";
	var entry = quote + "accessibility" + quote + (colon === ":" ? ":" : ": ") + "\"public\"";
	var newline = code.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
	var reference = anchor || next;
	if (!reference) {
		var inside = code.substring(header.open + 1, header.close);
		return [{ at: header.open + 1, text: inside.indexOf("\n") >= 0 ? newline + "  " + entry + "," : " " + entry + (inside.length ? "" : " ") }];
	}
	var lineStart = code.lastIndexOf("\n", reference.start - 1) + 1;
	// on its own line only when the property it follows (or precedes) starts its line, below the opening brace
	var multiline = lineStart > header.open && !code.substring(lineStart, reference.start).trim();
	var separator = model.comma >= 0 && !/\s/.test(code.charAt(model.comma + 1)) ? "" : " ";
	if (!multiline) {
		if (!anchor) return [{ at: next.start, text: entry + "," + separator }];
		if (anchor.comma >= 0) return [{ at: anchor.comma + 1, text: separator + entry + "," }];
		return [{ at: anchor.end, text: "," + separator + entry }];
	}
	var indent = code.substring(lineStart, reference.start);
	if (!anchor) return [{ at: lineStart, text: indent + entry + "," + newline }];
	var after = anchor.comma >= 0 ? anchor.comma + 1 : anchor.end, lineEnd = header.blanked.indexOf("\n", after);
	if (lineEnd < 0 || lineEnd > header.close) lineEnd = header.close;
	if (code.charAt(lineEnd - 1) === "\r") lineEnd--;
	if (header.blanked.substring(after, lineEnd).trim()) {
		// another property follows on the line of sourceVersion: on that line
		return [{ at: after, text: separator + entry + "," }];
	}
	var line = newline + indent + entry + (anchor.comma >= 0 ? "," : "");
	if (anchor.comma >= 0) return [{ at: lineEnd, text: line }];
	// sourceVersion was the last property: it gets a comma
	return lineEnd === anchor.end ? [{ at: anchor.end, text: "," + line }] : [{ at: anchor.end, text: "," }, { at: lineEnd, text: line }];
}

function applyEdits(code, edits) {
	var out = code;
	edits.slice().sort(function (a, b) { return b.at - a.at; }).forEach(function (edit) { out = out.substring(0, edit.at) + edit.text + out.substring(edit.at); });
	return out;
}

// The bytes of the file with the insertions only: the bytes around them are those of the file.
function editedBytes(bytes, code, edits) {
	var out = new java.io.ByteArrayOutputStream(), from = 0;
	edits.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (edit) {
		var to = new java.lang.String(code.substring(0, edit.at)).getBytes(UTF8).length;
		out.write(bytes, from, to - from);
		var inserted = new java.lang.String(edit.text).getBytes(UTF8);
		out.write(inserted, 0, inserted.length);
		from = to;
	});
	out.write(bytes, from, bytes.length - from);
	return out.toByteArray();
}

function sameBytes(a, b) { return java.util.Arrays.equals(a, b); }

// The accessibility the server reads from the header of a source (FlowEngineBridge.syncInputs, as on a server).
function headerAccessibility(name, code) {
	var out = api("syncInputs", { name: name, flowName: name, flowSource: code, metadataOnly: true });
	return out.ok ? { value: out.accessibility === undefined || out.accessibility === null ? null : String(out.accessibility) } : { error: out };
}

// The definition the engine reads from a source (the v2 reader or the Java v3 reader, by sourceVersion).
function readDefinition(name, code) {
	var out = api("flowSourceValidate", { name: name, flowName: name, code: code, skipAnalysis: true });
	return out.definition ? { definition: out.definition } : { error: errorText(out) };
}

// The guard: the server reads Public from the new text, and the engine reads the definition of the old text in it, with
// _flow.accessibility "public".
function guard(name, before, after) {
	var read = headerAccessibility(name, after);
	if (read.error) return "the engine cannot read the new header: " + errorText(read.error);
	if (read.value !== "Public") return "the engine reads " + read.value + " from the new header, not Public";
	var old = readDefinition(name, before);
	if (old.error) return "the engine cannot read the source: " + old.error;
	var written = readDefinition(name, after);
	if (written.error) return "the engine cannot read the new text: " + written.error;
	var expected = JSON.parse(JSON.stringify(old.definition));
	expected.flow = Object.assign({}, expected.flow || {}, { accessibility: "public" });
	if (codeService.comparableDefinition(expected) !== codeService.comparableDefinition(written.definition)) {
		return "the engine reads another definition from the new text";
	}
	return "";
}

// The sourceVersion of the header (2 without one), null when it is not a number.
function headerSourceVersion(code, header) {
	var index = header && !header.error ? propertyNamed(header, "sourceVersion") : -1;
	if (index < 0) return header && header.error ? null : 2;
	var value = /^\s*:\s*(\d+)\s*$/.exec(code.substring(header.properties[index].keyEnd, header.properties[index].end));
	return value ? Number(value[1]) : null;
}

// The lines an insertion changes: { line (first changed line), before: [lines], after: [lines] }.
function changedLines(before, after) {
	var a = before.replace(/\r/g, "").split("\n"), b = after.replace(/\r/g, "").split("\n"), head = 0, tail = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
	return { line: head + 1, before: a.slice(head, a.length - tail), after: b.slice(head, b.length - tail) };
}

var report = {
	project: String(projectRoot.getName()),
	mode: write ? "write" : "dry-run",
	written: false,
	flows: { total: 0, list: [], undeclared: [], errors: [] },
	sourcesWithoutFlow: []
};

var yamlFile = new java.io.File(projectRoot, "c8oProject.yaml");
var flows = [];
if (!yamlFile.isFile()) {
	report.flows.errors.push({ flow: "", source: "c8oProject.yaml", code: "PROJECT_YAML_MISSING", message: "No c8oProject.yaml in " + projectRoot });
} else {
	var yamlText = String(FileUtils.readFileToString(yamlFile, "UTF-8")), projectName = /^\u2193(\S+) \[core\.Project\]/m.exec(yamlText);
	if (projectName) report.project = projectName[1];
	flows = projectFlows(yamlText);
}

var flowsDir = new java.io.File(projectRoot, "_flow/flows"), known = {};
flows.forEach(function (flow) {
	var file = new java.io.File(flowsDir, flow.name + ".flow.js"), path = relative(file);
	known[String(file.getCanonicalPath())] = true;
	report.flows.total++;
	var row = { flow: flow.name, source: path, sourceVersion: null, declaredBy: "none", header: null, yaml: flow.yaml, accessibility: null };
	report.flows.list.push(row);
	function fail(code, message) {
		row.declaredBy = flow.yaml ? "yaml" : "unknown";
		row.accessibility = flow.yaml || null;
		report.flows.errors.push({ flow: flow.name, source: path, code: code, message: String(message).substring(0, 600) });
	}
	try { declareFlow(flow, file, path, row, fail); }
	catch (error) { fail("FLOW_ACCESSIBILITY_EXCEPTION", "Unexpected error: " + String(error.message || error)); }
});

function declareFlow(flow, file, path, row, fail) {
	if (!file.isFile()) { fail("FLOW_SOURCE_MISSING", "The source of the Flow is missing: nothing is written."); return; }
	var bytes = Files.readAllBytes(file.toPath()), code = String(new java.lang.String(bytes, UTF8));
	if (!sameBytes(new java.lang.String(code).getBytes(UTF8), bytes)) { fail("FLOW_SOURCE_UNREADABLE", "The source is not UTF-8 text: nothing is written."); return; }
	var header = flowHeader(code), engineRead = headerAccessibility(flow.name, code);
	row.sourceVersion = headerSourceVersion(code, header);
	if (engineRead.error) {
		var refusal = String(engineRead.error.error && engineRead.error.error.code || "");
		fail(refusal === "FLOW_ACCESSIBILITY_INVALID" ? refusal : "FLOW_SOURCE_UNREADABLE", "The engine cannot read the header: " + errorText(engineRead.error));
		return;
	}
	var scanned = header && !header.error && propertyNamed(header, "accessibility") >= 0;
	if (header && header.error) {
		fail("FLOW_ACCESSIBILITY_HEADER_UNCERTAIN", "The _flow header cannot be read with certainty (" + header.error + ")" +
			(engineRead.value ? "; the engine reads " + engineRead.value : "") + ": nothing is written.");
		return;
	}
	if (Boolean(engineRead.value) !== Boolean(scanned)) {
		fail("FLOW_ACCESSIBILITY_HEADER_UNCERTAIN", "The engine reads " + (engineRead.value || "no accessibility") + " from the header, which " +
			(scanned ? "has" : "has no") + " accessibility key: nothing is written.");
		return;
	}
	if (engineRead.value) {
		row.declaredBy = "header";
		row.header = engineRead.value;
		row.accessibility = engineRead.value;
		return;
	}
	if (flow.yaml) {
		row.declaredBy = "yaml";
		row.accessibility = flow.yaml;
		return;
	}
	row.accessibility = "Private";
	var undeclared = {
		flow: flow.name,
		source: path,
		code: "FLOW_ACCESSIBILITY_UNDECLARED",
		message: "Neither the _flow header nor the YAML declares the accessibility of " + report.project + "." + flow.name +
			": it is Private by the default of the class since Convertigo 8.5.0, and was Public before.",
		change: null,
		guard: "",
		written: false
	};
	report.flows.undeclared.push(undeclared);
	if (!header) { undeclared.guard = "no _flow header to complete: nothing is written"; return; }
	var edits = declarationEdits(code, header), candidate = applyEdits(code, edits);
	undeclared.change = changedLines(code, candidate);
	var refused;
	try { refused = guard(flow.name, code, candidate); }
	catch (error) { refused = "guard exception: " + String(error.message || error).substring(0, 400); }
	if (refused) { undeclared.guard = refused + ": nothing is written"; return; }
	undeclared.guard = "ok";
	if (!write) return;
	var target = editedBytes(bytes, code, edits);
	if (String(new java.lang.String(target, UTF8)) !== candidate) { undeclared.guard = "the edited bytes do not give the checked text: nothing is written"; return; }
	if (!sameBytes(Files.readAllBytes(file.toPath()), bytes)) { undeclared.guard = "the file changed during the run: nothing is written"; return; }
	Files.write(file.toPath(), target);
	// After writing: the file read back, then read by the engine.
	var reread = Files.readAllBytes(file.toPath()), after;
	if (!sameBytes(reread, target)) after = "the file does not hold the written bytes";
	else {
		try { after = guard(flow.name, code, String(new java.lang.String(reread, UTF8))); }
		catch (error) { after = "guard exception: " + String(error.message || error).substring(0, 400); }
	}
	if (after) {
		Files.write(file.toPath(), bytes);
		var restored = sameBytes(Files.readAllBytes(file.toPath()), bytes);
		undeclared.guard = after + (restored ? ": the file is put back as it was" : ": THE FILE COULD NOT BE PUT BACK");
		undeclared.restored = restored;
		return;
	}
	undeclared.written = true;
	report.written = true;
}

(function orphanSources(dir) {
	if (!dir.isDirectory()) return;
	var found = FileUtils.listFiles(dir, null, true).toArray();
	for (var i = 0; i < found.length; i++) {
		if (!/\.flow\.js$/.test(String(found[i].getName())) || known[String(found[i].getCanonicalPath())]) continue;
		report.sourcesWithoutFlow.push(relative(found[i]));
	}
	report.sourcesWithoutFlow.sort();
})(flowsDir);

var list = report.flows.list, undeclaredCount = report.flows.undeclared.length;
var writtenCount = report.flows.undeclared.filter(function (entry) { return entry.written; }).length;
function count(by) { return list.filter(function (row) { return row.declaredBy === by; }).length; }
report.summary = report.project + ": " + report.flows.total + " Flows, " + count("header") + " declared in the header, " + count("yaml") +
	" in the YAML only, " + undeclaredCount + " without declaration (FLOW_ACCESSIBILITY_UNDECLARED)" +
	(write ? ", " + writtenCount + " declared public and written" : " (dry run)") + ", " + report.flows.errors.length + " unreadable or uncertain; " +
	report.sourcesWithoutFlow.length + " .flow.js without a [flow.Flow] entry (not Flows of the project, not changed).";
print(JSON.stringify(report, null, 1));
java.lang.System.out.flush();
java.lang.System.exit(report.flows.errors.length || undeclaredCount > writtenCount ? 1 : 0);
