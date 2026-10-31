// Unified patches of sources and resources (patch-utils.js, used by code-patch, flow-source-patch and resource
// patches): hunks applied in order with offset tracking, at their numbered line or where their lines match once,
// --- a/ +++ b/ headers and code fences accepted, an empty context line that lost its space read as such, trailing
// spaces tolerated, an insertion without context checked by both its line numbers, the final new line as git has it,
// and what cannot be placed refused with the expected and actual lines around. The contract of the patch library of
// lib_flow_mcp: the cases of the trial (F-05) are those of its resource-patch-hunks test.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function failure(callback) {
	try { callback(); } catch (e) { return e; }
	return null;
}
var patches = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/patch-utils.js"), "UTF-8")));
function apply(content, patch) { return patches.applyUnifiedPatchText(content, patch); }

var ENGINE_YAML = [
	"version: 1",
	"engineQName: lib_flow_engine.Engine",
	"bindings: {}",
	"config:",
	"  data:",
	"    sources:",
	"      postes:",
	"        provider: sql",
	"        table: POSTE",
	"",
	"  sql:",
	"    connections:",
	"      app:",
	"        url: jdbc:hsqldb:file:_flow/resources/sql/app",
	"    writes:",
	"      posteInsert:",
	"        operation: insert",
	""
].join("\n");

// 1. The trial: two hunks with headers and right line numbers, the first one spanning an empty line sent without its space.
var trialPatch = [
	"--- a/_flow/engine.yaml",
	"+++ b/_flow/engine.yaml",
	"@@ -8,5 +8,6 @@",
	"         provider: sql",
	"         table: POSTE",
	"+        versionColumn: REVISION",
	"",
	"   sql:",
	"     connections:",
	"@@ -16,2 +17,3 @@",
	"       posteInsert:",
	"         operation: insert",
	"+        maxAffectedRows: 1",
	""
].join("\n");
var trial = apply(ENGINE_YAML, trialPatch);
var expectedTrial = ENGINE_YAML.replace("        table: POSTE\n", "        table: POSTE\n        versionColumn: REVISION\n")
	.replace("        operation: insert\n", "        operation: insert\n        maxAffectedRows: 1\n");
assert(trial.content === expectedTrial, "both hunks applied in order: " + JSON.stringify(trial.content));
assert(trial.hunks === 2 && trial.appliedHunks[0].line === 8 && trial.appliedHunks[0].match === "exact" &&
	trial.appliedHunks[1].line === 16 && trial.appliedHunks[1].match === "exact", "each hunk reports where it applied: " + JSON.stringify(trial.appliedHunks));
assert(trial.notes.some(function (note) { return /empty patch line\(s\) read as unchanged empty line/.test(note); }), "the empty context line is reported: " + trial.notes);

// 2. A hunk numbered on the new file, numbers off, hunks bottom first, a bare @@ hunk.
var renumbered = apply(ENGINE_YAML, "@@ -2,1 +2,2 @@\n engineQName: lib_flow_engine.Engine\n+configVisibility: {}\n@@ -17,2 +18,3 @@\n       posteInsert:\n         operation: insert\n+        minAffectedRows: 1\n");
assert(renumbered.content.indexOf("engineQName: lib_flow_engine.Engine\nconfigVisibility: {}\nbindings") !== -1 &&
	/operation: insert\n {8}minAffectedRows: 1\n$/.test(renumbered.content) && renumbered.appliedHunks[1].offset === -1 &&
	renumbered.appliedHunks[1].match === "offset", "a hunk numbered on the new file is applied, its offset reported: " + JSON.stringify(renumbered.appliedHunks));
var shifted = apply(ENGINE_YAML, "@@ -40,2 +40,2 @@\n       app:\n-        url: jdbc:hsqldb:file:_flow/resources/sql/app\n+        url: jdbc:hsqldb:file:_flow/resources/sql/app;hsqldb.tx=mvcc\n");
assert(/app;hsqldb\.tx=mvcc\n/.test(shifted.content) && shifted.appliedHunks[0].line === 13 && /instead of line 40/.test(shifted.notes[0]),
	"unique match despite wrong numbers: " + JSON.stringify(shifted));
var reversed = apply(ENGINE_YAML, "@@ -16,1 +16,1 @@\n-      posteInsert:\n+      posteCreate:\n@@ -1,1 +1,1 @@\n-version: 1\n+version: 2\n");
assert(/^version: 2\n/.test(reversed.content) && reversed.content.indexOf("      posteCreate:\n") !== -1, "hunks in reverse order: " + reversed.content);
var bare = apply(ENGINE_YAML, "@@\n   sql:\n+    defaultConnection: app\n");
assert(bare.content.indexOf("  sql:\n    defaultConnection: app\n    connections:") !== -1 && bare.appliedHunks[0].match === "context", "a bare @@ hunk is placed by its unique lines");

