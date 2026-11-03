// code-patch takes exact text replacements as well as a unified diff: edits: [{ oldText, newText }], the usual form of
// a targeted replacement, was refused as INVALID_PATCH ("Unified patch requires @@ hunk headers"). Each oldText must be
// found exactly once (after the edits before it); otherwise the refusal says where, and nothing is written.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-code-patch-edits-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var code = 'const _flow = {sourceVersion:2, inputs:{quantity:{type:"integer",default:2}}}\n' +
		'function Basket({ input, config, result }) {\n  local.price = 10\n  result.total = local.price * input.quantity\n  result.label = "Basket"\n  result.note = "Basket"\n}\n';
	var saved = api("flowCodeSet", { name: "Basket", code: code, draft: false });
	assert(saved.ok, "code-set: " + JSON.stringify(saved));

	// a working copy patched by text replacements, in order
	var patched = api("flowCodePatch", { name: "Basket", revision: saved.revision, edits: [
		{ oldText: "local.price = 10", newText: "local.price = 12" },
		{ oldText: "result.label = \"Basket\"\n", newText: "result.label = \"Order\"\n  result.count = input.quantity\n" }
	] });
	assert(patched.ok && patched.written === true, "edits patch the working copy: " + JSON.stringify(patched));
	assert(patched.appliedHunks.length === 2 && patched.appliedHunks[0].line === 3 && patched.appliedHunks[1].line === 5 &&
		patched.appliedHunks[1].removed === 2 && patched.appliedHunks[1].added === 3, "Each edit is reported with its line: " + JSON.stringify(patched.appliedHunks));
	var ran = api("flowCodeRun", { name: "Basket", input: { quantity: 3 } });
	assert(ran.ok && ran.result.total === 36 && ran.result.label === "Order" && ran.result.count === 3 && ran.result.note === "Basket",
		"The patched working copy runs: " + JSON.stringify(ran).substring(0, 400));
	var text = String(api("flowCodeGet", { name: "Basket" }).code);
	assert(text.slice(-2) === "}\n" && text.indexOf("\r") === -1, "The final new line is kept: " + JSON.stringify(text.slice(-10)));

	function refused(edits, code, message, extra) {
		var current = api("flowCodeGet", { name: "Basket" });
		var request = Object.assign({ name: "Basket", revision: current.revision, edits: edits }, extra || {});
		var out = api("flowCodePatch", request);
		var textOut = JSON.stringify(out);
		assert(!out.ok && textOut.indexOf(code) !== -1 && textOut.indexOf(message) !== -1, "Expected " + code + " (" + message + "): " + textOut);
		assert(api("flowCodeGet", { name: "Basket" }).revision === current.revision, "A refused patch writes nothing");
		return out;
	}
	var twice = refused([{ oldText: "local.price", newText: "local.unitPrice" }], "EDIT_TEXT_NOT_UNIQUE", "found 2 times, at lines 3, 4");
	assert(JSON.stringify(twice).indexOf("Extend oldText") !== -1, "The fix is given: " + JSON.stringify(twice));
	var missing = refused([{ oldText: "local.price = 12\n  result.total = local.price * 2", newText: "x" }], "EDIT_TEXT_NOT_FOUND", "its first line is at line 3");
	refused([{ oldText: "local.price = 12", newText: "local.price = 1" }, { oldText: "local.price = 12", newText: "local.price = 2" }],
		"EDIT_TEXT_NOT_FOUND", "Edit 2");
	refused([{ oldText: "", newText: "x" }], "INVALID_PATCH", "Edit 1 needs oldText");
	refused([], "INVALID_PATCH", "non-empty array");
	refused([{ oldText: "local.price = 12", newText: "local.price = 1" }], "INVALID_PATCH", "either edits or a unified patch",
		{ codepatch: "@@ -3,1 +3,1 @@\n-  local.price = 12\n+  local.price = 1\n" });
	// an edit giving an invalid source is refused by the check like any other patch
	var invalid = api("flowCodePatch", { name: "Basket", revision: api("flowCodeGet", { name: "Basket" }).revision, edits: [{ oldText: "local.price = 12", newText: "local.price = /x/.test(\"x\")" }] });
	assert(!invalid.ok && JSON.stringify(invalid).indexOf("FLOWSCRIPT_EXPRESSION_UNSUPPORTED") !== -1, "The patched source is checked: " + JSON.stringify(invalid).substring(0, 300));

	// the saved Flow, a project block and a project resource take edits too
	var reset = api("flowCodeSet",{name:"Basket",code:code});
	assert(api("flowCodePromote",{name:"Basket",revision:reset.revision}).ok,"save initial official fixture");
	var official = api("flowCodePatch", { name: "Basket", draft: false, revision: api("flowCodeGet", { name: "Basket" }).revision,
		edits: [{ oldText: "local.price = 10", newText: "local.price = 11" }] });
	assert(official.ok && official.workingCopy && String(files.readFileToString(new java.io.File(project, "_flow/flows/Basket.flow.js"), "UTF-8")).indexOf("local.price = 10") !== -1,
		"draft:false cannot bypass source ownership: " + JSON.stringify(official));
	assert(api("flowCodePromote",{name:"Basket",revision:official.revision}).ok,"explicit promote saves patched draft");
	assert(String(files.readFileToString(new java.io.File(project,"_flow/flows/Basket.flow.js"),"UTF-8")).indexOf("local.price = 11")>=0,"promoted patch saved");
	var block = 'const _meta = {\n  "sourceVersion": 2,\n  "properties": { "amount": { "kind": "value", "type": "number" } },\n  "outputs": { "out": { "type": "number" } }\n}\n\n' +
		'function basket_tax({ input, config }) {\n  return input.amount * 0.2\n}\n';
	var setBlock = api("blockCodeSet", { name: "basket.tax", code: block });
	assert(setBlock.ok, "blockCodeSet: " + JSON.stringify(setBlock));
	var patchedBlock = api("blockCodePatch", { name: "basket.tax", revision: setBlock.revision, edits: [{ oldText: "input.amount * 0.2", newText: "input.amount * 0.055" }] });
	assert(patchedBlock.ok, "blockCodePatch with edits: " + JSON.stringify(patchedBlock).substring(0, 300));
	var taxed = api("run", { flowSource: 'const _flow = {sourceVersion:2}\nfunction T({ input, config, result }) {\n  result.tax = basket.tax({ amount: 100 })\n}\n', includeTrace: false, input: {} });
	assert(taxed.ok && Math.abs(taxed.result.tax - 5.5) < 1e-9, "The patched block runs: " + JSON.stringify(taxed));
	files.writeStringToFile(new java.io.File(project, "docs/notes.md"), "# Notes\r\n\r\nFirst line\r\n", "UTF-8");
	var resource = api("resourceGet", { path: "docs/notes.md" });
	var patchedResource = api("resourcePatch", { path: "docs/notes.md", baseHash: resource.hash || resource.newHash, edits: [{ oldText: "First line", newText: "Second line" }], includeContent: true });
	assert(patchedResource.ok && patchedResource.content === "# Notes\n\nSecond line\n", "A resource takes edits too: " + JSON.stringify(patchedResource));

	print("code-patch-text-edits OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
