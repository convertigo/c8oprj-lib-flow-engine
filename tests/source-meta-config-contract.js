// Metadata is static source data; Flow config defaults must reach runtime and picker.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-meta-config-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var corpus = JSON.parse(String(files.readFileToString(new java.io.File(engineDir, "../../tests/fixtures/source-metadata-values.json"), "UTF-8")));
	corpus.valid.forEach(function (fixture) {
		var parsedFixture = api("flowSourceValidate", { code: "const _flow={config:{sample:" + fixture.source + "}}\nfunction Sample(){\nset({path:'result.sample',value:config.sample})\n}" });
		assert(parsedFixture.ok, "Shared metadata fixture rejected: " + fixture.source);
		equal(parsedFixture.definition.flow.config.sample, fixture.value, "Shared metadata fixture changed: " + fixture.source);
		var fixtureRun = api("run", { flowSource: parsedFixture.source, includeTrace: false });
		equal(fixtureRun.result.sample, fixture.value, "Shared fixture runtime changed: " + fixture.source);
	});
	corpus.invalid.forEach(function (token) {
		var rejectedFixture = api("flowSourceValidate", { code: "const _flow={config:{sample:" + token + "}}\nfunction Sample(){}" });
		assert(!rejectedFixture.ok, "Shared metadata fixture accepted: " + token);
	});
	var meta = { sourceVersion: 2, description: "Metadata contract", config: {
		greeting: "Hello", flag: false, count: 0, empty: "", missing: null,
		service: { host: "flow", timeout: 20 }, rows: [{ id: 5, disabled: true }],
		binding: { mode: "source", source: { category: "fullsync", scopeId: "orders", operation: "get", path: ["id"] } },
		id: "business", disabled: false, "$$id": "business-dollar"
	}, inputs: { name: { type: "string", "default": "friend" } }, outputs: { type: "object" } };
	function code(metadata) { return 'const _flow = ' + JSON.stringify(metadata) + '\nfunction ConfigProof({input, config, result}) {\nset({$$id:"read",path:"result.snapshot",value:config})\n}'; }
	var source = code(meta);
	var parsed = api("flowSourceValidate", { name: "ConfigProof", code: source });
	assert(parsed.ok, "Metadata parse: " + JSON.stringify(parsed));
	equal(parsed.definition.flow, meta, "Metadata changed at parse boundary");
	var run = api("run", { flowSource: source, includeTrace: false });
	assert(run.ok, "Runtime: " + JSON.stringify(run));
	equal(run.result.snapshot, meta.config, "Flow defaults were ignored or interpreted as node attributes");
	var written = api("flowSourceValidate", { name: "ConfigProof", flowSource: parsed.source, includeMeta: false });
	assert(written.ok, "Metadata writer");
	equal(written.definition.flow, meta, "Metadata writer changed values");
	equal(api("run", { flowSource: written.code, includeTrace: false }).result.snapshot, meta.config, "Writer changed runtime config");
	var again = api("flowSourceValidate", { name: "ConfigProof", flowSource: written.source });
	assert(written.code === again.code, "Metadata writer not idempotent");
	var projectConfig = { greeting: "Project", service: { host: "project" }, projectOnly: true };
	files.writeStringToFile(new java.io.File(project, "_flow/engine.yaml"), JSON.stringify({ version: 1, config: projectConfig }), "UTF-8");
	engine.cacheClear();
	var expected = JSON.parse(JSON.stringify(meta.config));
	expected.greeting = "Request"; expected.service = { host: "project" }; expected.projectOnly = true;
	var overridden = api("run", { flowSource: source, config: { greeting: "Request" }, includeTrace: false });
	equal(overridden.result.snapshot, expected, "Precedence must be Flow defaults < project < request, replacing root branches");
	var context = api("context", { flowSource: source, node: "read", property: "value", include: ["config"], detail: "normal" });
	assert(context.ok && JSON.stringify(context).indexOf("greeting") !== -1 && JSON.stringify(context).indexOf("boolean") !== -1,
		"Picker did not publish effective config: " + JSON.stringify(context));
	var edited = api("applyMutation", { target: "flow", flowSource: source,
		mutation: { op: "replace", path: "/flow/config/flag", value: true } });
	assert(edited.ok && api("run", { flowSource: edited.source, includeTrace: false }).result.snapshot.flag === true,
		"Metadata mutation did not reach runtime: " + JSON.stringify(edited));
	var draft = api("flowCodeSet", { name: "ConfigProof", code: edited.source });
	assert(draft.ok, "Config draft failed");
	var got = api("flowCodeGet", { name: "ConfigProof", draft: true });
	assert(got.ok && got.revision === draft.revision, "Config draft revision");
	var promoted = api("flowCodePromote", { name: "ConfigProof", revision: got.revision });
	assert(promoted.ok, "Config save failed: " + JSON.stringify(promoted));
	var saved = api("flowCodeGet", { name: "ConfigProof", draft: false });
	assert(api("run", { flowSource: saved.code, includeTrace: false }).result.snapshot.flag === true, "Saved config lost edit");
	function find(nodes, path) {
		for (var i = 0; i < (nodes || []).length; i++) {
			if (nodes[i].path === path) return nodes[i];
			var nested = find(nodes[i].children, path); if (nested) return nested;
		}
		return null;
	}
	var tree = api("describeTree", { target: "flow", flowSource: source });
	var flag = find(tree.children, "flow.config.flag");
	assert(flag && JSON.parse(flag.info).sourceMutationPath === "flow.config.flag", "Flow config not addressable in the tree");
	var nullField = find(tree.children, "flow.config.missing");
	assert(nullField && JSON.parse(nullField.info).propertyDefinitions["#flow_value"].type === "null", "Null config was incorrectly typed as array");
	var renamed = api("applyMutation", { target: "flow", flowSource: source,
		mutation: { op: "renameKey", path: JSON.parse(flag.info).sourceMutationPath, value: "renamedFlag" } });
	assert(renamed.ok && renamed.selectionMutationPath === "flow.config.renamedFlag" && find(renamed.children, "flow.config.renamedFlag"), "Config rename/selection failed");
	var inputName = find(tree.children, "flow.inputs.name");
	assert(inputName, "Input declaration projected at a nonexistent root path");
	var inputEdited = api("applyMutation", { target: "flow", flowSource: source,
		mutation: { op: "replace", path: inputName.path + ".default", value: "new default" } });
	var inputChecked = api("flowSourceValidate", { code: inputEdited.source });
	assert(inputChecked.ok && inputChecked.definition.flow.inputs.name.default === "new default" && !inputChecked.definition.inputs,
		"Input editing created a shadow declaration lost by the writer");
	var outputType = find(tree.children, "flow.outputs.type");
	assert(outputType, "Output declaration projected at a nonexistent root path");
	var outputEdited = api("applyMutation", { target: "flow", flowSource: source,
		mutation: { op: "replace", path: outputType.path, value: "array" } });
	var outputChecked = api("flowSourceValidate", { code: outputEdited.source });
	assert(outputChecked.ok && outputChecked.definition.flow.outputs.type === "array", "Output declaration edit lost");
	assert(JSON.stringify(context).indexOf('business-dollar') === -1 && JSON.stringify(context).indexOf('"Project"') === -1,
		"Picker leaked config values instead of publishing schemas");
	var legacy = source.replace('"sourceVersion":2,', '').replace(/\$\$id:/g, 'id:');
	var legacyParsed = api("flowSourceValidate", { code: legacy });
	var legacyWritten = api("flowSourceValidate", { flowSource: legacyParsed.source, includeMeta: false });
	assert(legacyWritten.ok && legacyWritten.code.indexOf('"config"') !== -1, "Required config removed by compact v1 writer");
	function rejects(code, expectedCode) {
		var invalid = api("flowSourceValidate", { code: code });
		assert(!invalid.ok && JSON.stringify(invalid).indexOf(expectedCode) !== -1, "Expected " + expectedCode + ": " + JSON.stringify(invalid));
	}
	['input.id', '{ nested: [input.id] }', '{ ...input }', '{ key }', '{ [input.id]: 1 }', '{ x: 1e999 }', '{ x: "a" + "b" }', '{ list: [1,,2] }'].forEach(function (value) {
		rejects('const _flow = {config:' + value + '}\nfunction Invalid(){}', 'FLOWSCRIPT_METADATA_LITERAL_REQUIRED');
	});
	['null', 'false', '[]', '"ignored"'].forEach(function (value) {
		rejects('const _flow = {config:' + value + '}\nfunction Invalid(){}', 'FLOW_CONFIG_OBJECT_REQUIRED');
	});
	rejects('const _flow={config:{a:1}}\nconst _flow={config:{b:2}}\nfunction Invalid(){}', 'FLOWSCRIPT_DUPLICATE_METADATA');
	rejects('const _flow={config:{a:1,a:2}}\nfunction Invalid(){}', 'FLOWSCRIPT_DUPLICATE_PROPERTY');
	var escaped = api("flowSourceValidate", { code: "const _flow={config:{text:'\\u00e9\\x21\\r\\n\\t\\\\\\\'" + "'}}\nfunction Escaped(){}" });
	assert(escaped.ok, "Quoted metadata parsing: " + JSON.stringify(escaped));
	equal(escaped.definition.flow.config.text, "é!\r\n\t\\'", "Quoted metadata escapes changed");
	var dynamicBlock = api("blockCodeSet", { name: "proof.invalidMeta", code: 'const _meta={properties:{value:{default:input.id}}}\nfunction Bad(){}' });
	assert(!dynamicBlock.ok && JSON.stringify(dynamicBlock).indexOf('FLOWSCRIPT_METADATA_LITERAL_REQUIRED') !== -1, "Block metadata silently stringified an expression");
	// Direct common resolver: falsy values are present, not requests for fallback.
	var service = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/project-config-service.js"), "UTF-8")));
	var normalizeCount = 0;
	var configEnv = { globalScope: { missing: "ambient", fallback: 42 }, jsValue: function (value) { return value; },
		normalizeTree: function (value) { normalizeCount++; return JSON.parse(JSON.stringify(value)); },
		collectConfigKeys: function () { return ["missing", "fallback"]; } };
	var detached = service.effectiveConfig({}, { flow: meta }, {}, configEnv);
	assert(detached.missing === null && detached.fallback === 42 && detached.flag === false && detached.count === 0 && detached.empty === "", "Falsy defaults confused with absent config");
	assert(normalizeCount === Object.keys(meta.config).length, "Config defaults recopied beyond one copy per root branch");
	detached.rows[0].id = 99;
	assert(meta.config.rows[0].id === 5, "Config resolution aliased source data");
	normalizeCount = 0;
	var winners = service.effectiveConfig({config:{service:{host:"request"}}}, {flow:meta}, {config:{service:{host:"project"}}}, configEnv);
	assert(normalizeCount === Object.keys(meta.config).length && winners.service.host === "request", "Overwritten config branches were copied unnecessarily");
	var blockSource = 'const _meta={sourceVersion:2,runtime:"flow"}\nconst _flow={config:{blockOnly:"inside",greeting:"block"}}\n' +
		'function Scoped(){\nset({path:"result.local",value:config.blockOnly})\nset({path:"result.greeting",value:config.greeting})\n}';
	var scoped = api("blockCodeSet", { name: "proof.scoped", code: blockSource });
	assert(scoped.ok, "Scoped config block: " + JSON.stringify(scoped));
	var scopeCode = 'const _flow={sourceVersion:2,config:{greeting:"flow"}}\nfunction ScopedCaller(){\n' +
		'proof.scoped({$$out:"result.block"})\nset({path:"result.after",value:config.blockOnly ?? "absent"})\n}';
	var scopeRun = api("run", { flowSource: scopeCode, includeTrace: false });
	assert(scopeRun.ok && scopeRun.result.block.local === "inside" && scopeRun.result.block.greeting === "Project"
		&& scopeRun.result.after === "absent", "Block defaults missing or leaked to caller: " + JSON.stringify(scopeRun));
	var failSource = blockSource.replace('set({path:"result.local",value:config.blockOnly})', 'throw({code:"EXPECTED",message:"test"})');
	assert(api("blockCodeSet", { name: "proof.failing", code: failSource }).ok, "Failing block fixture");
	assert(api("blockCodeSet", { name: "proof.capture", code: 'const _meta={runtime:"rhino"}\n' +
		'(function(){return {run:function(ctx){var previous=ctx.scopes.config;try{ctx.callBlock("proof.failing",{});}catch(e){return {caught:true,same:ctx.scopes.config===previous,leaked:ctx.scopes.config.blockOnly!==undefined};}return {caught:false};}};}())' }).ok, "Catching fixture");
	var caught = api("run", { flowSource: 'const _flow={sourceVersion:2}\nfunction Catch(){proof.capture({$$out:"result.caught"})}', includeTrace: false });
	equal(caught.result.caught, { caught: true, same: true, leaked: false }, "Graph block did not restore config after error");
	print("source-meta-config-contract OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
