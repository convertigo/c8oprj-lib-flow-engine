// Real Engine regression: business data must not become node metadata.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-property-chain-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
try {
	var properties = {};
	["id", "disabled", "comment", "block", "nodes", "props", "value", "out", "$id", "$$id", "$$$id"].forEach(function (name) {
		properties[name] = { kind: "value", type: "unknown" };
	});
	properties.source = { kind: "expression", type: "unknown" };
	files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/echo.block.js"),
		"const _meta = " + JSON.stringify({ version: 1, runtime: "rhino", properties: properties }) + "\n" +
		"(function () { return { run: function (ctx, node) { var p = ctx.props(node); return { " +
		"id: ctx.template(p.id), disabled: ctx.template(p.disabled), comment: ctx.template(p.comment), " +
		"block: ctx.template(p.block), nodes: ctx.template(p.nodes), props: ctx.template(p.props), " +
		"source: ctx.expr(p.source), value: ctx.template(p.value), out: ctx.template(p.out) }; } }; }())", "UTF-8");
	files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/graph.block.js"),
		"const _meta = " + JSON.stringify({ version: 1, runtime: "flow", properties: { id: properties.id, disabled: properties.disabled } }) + "\n" +
		"function Graph({ input, result }) {\n result.id = input.id\n result.disabled = input.disabled\n return result\n}", "UTF-8");
	files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/routed.block.js"),
		"const _meta = " + JSON.stringify({ version: 1, runtime: "flow", properties: { out: properties.out } }) + "\n" +
		"function Routed({ input, result }) {\n result.businessOut = input.out\n return result\n}", "UTF-8");
	var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function check(code) { return api("flowSourceValidate", { name: "PropertyChain", code: code }); }
	function run(source) { return api("run", { flowSource: source, input: { id: 5, locked: true }, includeTrace: false }); }
	var source = [
		"function PropertyChain({ input, result }) {",
		'proof.echo({ id: "readRow", comment: "engine comment", out: "result.row", props: { id: input.id, disabled: input.locked, comment: "business", block: "business.block", source: input.id, nodes: [{ id: 7, props: { id: 8 } }], props: { id: 9 }, value: { kind: "source", value: { scopeId: "orders", path: ["rows", "id"], operation: "fullsync.get" } } } })',
		"return result",
		"}"
	].join("\n");
	var parsed = check(source);
	assert(parsed.ok, "Validation: " + JSON.stringify(parsed.diagnostics));
	var node = parsed.definition.nodes[0];
	assert(node.id === "readRow" && node.props && node.props.id === "{{ input.id }}", "Parser/canonicalizer lost business id: " + JSON.stringify(node));
	assert(node.disabled === undefined && node.props.disabled === "{{ input.locked }}", "Business disabled changed structural enable state");
	equal(node.props.nodes, [{ id: 7, props: { id: 8 } }], "Business arrays interpreted as nodes");
	var executed = run(source);
	assert(executed.ok, "Execution failed: " + JSON.stringify(executed));
	assert(executed.result.row.id === 5 && executed.result.row.disabled === true, "Runtime business properties lost: " + JSON.stringify(executed));
	assert(executed.result.row.source === 5, "Expression kind not retained inside props");
	assert(executed.result.row.comment === "business" && executed.result.row.block === "business.block", "Metadata leaked into business payload");
	equal(executed.result.row.nodes, node.props.nodes, "Runtime business arrays changed");
	equal(executed.result.row.value, node.props.value, "Complete structured binding changed");
	var written = api("flowSourceValidate", { name: "PropertyChain", flowSource: parsed.source });
	assert(written.ok, "Writer validation: " + JSON.stringify(written.diagnostics));
	equal(written.definition.nodes[0].props, node.props, "Writer/reparse lost business properties");
	equal(run(written.code).result, executed.result, "Writer changed runtime result");
	var writtenAgain = api("flowSourceValidate", { name: "PropertyChain", flowSource: written.source });
	assert(writtenAgain.code === written.code, "Writer is not idempotent");
	var invalid = check(source.replace('props: { id: input.id', 'props: { unknownProperty: 1, id: input.id'));
	assert(!invalid.ok && JSON.stringify(invalid.diagnostics).indexOf("UNKNOWN_BLOCK_PROPERTY") !== -1, "Nested property validation skipped");
	var invalidExpression = check(source.replace('source: input.id', 'source: input.id @'));
	assert(!invalidExpression.ok, "Expression validation skipped inside props");
	var disabled = api("applyMutation", { target: "flow", flowSource: source, mutation: { op: "setEnabled", nodeId: "readRow", enabled: false } });
	assert(run(disabled.source).result.row === undefined, "Structural disable did not skip execution");
	var enabled = api("applyMutation", { target: "flow", flowSource: disabled.source, mutation: { op: "setEnabled", nodeId: "readRow", enabled: true } });
	equal(run(enabled.source).result, executed.result, "Enable/disable lost business disabled");
	var edited = api("applyMutation", { target: "flow", flowSource: source, mutation: { op: "replace", nodeId: "readRow", property: "id", value: 6 } });
	var editedNode = check(edited.source).definition.nodes[0];
	assert(editedNode.id === "readRow" && editedNode.props.id === 6, "Business mutation renamed the node");
	assert(run(edited.source).result.row.id === 6, "Edited business id was not executed");
	var renamed = api("applyMutation", { target: "flow", flowSource: edited.source, mutation: { op: "replace", path: "/nodes/0/id", value: "renamed" } });
	var renamedNode = check(renamed.source).definition.nodes[0];
	assert(renamedNode.id === "renamed" && renamedNode.props.id === 6, "Structural rename changed business id");
	var copied = api("applyMutation", { target: "flow", flowSource: source, mutation: { op: "copy", nodeId: "readRow", newId: "copied", path: "/nodes" } });
	var copiedNode = check(copied.source).definition.nodes.filter(function (n) { return n.id === "copied"; })[0];
	assert(copiedNode, "Copy identity missing: " + copied.source);
	equal(copiedNode.props, node.props, "Copy altered business properties");
	var controlSource = ['function PropertyChain() {',
		'if({ id: "branch", props: { condition: input.locked } }) {',
		'set({ id: "setId", props: { path: "result.value", value: input.id } })',
		'} else {',
		'set({ id: "elseId", props: { path: "result.value", value: 0 } })',
		'}', 'return({ id: "returnId", props: { value: result } })', '}'].join("\n");
	var control = check(controlSource);
	assert(control.ok, "Control blocks: " + JSON.stringify(control.diagnostics));
	equal(run(controlSource).result, { value: 5 }, "Enveloped control block execution");
	var controlWritten = api("flowSourceValidate", { name: "PropertyChain", flowSource: control.source });
	equal(run(controlWritten.code).result, { value: 5 }, "Control blocks writer round trip");
	var draft = api("flowCodeSet", { name: "PropertyChain", code: source });
	assert(draft.ok, "Code-set working copy: " + JSON.stringify(draft));
	var fetched = api("flowCodeGet", { name: "PropertyChain", draft: true });
	assert(fetched.ok && fetched.revision === draft.revision, "Working copy revision changed");
	var draftRun = api("flowCodeRun", { name: "PropertyChain", draft: true, input: { id: 5, locked: true }, includeTrace: false });
	equal(draftRun.result, executed.result, "Code-run working copy lost payload");
	var promoted = api("flowCodePromote", { name: "PropertyChain", revision: fetched.revision });
	assert(promoted.ok, "Promotion: " + JSON.stringify(promoted));
	var saved = api("flowCodeGet", { name: "PropertyChain", draft: false });
	equal(run(saved.code).result, executed.result, "Saved code lost payload");
	var graphSource = 'function PropertyChain() {\nproof.graph({ id: "callGraph", out: "result.row", props: { id: input.id, disabled: input.locked } })\n}';
	var graphRun = run(graphSource);
	assert(graphRun.ok, "Graph block failed: " + JSON.stringify(graphRun));
	equal(graphRun.result.row, { id: 5, disabled: true }, "Graph block input confused identity and business id");
	var graphParsed = check(graphSource);
	var graphWritten = api("flowSourceValidate", { name: "PropertyChain", flowSource: graphParsed.source });
	equal(run(graphWritten.code).result, graphRun.result, "Graph block writer changed result");
	[0, false, "", null].forEach(function (literal) {
		var valueSource = source.replace('id: input.id', 'id: ' + JSON.stringify(literal));
		var valueParsed = check(valueSource);
		var valueWritten = api("flowSourceValidate", { name: "PropertyChain", flowSource: valueParsed.source });
		equal(run(valueWritten.code).result.row.id, literal, "Explicit falsy value lost");
	});
	var utils = eval(read(new java.io.File(engineDir, "modules/flow-node-utils.js")));
	var copies = 0;
	utils.canonicalFlowNode(node, { normalizeTree: function (value) { copies++; return JSON.parse(JSON.stringify(value)); } });
	assert(copies === 1, "Canonicalization redundantly recopied the business subtree");
	var versionTwo = [
		'const _flow = { sourceVersion: 2 }',
		'function PropertyChain({ input, result }) {',
		'proof.echo({ $$id: "row", $$comment: "engine", $$disabled: false, $$out: "result.row", id: input.id, disabled: input.locked, comment: "business", source: input.id, $id: 1, $$$id: 2, $$$$id: 3 })',
		'}'
	].join("\n");
	var v2 = check(versionTwo);
	assert(v2.ok, "Version 2 parsing: " + JSON.stringify(v2));
	var v2node = v2.definition.nodes[0];
	assert(v2node.id === "row" && v2node.props.id === "{{ input.id }}", "Version 2 identity collision");
	assert(v2node.disabled === false && v2node.props.disabled === "{{ input.locked }}", "Version 2 disabled collision");
	assert(v2node.props.$id === 1 && v2node.props.$$id === 2 && v2node.props.$$$id === 3, "Version 2 dollar escape");
	assert(run(versionTwo).result.row.id === 5, "Version 2 runtime");
	var v2written = api("flowSourceValidate", { name: "PropertyChain", flowSource: v2.source, includeMeta: false });
	assert(v2written.code.indexOf('"sourceVersion": 2') !== -1, "Writer omitted required dialect marker");
	assert(v2written.code.indexOf('$$disabled: false') !== -1, "Writer lost explicit engine false");
	// Captures written on the left are parsed after the argument bag; structural
	// key insertion order is irrelevant, unlike the order inside business data.
	equal(Object.keys(v2written.definition.nodes[0]).sort(), Object.keys(v2node).sort(), "Version 2 writer changed node fields");
	Object.keys(v2node).forEach(function (key) {
		equal(v2written.definition.nodes[0][key], v2node[key], "Version 2 writer changed node field " + key);
	});
	var v2edited = api("applyMutation", { target: "flow", flowSource: versionTwo, mutation: { op: "replace", nodeId: "row", property: "id", value: 7 } });
	assert(run(v2edited.source).result.row.id === 7, "Version 2 property mutation");
	var v2escaped = api("applyMutation", { target: "flow", flowSource: versionTwo, mutation: { op: "replace", nodeId: "row", property: "$$$id", value: 9 } });
	assert(check(v2escaped.source).definition.nodes[0].props.$$id === 9, "Escaped business property mutation");
	var v2renamed = api("applyMutation", { target: "flow", flowSource: versionTwo, mutation: { op: "replace", nodeId: "row", property: "$$id", value: "other" } });
	assert(check(v2renamed.source).definition.nodes[0].id === "other" && run(v2renamed.source).result.row.id === 5, "Namespaced engine identity mutation");
	var routed = versionTwo.replace('comment: "business",', 'comment: "business", out: "result.business",');
	var routedRun = run(routed);
	assert(routedRun.ok && routedRun.result.row.out === "result.business" && !routedRun.result.business, "Business output hijacked engine routing: " + JSON.stringify(routedRun));
	var unroutedRun = run(routed.replace('$$out: "result.row",', ''));
	equal(unroutedRun.result, {}, "Business output triggered an implicit engine write");
	var routedGraph = 'const _flow = { sourceVersion: 2 }\nfunction PropertyChain() {\nproof.routed({ $$out: "result.row", out: "result.business" })\n}';
	equal(run(routedGraph).result, { row: { businessOut: "result.business" } }, "Prepared graph output hijacked engine routing");
	var v2disabled = api("applyMutation", { target: "flow", flowSource: versionTwo, mutation: { op: "setEnabled", nodeId: "row", enabled: false } });
	assert(run(v2disabled.source).result.row === undefined, "Version 2 structural disable");
	['$$typo: true', '$$disabled: "false"', '$$id: 5'].forEach(function (attribute) {
		var invalid = check(versionTwo.replace('$$id: "row"', attribute));
		assert(!invalid.ok, "Invalid version 2 metadata accepted: " + attribute);
	});
	var projected = [];
	function collect(nodes) { (nodes || []).forEach(function (n) { projected.push(n); collect(n.children); }); }
	collect(v2edited.children);
	var projectedRow = projected.filter(function (n) { return n.kind === "node" && JSON.stringify(n).indexOf("proof.echo") !== -1; })[0];
	assert(projectedRow, "Missing projected row");
	var info = typeof projectedRow.info === "string" ? JSON.parse(projectedRow.info) : projectedRow.info;
	assert(info.propertyDefinitions.id.definitionPath === "props.id", "Business property path not projected");
	assert(info.propertyDefinitions.$$id.definitionPath === "id", "Engine property path not projected");
	assert(info.propertyDefinitions.$$disabled["default"] === false && info.propertyDefinitions.$$out.definitionPath === "out", "Engine property defaults/routing not projected");
	assert(info.propertyDefinitions.out.definitionPath === "props.out", "Missing business output aliases metadata");
	assert(info.propertyDefinitions.$$$id && info.propertyDefinitions.$$$id.definitionPath === "props.$$id", "Escaped property path not projected: " + JSON.stringify(info.propertyDefinitions));
	var v2natural = [
		'const _flow = { sourceVersion: 2 }',
		'function PropertyChain() {',
		'const now = date.now({})',
		'const rows = list.map({ items: [1, 2], select: { id: current, resolved: proof.graph({ id: current, disabled: false }) } })',
		'result.rows = rows',
		'result.time = now',
		'if (input.locked) {',
		'  result.locked = true',
		'}',
		'}'
	].join("\n");
	var natural = check(v2natural);
	assert(natural.ok, "Version 2 natural syntax: " + JSON.stringify(natural.diagnostics));
	var naturalRun = run(v2natural);
	assert(naturalRun.ok && naturalRun.result.time > 0 && naturalRun.result.locked === true, "Version 2 natural runtime: " + JSON.stringify(naturalRun));
	equal(naturalRun.result.rows, [{ id: 1, resolved: { id: 1, disabled: false } }, { id: 2, resolved: { id: 2, disabled: false } }], "Nested projection business id");
	var naturalWritten = api("flowSourceValidate", { name: "PropertyChain", flowSource: natural.source });
	assert(naturalWritten.ok, "Natural source writer: " + JSON.stringify(naturalWritten));
	var naturalAgain = run(naturalWritten.code);
	equal(naturalAgain.result.rows, naturalRun.result.rows, "Natural source writer changed projection");
	assert(naturalAgain.result.locked === true && naturalAgain.result.time > 0, "Natural source writer lost control/data");
	var conflictingOutput = check(versionTwo.replace('proof.echo({', 'result.other = proof.echo({'));
	assert(!conflictingOutput.ok && JSON.stringify(conflictingOutput).indexOf("FLOW_SOURCE_OUTPUT_CONFLICT") !== -1, "Assignment silently overwrote explicit output: " + JSON.stringify(conflictingOutput));
	var assignedSet = 'const _flow = { sourceVersion: 2 }\nfunction PropertyChain() {\nconst value = set({ value: 5 })\nresult.value = value\nresult.direct = set({ value: 7 })\n}';
	equal(run(assignedSet).result, { value: 5, direct: 7 }, "Assignment lost enveloped set path");
	var discardedMeta = check(v2natural.replace('list.map({ items:', 'list.map({ $$disabled: true, items:'));
	assert(!discardedMeta.ok, "Lowering silently discarded metadata");
	print("source-property-chain OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
