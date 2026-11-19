// tools/migrate-flowscript-v3.js: a dry run by default, --write writes only the Flows whose guard passed, a Flow the
// guard refuses stays in v2 with its cause, a project with an unexpected error is not written, and FlowScript strings of
// the tests are counted without being changed.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
function check(ok, message) { if (!ok) throw new Error(message); }
var tool = new java.io.File(engineDir, "../tools/migrate-flowscript-v3.js").getCanonicalPath();

function project(flows, tests) {
	var dir = java.nio.file.Files.createTempDirectory("flow-v3-migrate-").toFile();
	Object.keys(flows).forEach(function (name) { files.writeStringToFile(new java.io.File(dir, "_flow/flows/" + name + ".flow.js"), flows[name], "UTF-8"); });
	Object.keys(tests || {}).forEach(function (name) { files.writeStringToFile(new java.io.File(dir, "tests/" + name), tests[name], "UTF-8"); });
	return dir;
}
function read(dir, path) { return String(files.readFileToString(new java.io.File(dir, path), "UTF-8")); }
function migrate(dir, write) {
	var command = new java.util.ArrayList();
	["java", "-Djava.awt.headless=true", "-Duser.language=en", "-Duser.country=US", "-cp", String(java.lang.System.getProperty("java.class.path")),
		"org.mozilla.javascript.tools.shell.Main", "-version", "200", tool, String(engineDir.getAbsolutePath()), String(dir.getAbsolutePath())]
		.concat(write ? ["--write"] : []).forEach(function (part) { command.add(new java.lang.String(String(part))); });
	var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
	var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), "UTF-8"));
	var output = "", line;
	while ((line = reader.readLine()) !== null) output += String(line) + "\n";
	check(process.waitFor() === 0, "migration tool: " + output);
	var start = output.indexOf("{\n");
	check(start >= 0, "migration report: " + output);
	return JSON.parse(output.substring(start));
}

var good = 'const _flow = { sourceVersion: 2, inputs: { items: { type: "array" } } }\n\n' +
	'function Good({ input, config, result }) {\n  local.kept = list.filter({ items: input.items, where: current > 1 })\n' +
	'  result.count = local.kept.length\n  result.label = default(input.label, "none")\n}\n';
// The guard refuses this one: the v2 definition holds the {{ }} of the text of a template literal, which a v3 template
// literal would interpolate.
var kept = 'const _flow = { sourceVersion: 2, inputs: { x: { type: "string" } } }\n\n' +
	'function Kept({ input, config, result }) {\n  result.value = `g {{ input.x }} ${input.x}`\n}\n';
var testSource = "var a = 'const _flow = { sourceVersion: 2 }\\nfunction A({ input, config, result }) {\\n  result.a = 1\\n}'\n" +
	"var b = `const _flow = { sourceVersion: 3 }\nfunction B({ input, config, result }) {\n  return { b: 1 }\n}`\n" +
	"var c = /function X\\(\\{ input/.test(a) ? 'not a source' : ''\n";
var dir = project({ Good: good, Kept: kept }, { "sample.js": testSource });

var dry = migrate(dir, false);
check(dry.mode === "dry-run" && !dry.written && dry.flows.total === 2 && dry.flows.migrated.length === 1 && dry.flows.migrated[0].flow === "_flow/flows/Good.flow.js"
	&& dry.flows.keptV2.length === 1 && dry.flows.keptV2[0].flow === "_flow/flows/Kept.flow.js" && /^definition differs/.test(dry.flows.keptV2[0].reason),
	"dry run report: " + JSON.stringify(dry));
check(read(dir, "_flow/flows/Good.flow.js") === good && read(dir, "_flow/flows/Kept.flow.js") === kept, "a dry run writes nothing");
check(dry.tests.sources === 2 && dry.tests.v2 === 1 && dry.tests.v3 === 1 && dry.tests.files.length === 1, "test strings counted: " + JSON.stringify(dry.tests));

