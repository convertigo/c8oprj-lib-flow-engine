// A FlowScript block is read by its sourceVersion, as a Flow is: a _meta with "sourceVersion": 3 and an implementation
// that declares const _flow = { sourceVersion: 3 } is read by the Java FlowScript v3 reader, from a file of the project
// or through the block code tools, and runs as the same block written in v2. The two declarations must agree, and a
// Rhino block stays at 2.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-v3-blocks-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
function check(ok, message) { if (!ok) throw new Error(message); }
function meta(version, extra) {
	return 'const _meta = {\n  "sourceVersion": ' + version + ',\n  "description": "Greets.",\n' + (extra || '') +
		'  "properties": { "name": { "kind": "value", "type": "string" }, "items": { "kind": "value", "type": "array" } },\n' +
		'  "outputs": { "out": { "type": "object" } },\n}\n\n';
}
var v3 = 'const _flow = { sourceVersion: 3 }\n\nfunction proof_greet({ input, config, result }) {\n' +
	'  const big = input.items.filter(x => x > 1)\n  return { text: `Hello ${input.name.toUpperCase()}`, count: big.length }\n}\n';
var v2 = 'const _flow = { sourceVersion: 2 }\n\nfunction proof_greet({ input, config, result }) {\n' +
	'  local.big = list.filter({ items: input.items, where: current > 1 })\n' +
	'  return({ value: { text: `Hello ${upper(input.name)}`, count: local.big.length } })\n}\n';
// A v3 block in a file of the project, loaded with the project's blocks.
files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/file.block.js"), meta(3) + v3.replace("proof_greet", "proof_file"), "UTF-8");
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function call(block) {
		var out = api("run", { flowSource: 'const _flow = { sourceVersion: 2 }\nfunction Proof({ input, config, result }) {\n  ' + block +
			'({ $$out: "result.value", name: "Ada", items: [1, 2, 3] })\n}', includeTrace: false });
		check(out.ok, block + ": " + JSON.stringify(out).substring(0, 800));
		return JSON.stringify(out.result.value);
	}
	var expected = JSON.stringify({ text: "Hello ADA", count: 2 });
	check(call("proof.file") === expected, "the v3 block file runs: " + call("proof.file"));

	// The same block in v2 and in v3, through the block code tools.
	var saved2 = api("blockCodeSet", { name: "proof.greet", code: meta(2) + v2 });
	check(saved2.ok && call("proof.greet") === expected, "the v2 block: " + JSON.stringify(saved2).substring(0, 600));
	var saved3 = api("blockCodeSet", { name: "proof.greet", code: meta(3) + v3 });
	check(saved3.ok, "the v3 block is accepted: " + JSON.stringify(saved3).substring(0, 800));
	var read = api("blockCodeGet", { name: "proof.greet" });
	check(read.ok && read.code.indexOf('"sourceVersion": 3') !== -1 && read.code.indexOf("const _flow = { sourceVersion: 3 }") !== -1 &&
		read.code.indexOf("input.items.filter(x => x > 1)") !== -1 && read.descriptor.sourceVersion === 3, "the v3 block is kept as written: " + JSON.stringify(read).substring(0, 1200));
	check(call("proof.greet") === expected, "the v3 block gives the result of the v2 block: " + call("proof.greet"));

	// Editing the descriptor keeps the v3 implementation, written by the v3 renderer.
	var descriptor = api("blockGet", { name: "proof.greet", detail: "full" }).descriptor;
	descriptor.description = "Greets, edited.";
	var edited = api("blockEdit", { name: "proof.greet", descriptor: descriptor });
	check(edited.blockId === "proof.greet", "descriptor edit: " + JSON.stringify(edited).substring(0, 800));
	var afterEdit = api("blockCodeGet", { name: "proof.greet" });
	check(afterEdit.ok && afterEdit.code.indexOf('"sourceVersion": 3') !== -1 && afterEdit.code.indexOf("const _flow = { sourceVersion: 3") !== -1 &&
		afterEdit.code.indexOf("Greets, edited.") !== -1 && call("proof.greet") === expected, "after the edit: " + JSON.stringify(afterEdit).substring(0, 1200));

	// The two declarations must agree; a Rhino block has no v3.
	var conflicts = [[meta(3) + v2, "FLOW_SOURCE_VERSION_CONFLICT"], [meta(2) + v3, "FLOW_SOURCE_VERSION_CONFLICT"],
		[meta(3, '  "runtime": "rhino",\n') + '(function(){return {run:function(){return 1;}};}())', "FLOW_SOURCE_VERSION_UNSUPPORTED"]];
	conflicts.forEach(function (conflict) {
		var refused = api("blockCodeSet", { name: "proof.conflict", code: conflict[0] });
		check(!refused.ok && JSON.stringify(refused).indexOf(conflict[1]) !== -1, conflict[1] + ": " + JSON.stringify(refused).substring(0, 600));
	});
	check(call("proof.greet") === expected, "a refused block leaves the others unchanged");
	print("flowscript-v3-blocks OK");
} finally {
	files.deleteQuietly(project);
}