// 3. What cannot be placed is refused with the lines around.
var mismatch = failure(function () { apply(ENGINE_YAML, "@@ -11,2 +11,3 @@\n   sql:\n     connexions:\n+      other: {}\n"); });
assert(mismatch && mismatch.code === "PATCH_CONTEXT_MISMATCH" && mismatch.details.mismatch.line === 12 &&
	mismatch.details.mismatch.expected === "    connexions:" && mismatch.details.mismatch.actual === "    connections:" &&
	/line 12 is "    connections:" where the patch expects "    connexions:"/.test(mismatch.message) &&
	mismatch.details.actual[0].line === 8 && mismatch.details.expectedLine === 11,
	"a mismatch names the line, the expected and the actual text, with the lines around: " + JSON.stringify(mismatch && mismatch.details));
var ambiguous = failure(function () { apply("a: 1\nb: 2\na: 1\n", "@@ -9,1 +9,2 @@\n a: 1\n+c: 3\n"); });
assert(ambiguous && ambiguous.code === "PATCH_CONTEXT_AMBIGUOUS" && ambiguous.details.matchingLines.join() === "1,3", "an ambiguous match is refused");
assert(apply("a: 1\nb: 2\na: 1\n", "@@ -3,1 +3,2 @@\n a: 1\n+c: 3\n").content === "a: 1\nb: 2\na: 1\nc: 3\n", "a repeated line is taken at its numbered position");

// 4. An insertion without context: -N,0 inserts after line N, +M must agree (the trial put a block outside its parent).
var outside = failure(function () { apply(ENGINE_YAML, "@@ -10,0 +10,1 @@\n+        readOnly: false\n"); });
assert(outside && outside.code === "PATCH_INSERT_AMBIGUOUS" && outside.details.oldSideAfterLine === 10 && outside.details.newSideAfterLine === 9,
	"disagreeing insertion numbers are refused: " + JSON.stringify(outside && outside.details));
var inserted = apply(ENGINE_YAML, "@@ -9,0 +10,1 @@\n+        readOnly: false\n");
assert(inserted.content.indexOf("        table: POSTE\n        readOnly: false\n\n  sql:") !== -1 && inserted.appliedHunks[0].afterLine === 9, "agreeing numbers insert after the line");
assert(apply(ENGINE_YAML, "@@ -10,0 +10,1 @@\n         table: POSTE\n+        readOnly: false\n").content === inserted.content, "one context line places the insertion whatever the numbers");
assert(failure(function () { apply(ENGINE_YAML, "@@\n+x: 1\n"); }).code === "PATCH_INSERT_WITHOUT_CONTEXT", "a bare insertion is refused");
assert(apply("a\nc\n", "@@ -1,0 +2 @@\n+b\n").content === "a\nb\nc\n", "a hunk without old lines inserts after its line");

// 5. Whitespace, fences, line endings, final new line, several files, garbage.
var spaced = apply("key: \nnext: 1\n", "```diff\n@@ -1,2 +1,3 @@\n key:\n next: 1\n+last: 2\n```\n");
assert(spaced.content === "key: \nnext: 1\nlast: 2\n" && spaced.appliedHunks[0].match === "whitespace", "trailing spaces tolerated, the text kept: " + JSON.stringify(spaced.content));
assert(apply("a\r\nb\r\n", "@@ -1,2 +1,3 @@\r\n a\r\n b\r\n+c\r\n").content === "a\nb\nc\n", "CRLF text and patch");
assert(apply("a\nb", "@@ -2,1 +2,2 @@\n-b\n\\ No newline at end of file\n+b\n+c\n").content === "a\nb\nc\n", "a final new line can be added");
assert(apply("a\nb", "@@ -1,2 +1,2 @@\n-a\n-b\n+a\n+c\n").content === "a\nc\n", "a replaced last line gets its new line");
assert(apply("a\nb\n", "@@ -2,1 +2,2 @@\n b\n+c\n\\ No newline at end of file\n").content === "a\nb\nc", "the marker removes the final new line");
assert(apply("a\nb", "@@ -1,1 +1,1 @@\n-a\n+z\n").content === "z\nb", "a text without final new line keeps that state");
assert(apply("", "--- /dev/null\n+++ b/docs/notes.md\n@@ -0,0 +1,2 @@\n+# Notes\n+First.\n").content === "# Notes\nFirst.\n", "creation from an empty text");
assert(apply("", "@@ -0,0 +1 @@\n+x\n\\ No newline at end of file\n").content === "x", "a created text ends with a new line unless the patch says otherwise");
var twoFiles = failure(function () { apply(ENGINE_YAML, trialPatch + "--- a/other.yaml\n+++ b/other.yaml\n@@ -1,1 +1,1 @@\n-x\n+y\n"); });
assert(twoFiles && twoFiles.code === "INVALID_PATCH" && /several files/.test(twoFiles.message), "a patch of several files is refused");
var garbage = failure(function () { apply(ENGINE_YAML, "@@ -1,1 +1,1 @@\nversion: 1\n+version: 2\n"); });
assert(garbage && garbage.code === "INVALID_PATCH" && garbage.details.patchLine === 2, "a hunk line without marker is refused with its patch line");
assert(failure(function () { apply(ENGINE_YAML, "replace version"); }).code === "INVALID_PATCH", "no hunk");

