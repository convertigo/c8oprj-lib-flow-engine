// FlowScript v3 conformance (lot L4). The specification (docs/flowscript-v3.md), the grammar (docs/flowscript-v3-grammar.json)
// and the guides of lib_flow_mcp that teach v3 are checked without running any v3 source by Rhino:
//   - every example is read by the Rhino 1.9.2 parser of the engine (after the same-length const -> let preparation);
//   - no accepted example uses a construct the grammar refuses; every refused example is refused with its code;
//   - no guide shows a bare default( call;
//   - C-CONST-LOOP: the expected value is obtained by the Flow engine from the lowered tree, and raw Rhino is shown wrong.
// The shared checks are in tests/support/flowscript-v3-conformance.js; the waiting list in tests/support/flowscript-v3-waiting.json.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-conformance-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var libRoot = engineDir.getParentFile();
var reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
load(new java.io.File(libRoot, "tests/support/flowscript-v3-conformance.js"));
var v3 = flowscriptV3Conformance({ reader: reader, waitingFile: new java.io.File(libRoot, "tests/support/flowscript-v3-waiting.json") });
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }

var failures = [], stats = { spec: 0, grammarAccepted: 0, grammarRefused: 0, guides: 0, guideRefused: 0, waiting: 0 }, seen = {}, cleared = [];
var waiting = {};
v3.waiting.waiting.forEach(function (item) { waiting[item.id] = item.reason; });
function record(id, result) {
	seen[id] = true;
	if (!result.parse) { failures.push(id + ": " + result.problems.join("; ")); return; }
	if (id in waiting) {
		if (result.problems.length) stats.waiting++; else cleared.push(id);
	} else if (result.problems.length) failures.push(id + ": " + result.problems.join("; "));
}

// 1. The specification: every flowscript fence has an id and is checked.
var spec = v3.read(new java.io.File(libRoot, "docs/flowscript-v3.md"));
v3.fences(spec).forEach(function (fence) {
	if (fence.lang !== "flowscript") return;
	if (!fence.attrs.id) { failures.push("spec line " + fence.line + ": a flowscript example needs an id=... attribute"); return; }
	var id = "spec:" + fence.attrs.id, code = v3.complete(fence.code, "Example");
	stats.spec++;
	record(id, fence.attrs.refused ? v3.checkRefused(code, fence.attrs.refused, false) : v3.checkAccepted(code));
});

// 2. The grammar: every accepted entry has examples; every refused entry has its example.
var grammar = JSON.parse(v3.read(new java.io.File(libRoot, "docs/flowscript-v3-grammar.json")));
grammar.accepted.forEach(function (entry) {
	if (!entry.examples || !entry.examples.length) { failures.push("grammar:" + entry.id + ": an accepted entry needs examples"); return; }
	entry.examples.forEach(function (text, index) {
		stats.grammarAccepted++;
		record("grammar:" + entry.id + "#" + index, v3.checkAccepted(v3.complete(text, "Example")));
	});
});
grammar.refused.forEach(function (entry) {
	if (!entry.example) { failures.push("grammar:" + entry.code + ": a refused entry needs an example"); return; }
	stats.grammarRefused++;
	record("grammar:" + entry.code, v3.checkRefused(v3.complete(entry.example, "Example"), entry.code, !!entry.parseError));
});

// 3. The guides and skills of lib_flow_mcp that teach v3 (the same check runs from lib_flow_mcp: flowscript-v3-guides-conformance.js).
var mcpResources = new java.io.File(libRoot.getParentFile(), "lib_flow_mcp/_flow/resources");
var guides = v3.guideExamples(mcpResources);
guides.problems.forEach(function (problem) { failures.push(problem); });
guides.examples.forEach(function (example) {
	if (example.refused) { stats.guideRefused++; record(example.id, v3.checkRefused(example.code, example.refused, false)); }
	else { stats.guides++; record(example.id, v3.checkAccepted(example.code)); }
});

// 4. The waiting list names existing examples only.
Object.keys(waiting).forEach(function (id) { if (!seen[id]) failures.push("waiting list: no example " + id); });

// 5. C-CONST-LOOP, in the sense of the grammar.
var constLoop = grammar.conformance.filter(function (item) { return item.id === "C-CONST-LOOP"; })[0];
if (!constLoop) failures.push("grammar: case C-CONST-LOOP is missing");
else {
	var run = api("flowCodeRun", { name: "ConstLoop", code: constLoop.source, input: constLoop.input, includeTrace: false });
	if (!run.ok || JSON.stringify(run.result) !== JSON.stringify(constLoop.expected))
		failures.push("C-CONST-LOOP: the Flow engine gives " + JSON.stringify(run.ok ? run.result : run) + ", expected " + JSON.stringify(constLoop.expected));
	if (/\bfor\s*\(\s*let\b|\blet\s+(twice|shown|next)\b/.test(constLoop.source) || !/const twice/.test(constLoop.source))
		failures.push("C-CONST-LOOP: the source must keep its const declarations (no correction)");
	// Raw Rhino on the same loops with plain arrays (the bug demonstration; the v3 source itself is not executed).
	var raw = v3.prepareForOfHeads(constLoop.source).replace(/json\.array\(\{[^\n]*\}\)/g, "[]").replace(/^const _flow[^\n]*\n/, "") +
		"\nConstLoop({ input: " + JSON.stringify(constLoop.input) + " })";
	var cx = Packages.org.mozilla.javascript.Context.enter(), rawResult;
	try { cx.setLanguageVersion(200); rawResult = JSON.stringify(cx.evaluateString(cx.initStandardObjects(), raw, "raw-rhino", 1, null)); }
	finally { Packages.org.mozilla.javascript.Context.exit(); }
	if (rawResult === JSON.stringify(constLoop.expected)) failures.push("C-CONST-LOOP: raw Rhino gives the expected value; Rhino #326 is fixed, review the correction note");
	stats.rawRhino = rawResult;
}

if (cleared.length) print("NOTICE: examples of the waiting list that the reader accepts now (remove them): " + cleared.join(", "));
if (failures.length) throw new Error("FlowScript v3 conformance failed (" + failures.length + "):\n" + failures.join("\n"));
print("flowscript-v3-conformance OK: " + stats.spec + " specification examples, " + stats.grammarAccepted + " accepted-entry examples (" + grammar.accepted.length + " entries), " +
	stats.grammarRefused + " refused entries, " + stats.guides + " guide examples (+ " + stats.guideRefused + " refused), " + stats.waiting + " waiting, " + v3.incompleteScans + " scans left to the reader; raw Rhino C-CONST-LOOP " + stats.rawRhino);