var written = migrate(dir, true);
check(written.written && written.flows.migrated.length === 1, "write report: " + JSON.stringify(written));
var migrated = read(dir, "_flow/flows/Good.flow.js");
check(/^const _flow = \{ sourceVersion: 3, /.test(migrated) && migrated.indexOf("local.kept = input.items.filter(item => item > 1)") >= 0
	&& migrated.indexOf("result.label = flow.default(input.label, \"none\")") >= 0,
	"written v3 text: " + migrated);
check(read(dir, "_flow/flows/Kept.flow.js") === kept && read(dir, "tests/sample.js") === testSource, "only the guarded Flow is written");
var again = migrate(dir, false);
check(again.flows.alreadyV3.length === 1 && again.flows.migrated.length === 0 && again.flows.keptV2.length === 1, "second run: " + JSON.stringify(again.flows));

var broken = project({ Good: good, Broken: 'const _flow = { sourceVersion: 2 }\n\nfunction Broken({ input, config, result }) {\n  local.x = (\n}\n' });
var refused = migrate(broken, true);
check(!refused.written && refused.flows.errors.length === 1 && refused.flows.errors[0].flow === "_flow/flows/Broken.flow.js" && refused.flows.migrated.length === 1,
	"unexpected error report: " + JSON.stringify(refused));
check(read(broken, "_flow/flows/Good.flow.js") === good, "nothing is written for a project with an unexpected error");

// A {{ … }} the v2 reading interpolated in a quoted text (a template property, a value) is interpolated by the migrated
// Flow too: the v2 definition holds it as ${…}, which the v3 text writes as a template literal, where a quoted text would
// stay text. A {{ … }} the v2 definition still holds (the text of a v2 template literal) fails the guard: that Flow stays
// in v2. Each Flow is run before and after, with the same result.
var __flowEngineDir = String(engineDir.getAbsolutePath());
// The blocks of the project (below) are those of the engine used to run the Flows before and after the migration.
var blockMeta = function (version, extra) {
	return 'const _meta = {\n' + (version ? '  "sourceVersion": ' + version + ',\n' : '') + '  "description": "Proof block.",\n' + (extra || '') +
		'  "properties": { "name": { "kind": "value", "type": "string" }, "items": { "kind": "value", "type": "array" } },\n' +
		'  "outputs": { "out": { "type": "object" } },\n}\n\n';
};
var greetBlock = '// A comment above the header.\n' + blockMeta(2) + '// c8o: Flow source (FlowScript, sourceVersion 2).\n\nconst _flow = {\n  "sourceVersion": 2,\n}\n\n' +
	'function proof_greet({ input, config, result }) {\n  local.big = list.filter({ items: input.items, where: current > 1 })\n' +
	'  local.answer = { text: "Hello {{ input.name }}", count: local.big.length }\n  return({ $$id: "reply", value: local.answer })\n}\n';
var chunkBlock = blockMeta(2) + 'function proof_chunks({ input, config, result }) {\n  forEachChunk({\n    source: input.items,\n    size: 2,\n' +
	'    $$each: function ({chunk}) {\n      local.n = chunk.length\n    },\n  })\n  local.out = { size: 2 }\n  return({ value: local.out })\n}\n';
var literalBlock = blockMeta(2) + 'function proof_literal({ input, config, result }) {\n  return({ value: { text: `g {{ input.name }} ${input.name}` } })\n}\n';
var rhinoBlock = blockMeta(2, '  "runtime": "rhino",\n') + '(function(){return {run:function(ctx,node){return { rhino: true };}};}())\n';
var bareBlock = blockMeta(0) + 'function proof_bare({ input, config, result }) {\n  return({ value: { bare: input.name } })\n}\n';
var blocksDir = project({ Caller: 'const _flow = { sourceVersion: 2 }\n\nfunction Caller({ input, config, result }) {\n' +
	'  result.greet = proof.greet({ name: input.x, items: [1, 2, 3] })\n  result.chunks = proof.chunks({ items: [1, 2, 3] })\n' +
	'  result.literal = proof.literal({ name: input.x })\n  result.rhino = proof.rhino({})\n  result.bare = proof.bare({ name: input.x })\n}\n' });
[["greet", greetBlock], ["chunks", chunkBlock], ["literal", literalBlock], ["rhino", rhinoBlock], ["bare", bareBlock]].forEach(function (block) {
	files.writeStringToFile(new java.io.File(blocksDir, "_flow/blocks/proof/" + block[0] + ".block.js"), block[1], "UTF-8");
});
var __flowProjectDir = String(blocksDir.getAbsolutePath());
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function run(code) {
	var out = JSON.parse(String(engine.run(JSON.stringify({ flowSource: code, input: { x: "X", n: 2 }, includeTrace: false }))));
	check(out.ok, "run: " + JSON.stringify(out).substring(0, 800) + "\n" + code);
	return JSON.stringify(out.result);
}
var braces = 'const _flow = { sourceVersion: 2, inputs: { x: { type: "string" }, n: { type: "integer" } } }\n\n' +
	'function Braces({ input, config, result }) {\n  result.body = template.render({ template: "a {{ input.x }} b {{ input.n + 1 }}" })\n' +
	'  result.value = "c {{ input.x }} d"\n  result.text = "e {{}} f"\n}\n';
var literal = 'const _flow = { sourceVersion: 2, inputs: { x: { type: "string" } } }\n\n' +
	'function Literal({ input, config, result }) {\n  result.value = `g {{ input.x }} ${input.x}`\n}\n';
var bracesDir = project({ Braces: braces, Literal: literal });
var bracesReport = migrate(bracesDir, true);
check(bracesReport.written && bracesReport.flows.migrated.length === 1 && bracesReport.flows.migrated[0].flow === "_flow/flows/Braces.flow.js" &&
	bracesReport.flows.keptV2.length === 1 && bracesReport.flows.keptV2[0].flow === "_flow/flows/Literal.flow.js", "{{ }} migration report: " + JSON.stringify(bracesReport.flows));
var bracesV3 = read(bracesDir, "_flow/flows/Braces.flow.js");
check(bracesV3.indexOf("template.render({ template: `a ${input.x} b ${input.n + 1}` })") >= 0 && bracesV3.indexOf("result.value = `c ${input.x} d`") >= 0 &&
	bracesV3.indexOf('result.text = "e {{}} f"') >= 0, "the interpolated {{ }} are written as template literals: " + bracesV3);
check(run(braces) === JSON.stringify({ body: "a X b 3", value: "c X d", text: "e {{}} f" }) && run(bracesV3) === run(braces), "same result before and after: " + run(bracesV3));
check(read(bracesDir, "_flow/flows/Literal.flow.js") === literal && run(literal) === JSON.stringify({ value: "g X X" }), "the v2 template literal with {{ }} stays in v2");

// Nested prefix operators (!!x, - -x) are migrated with their meaning: the v3 text, read back as !!x and not !x, passes
// the guard, and the Flow gives the same result before and after.
var negations = 'const _flow = { sourceVersion: 2, inputs: { x: { type: "string" }, n: { type: "integer" } } }\n\n' +
	'function Negations({ input, config, result }) {\n  result.set = !!input.x\n  result.unset = !!(input.n - 2)\n  result.n = - -input.n\n' +
	'  result.flags = [{ name: "--x", enabled: !!input.x }, { name: "--y", enabled: !input.n && !!input.x }]\n}\n';
var negationsDir = project({ Negations: negations });
var negationsReport = migrate(negationsDir, true);
check(negationsReport.written && negationsReport.flows.migrated.length === 1 && !negationsReport.flows.keptV2.length, "nested prefix operators: " + JSON.stringify(negationsReport.flows));
var negationsV3 = read(negationsDir, "_flow/flows/Negations.flow.js");
check(negationsV3.indexOf("result.set = !!input.x") >= 0 && negationsV3.indexOf("enabled: !input.n && !!input.x") >= 0, "the v3 text keeps !!: " + negationsV3);
check(run(negations) === JSON.stringify({ set: true, unset: false, n: 2, flags: [{ name: "--x", enabled: true }, { name: "--y", enabled: false }] }) &&
	run(negationsV3) === run(negations), "same result before and after: " + run(negationsV3) + "\n" + negationsV3);

// The slots of a block that declares names for them (forEachChunk: chunk in each, acc and value in reduce) are written
// without parameter, as section 11 requires; their bodies read these names as they are. The Flow migrates and gives the
// same result before and after.
var slots = 'const _flow = { sourceVersion: 2 }\n\n' +
	'function Slots({ input, config, result }) {\n  local.best = forEachChunk({\n    source: [3, 1, 4, 1, 5, 9, 2, 6],\n    size: 3,\n' +
	'    $$each: function ({chunk}) {\n      local.sorted = list.sort({ items: chunk.rows, by: current, direction: "desc" })\n      return local.sorted[0]\n    },\n' +
	'    $$reduce: function ({acc, value}) {\n      if ({ condition: acc === null || value > acc, $$then: function () { return value }, $$else: function () { return acc } })\n    },\n' +
	'  })\n  result.best = local.best\n}\n';
var slotsDir = project({ Slots: slots });
var slotsReport = migrate(slotsDir, true);
check(slotsReport.written && slotsReport.flows.migrated.length === 1 && !slotsReport.flows.keptV2.length, "slots with parameters: " + JSON.stringify(slotsReport.flows));
var slotsV3 = read(slotsDir, "_flow/flows/Slots.flow.js");
check(slotsV3.indexOf("$$each: function () {") >= 0 && slotsV3.indexOf("$$reduce: function () {") >= 0 && slotsV3.indexOf("chunk.rows") >= 0 &&
	!/function \(\{/.test(slotsV3), "the v3 slots have no parameter: " + slotsV3);
check(run(slots) === JSON.stringify({ best: 9 }) && run(slotsV3) === run(slots), "same result before and after: " + run(slotsV3) + "\n" + slotsV3);

// A block written in FlowScript is migrated as a Flow is, whole: its _meta declares sourceVersion 3 and nothing else
// changes in it, its implementation is the guarded v3 text, and the engine runs it as before. A block whose guard fails
// stays in v2 with its cause; Rhino blocks and blocks without a declared sourceVersion are not changed.
var callerBefore = read(blocksDir, "_flow/flows/Caller.flow.js"), resultBefore = run(callerBefore);
check(resultBefore === JSON.stringify({ greet: { text: "Hello X", count: 2 }, chunks: { size: 2 }, literal: { text: "g X X" }, rhino: { rhino: true }, bare: { bare: "X" } }),
	"the blocks before: " + resultBefore);
var blockReport = migrate(blocksDir, true);
check(blockReport.written && blockReport.flows.migrated.length === 1 && blockReport.blocks.total === 4 && blockReport.blocks.migrated.length === 2 &&
	blockReport.blocks.migrated[0].block === "_flow/blocks/proof/chunks.block.js" && blockReport.blocks.migrated[1].block === "_flow/blocks/proof/greet.block.js" &&
	blockReport.blocks.keptV2.length === 1 &&
	blockReport.blocks.keptV2[0].block === "_flow/blocks/proof/literal.block.js" && /^definition differs/.test(blockReport.blocks.keptV2[0].reason) &&
	blockReport.blocks.outOfScope.length === 1 && blockReport.blocks.outOfScope[0].block === "_flow/blocks/proof/bare.block.js",
	"block migration report: " + JSON.stringify(blockReport.blocks));
var greetV3 = read(blocksDir, "_flow/blocks/proof/greet.block.js");
check(greetV3.indexOf('// A comment above the header.\n' + blockMeta(3) + 'const _flow = { sourceVersion: 3 }\n\nfunction proof_greet({ input, config, result }) {\n') === 0 &&
	greetV3.indexOf("local.big = input.items.filter(item => item > 1)") >= 0 && greetV3.indexOf("local.answer = { text: `Hello ${input.name}`, count: local.big.length }") >= 0 &&
	greetV3.indexOf("reply: return local.answer") >= 0,
	"the v3 block: " + greetV3);
var chunksV3 = read(blocksDir, "_flow/blocks/proof/chunks.block.js");
check(chunksV3.indexOf("    $$each: function () {\n      local.n = chunk.length\n    },") >= 0, "the v3 block writes its slot without parameter: " + chunksV3);
check(read(blocksDir, "_flow/blocks/proof/literal.block.js") === literalBlock && read(blocksDir, "_flow/blocks/proof/rhino.block.js") === rhinoBlock &&
	read(blocksDir, "_flow/blocks/proof/bare.block.js") === bareBlock, "the other blocks are not changed");
var callerAfter = read(blocksDir, "_flow/flows/Caller.flow.js");
check(callerAfter !== callerBefore && run(callerAfter) === resultBefore && run(callerBefore) === resultBefore, "the same result after the migration: " + run(callerAfter));
var readBack = JSON.parse(String(engine.blockCodeGet(JSON.stringify({ name: "proof.greet" }))));
check(readBack.ok && readBack.descriptor.sourceVersion === 3, "the engine reads the v3 block: " + JSON.stringify(readBack).substring(0, 600));
print("flowscript-v3-migrate OK");