// 6. code-patch on a FlowScript working copy: the same applier, the hunks reported, a mismatch refused with its details.
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-patch-hunks").toFile().getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
var source = "const _flow = { sourceVersion: 2 }\nfunction Hello({ input, config, result }) {\n  local.a = \"one\"\n\n  result.value = local.a\n}\n";
var set = api("flowCodeSet", { name: "Hello", code: source });
assert(set.ok === true, "Flow created: " + JSON.stringify(set).substring(0, 400));
var got = api("flowCodeGet", { name: "Hello" });
var lines = String(got.code).split("\n");
var at = lines.indexOf("  local.a = \"one\"");
assert(at > 0 && lines[at + 1] === "", "the source keeps its empty line: " + JSON.stringify(got.code));
var patched = api("flowCodePatch", { name: "Hello", revision: got.revision,
	codepatch: "@@ -" + (at + 1) + ",3 +" + (at + 1) + ",3 @@\n-  local.a = \"one\"\n+  local.a = \"two\"\n\n   result.value = local.a\n" });
assert(patched.ok === true && patched.appliedHunks && patched.appliedHunks[0].match === "exact" &&
	(patched.warnings || []).some(function (warning) { return warning.code === "PATCH_APPLIED_WITH_TOLERANCE"; }),
	"code-patch applies a hunk whose empty line lost its space, and says so: " + JSON.stringify(patched).substring(0, 800));
var run = api("flowCodeRun", { name: "Hello" });
assert(run.ok === true && run.result.value === "two", "the patched working copy runs: " + JSON.stringify(run).substring(0, 400));
var refused = api("flowCodePatch", { name: "Hello", revision: patched.revision, codepatch: "@@ -3,1 +3,1 @@\n-  local.a = \"three\"\n+  local.a = \"four\"\n" });
assert(refused.ok === false && refused.error && refused.error.code === "PATCH_CONTEXT_MISMATCH" && refused.error.details &&
	refused.error.details.mismatch.expected === "  local.a = \"three\"" && refused.error.details.actual.length > 0,
	"a mismatch is refused with the expected and actual lines: " + JSON.stringify(refused).substring(0, 800));
// $$ (engine attributes: $$id, $$nodes) and the other replacement patterns of String.replace ($&, $1, $') are kept
// as written by the edits and by a unified diff: no user text is used as a replacement pattern.
var dollars = "json.array({ $$id: \"rows\", $$nodes: [] })\n";
var dollarEdited = patches.applyTextEdits(dollars, [{ oldText: "$$id: \"rows\"", newText: "$$id: \"items\", note: \"$& $1 $' $$\"" }]);
assert((dollarEdited.content || dollarEdited) === "json.array({ $$id: \"items\", note: \"$& $1 $' $$\", $$nodes: [] })\n",
	"edits keep $$ and the replacement patterns as written: " + JSON.stringify(dollarEdited));
var dollarPatched = apply(dollars, "@@ -1,1 +1,1 @@\n-json.array({ $$id: \"rows\", $$nodes: [] })\n+json.array({ $$id: \"items\", $$nodes: [\"$&\"] })\n");
assert((dollarPatched.content || dollarPatched) === "json.array({ $$id: \"items\", $$nodes: [\"$&\"] })\n",
	"a unified diff keeps $$ and the replacement patterns as written: " + JSON.stringify(dollarPatched));
print("patch-utils-hunks OK (" + checks + " checks)");
