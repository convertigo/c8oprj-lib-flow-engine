var engineDir = arguments.length > 0 ? arguments[0] : "libs/flow";
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = String(new java.io.File(engineDir).getAbsolutePath());
var projectDirFile = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-smoke-project");
if (projectDirFile.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectDirFile);
}
projectDirFile.mkdirs();
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function findChild(parent, name) {
	var children = parent && parent.children || [];
	for (var i = 0; i < children.length; i++) {
		if (children[i].name === name) {
			return children[i];
		}
	}
	return null;
}

var flowSource = [
	"version: 1",
	"nodes:",
	"  - id: initItems",
	"    block: set",
	"    path: local.items",
	"    value:",
	"      - Paris",
	"      - Lyon",
	"  - id: initResult",
	"    block: set",
	"    path: result.cities",
	"    value: []",
	"  - id: loopItems",
	"    block: forEach",
	"    items: local.items",
	"    nodes:",
		"      - id: pushCurrent",
		"        block: json.push",
		"        path: result.cities",
		"        value: \"{{ current }}\"",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: Hello Flow",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result }}\"",
	""
].join("\n");

var catalog = JSON.parse(engine.catalog("{}"));
print(JSON.stringify(catalog));
assertTrue(catalog.blocks.some(function (block) {
	return block.blockId === "requestable.call";
}), "catalog did not expose requestable.call");
assertTrue(catalog.blocks.some(function (block) {
	return block.blockId === "json.push" && block.namespace === "json" && block.name === "push" &&
		block.provider === "lib_flow_engine" && block.origin === "core";
}), "catalog did not expose package/namespace metadata");
var coreSetBlock = JSON.parse(engine.blockGet(JSON.stringify({
	name: "set",
	detail: "full"
})));
assertTrue(coreSetBlock.format === "blockjs" &&
	String(coreSetBlock.codeFile).indexOf("set.block.js") !== -1 &&
	coreSetBlock.code.indexOf("Writes a value to a scope path.") !== -1 &&
	coreSetBlock.implementationSource.indexOf("catalog: function") === -1,
	"core set block is not exposed as canonical Flow block code");
var expressionType = catalog.types.filter(function (type) {
	return type.name === "expression";
})[0];
assertTrue(expressionType && expressionType.editor && String(expressionType.editor.file).indexOf("expression.html") !== -1,
	"catalog did not expose type editor resources");
assertTrue(catalog.types.some(function (type) {
	return type.name === "configOverrides" && type.editor && String(type.editor.file).indexOf("configOverrides.html") !== -1;
}), "catalog did not expose configOverrides type editor resources");
var typeListApi = JSON.parse(engine.types("{}"));
assertTrue(typeListApi.ok === true && typeListApi.types.some(function (type) {
	return type.name === "requestable";
}), "types API did not expose core property types");
var naturalFlowScriptSource = [
	"function NaturalSyntaxSmoke({ input, config, result }) {",
	"\tconst rows = [{ title: \"b\" }, { title: \"a\" }]",
	"\tconst first = json.select({ source: rows, path: \"[0].title\" })",
	"\tconst sorted = list.sort({ items: rows, by: current.title })",
	"\tconst titles = list.map({ items: sorted, select: current.title })",
	"\tconst encoded = json.stringify({ value: titles })",
	"\tresult.first = first",
	"\tresult.encoded = encoded",
	"\treturn result",
	"}",
	""
].join("\n");
var naturalValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "NaturalSyntaxSmoke",
	code: naturalFlowScriptSource
})));
assertTrue(naturalValidation.ok === true &&
	naturalValidation.definition.nodes[1].source === "local.rows" &&
	naturalValidation.definition.nodes[1].path === "[0].title" &&
	naturalValidation.definition.nodes[4].value === "{{ local.titles }}",
	"natural FlowScript syntax did not compile to the expected Flow model");
var naturalRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: naturalFlowScriptSource,
	includeTrace: false
})));
assertTrue(naturalRun.result.first === "b" && naturalRun.result.encoded === "[\"a\",\"b\"]",
	"natural FlowScript syntax did not execute correctly");
var missingInputValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "MissingInputContractSmoke",
	code: [
		"function MissingInputContractSmoke({ input, result }) {",
		"\tresult.value = input.value",
		"\treturn result",
		"}",
		""
	].join("\n")
})));
assertTrue(missingInputValidation.ok === true &&
	missingInputValidation.diagnostics.some(function (diagnostic) {
		return diagnostic.code === "FLOWSCRIPT_INPUT_NOT_DECLARED" &&
			diagnostic.missingInputs.indexOf("value") !== -1;
	}), "FlowScript input contract warning was not reported");
var declaredInputFlowScriptSource = [
	"const _flow = {",
	"\tinputs: {",
	"\t\tvalue: { type: \"string\", description: \"Input value.\", default: \"\" }",
	"\t}",
	"}",
	"",
	"function DeclaredInputContractSmoke({ input, result }) {",
	"\tresult.value = input.value",
	"\treturn result",
	"}",
	""
].join("\n");
var declaredInputValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "DeclaredInputContractSmoke",
	code: declaredInputFlowScriptSource
})));
assertTrue(declaredInputValidation.ok === true &&
	!declaredInputValidation.diagnostics.some(function (diagnostic) {
		return diagnostic.code === "FLOWSCRIPT_INPUT_NOT_DECLARED";
	}), "Declared FlowScript inputs still reported a missing contract warning");
var declaredInputSync = JSON.parse(engine.syncInputs(JSON.stringify({
	project: "SmokeProject",
	flowName: "DeclaredInputContractSmoke",
	flowQName: "SmokeProject.DeclaredInputContractSmoke",
	projectDir: String(projectDirFile.getAbsolutePath()),
	flowSource: declaredInputFlowScriptSource
})));
assertTrue(declaredInputSync.ok === true &&
	declaredInputSync.inputDefinitions.value &&
	declaredInputSync.inputDefinitions.value.type === "string",
	"syncInputs did not extract FlowScript _flow.inputs without a full Flow validation");
var configUseFlowScriptSource = [
	"function ConfigUseSmoke({ input, config, result }) {",
	"\tresult.beforeTimeout = config.http.timeout",
	"\tresult.beforeAccept = config.http.headers.Accept",
	"\tconfig.use({",
	"\t\thttp: {",
	"\t\t\ttimeout: 30000,",
	"\t\t\theaders: { Authorization: config.github.token }",
	"\t\t},",
	"\t\tthen: function () {",
	"\t\t\tresult.insideTimeout = config.http.timeout",
	"\t\t\tresult.insideAccept = config.http.headers.Accept",
	"\t\t\tresult.insideAuthorization = config.http.headers.Authorization",
	"\t\t}",
	"\t})",
	"\tresult.afterTimeout = config.http.timeout",
	"\tresult.afterAuthorization = config.http.headers.Authorization ?? \"none\"",
	"\treturn result",
	"}",
	""
].join("\n");
var configUseValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ConfigUseSmoke",
	code: configUseFlowScriptSource
})));
assertTrue(configUseValidation.ok === true &&
	configUseValidation.definition.nodes[2].block === "config.use" &&
	configUseValidation.definition.nodes[2].then.length === 3 &&
	configUseValidation.definition.nodes[2].overrides.http.headers.Authorization === "{{ config.github.token }}" &&
	configUseValidation.definition.nodes[2].http === undefined,
	"config.use FlowScript slot did not compile to the expected Flow model");
var configUseRendered = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ConfigUseSmoke",
	flowSource: configUseValidation.source
})));
assertTrue(configUseRendered.ok === true &&
	configUseRendered.code.indexOf("config.use({") !== -1 &&
	configUseRendered.code.indexOf("then: function () {") !== -1 &&
	configUseRendered.code.indexOf("Authorization: config.github.token") !== -1 &&
	configUseRendered.code.indexOf("overrides:") === -1,
	"config.use Flow model did not render back to AST-compatible FlowScript");
var configUseRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: configUseFlowScriptSource,
	config: {
		http: {
			timeout: 1000,
			headers: {
				Accept: "application/json"
			}
		},
		github: {
			token: "Bearer smoke"
		}
	},
	includeTrace: false
})));
assertTrue(configUseRun.result.beforeTimeout === 1000 &&
	configUseRun.result.beforeAccept === "application/json" &&
	configUseRun.result.insideTimeout === 30000 &&
	configUseRun.result.insideAccept === "application/json" &&
	configUseRun.result.insideAuthorization === "Bearer smoke" &&
	configUseRun.result.afterTimeout === 1000 &&
	configUseRun.result.afterAuthorization === "none",
	"config.use did not deep-merge and restore config correctly");
var helperFlowScriptSource = [
	"function normalize(txt) {",
	"\treturn lower(txt)",
	"}",
	"",
	"function HelperSyntaxSmoke({ input, config, result }) {",
	"\tvar cleaned = normalize({ txt: input.name })",
	"\tresult.cleaned = cleaned",
	"\treturn result",
	"}",
	""
].join("\n");
var helperSourceFile = new java.io.File(projectDirFile, "libs/flows/HelperSyntaxSmoke.flow.js");
helperSourceFile.getParentFile().mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(helperSourceFile, helperFlowScriptSource, "UTF-8");
var helperValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "HelperSyntaxSmoke",
	code: helperFlowScriptSource
})));
assertTrue(helperValidation.ok === true &&
	helperValidation.definition.helpers.length === 1 &&
	helperValidation.definition.helpers[0].name === "normalize" &&
	helperValidation.definition.nodes[0].block === "normalize",
	"FlowScript helper did not compile to a private helper block");
var helperRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: helperFlowScriptSource,
	input: {
		name: "NICOLAS"
	},
	includeTrace: false
})));
assertTrue(helperRun.result.cleaned === "nicolas", "FlowScript helper did not execute correctly");
var helperTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "flow",
	flowSource: helperValidation.source,
	sourceFile: String(helperSourceFile.getAbsolutePath()),
	detail: "full"
})));
var helperFolder = findChild(helperTree, "helpers");
assertTrue(helperFolder !== null, "Flow tree did not expose Helpers");
var normalizeHelper = findChild(helperFolder, "helper_normalize");
var normalizeImplementation = findChild(normalizeHelper, "implementation");
assertTrue(normalizeHelper !== null && normalizeImplementation !== null,
	"Flow tree did not expose helper implementation");
var normalizeImplementationDefinition = JSON.parse(normalizeImplementation.definition || "{}");
assertTrue(normalizeImplementationDefinition.sourceWritable === true &&
	normalizeImplementation.kind === "blockImplementation" &&
	normalizeImplementationDefinition.sourcePath === String(helperSourceFile.getAbsolutePath()) &&
	normalizeImplementationDefinition.sourceMutationPath === "helpers[0].nodes",
	"Flow helper implementation is not editable through the tree mutation path");
var helperCatalog = JSON.parse(engine.catalog(JSON.stringify({
	flowSource: helperValidation.source,
	detail: "compact",
	query: "normalize"
})));
assertTrue(helperCatalog.blocks.some(function (block) {
	return block.blockId === "normalize" && block.tags && block.tags.indexOf("helper") !== -1;
}), "Flow catalog did not expose current Flow helpers");
var customTypeSource = [
	"version: 1",
	"name: custom.note",
	"label: Custom note",
	"type: string",
	"description: Project-local smoke test type.",
	""
].join("\n");
var createdType = JSON.parse(engine.typeCreate(JSON.stringify({
	name: "custom.note",
	descriptorSource: customTypeSource
})));
assertTrue(createdType.name === "custom.note", "typeCreate did not create a project-local type");
var readType = JSON.parse(engine.typeGet(JSON.stringify({
	name: "custom.note"
})));
assertTrue(readType.descriptor.description === "Project-local smoke test type.",
	"typeGet did not return the custom type descriptor");
var resourceBlockDescriptorSource = [
	"version: 1",
	"name: resource.echo",
	"description: Resource smoke block.",
	"props: {}",
	"implementation:",
	"  runtime: rhino",
	"  file: echo.js",
	""
].join("\n");
var resourceBlockImplementationSource = [
	"(function () {",
	"\treturn {",
	"\t\trun: function () {",
	"\t\t\treturn \"ok\";",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var createdResourceBlock = JSON.parse(engine.blockCreate(JSON.stringify({
	name: "resource.echo",
	descriptorSource: resourceBlockDescriptorSource,
	implementationSource: resourceBlockImplementationSource
})));
assertTrue(createdResourceBlock.blockId === "resource.echo", "blockCreate did not prepare a resource block");
assertTrue(new java.io.File(projectDirFile, "libs/flow/blocks/resource/echo.block.js").isFile(),
	"blockCreate did not write the canonical block code file");
var createdResourceBlockGet = JSON.parse(engine.blockGet(JSON.stringify({
	name: "resource.echo",
	detail: "full"
})));
assertTrue(createdResourceBlockGet.format === "blockjs" &&
	createdResourceBlockGet.code.indexOf("Resource smoke block.") !== -1 &&
	createdResourceBlockGet.implementationSource.indexOf("return \"ok\"") !== -1,
	"blockGet did not expose canonical block code sources");
var resourceSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "Resource smoke",
	doc: false,
	hints: false
})));
assertTrue(resourceSearch.resources.some(function (resource) {
	return resource.path === "libs/flow/blocks/resource/echo.block.js";
}), "resourceSearch did not find the project block source");
var resourceGet = JSON.parse(engine.resourceGet(JSON.stringify({
	path: "libs/flow/blocks/resource/echo.block.js"
})));
assertTrue(resourceGet.hash && resourceGet.content.indexOf("return \"ok\";") !== -1,
	"resourceGet did not return content and hash");
var resourcePatch = JSON.parse(engine.resourcePatch(JSON.stringify({
	path: "libs/flow/blocks/resource/echo.block.js",
	baseHash: resourceGet.hash,
	patch: [
		"--- a/libs/flow/blocks/resource/echo.block.js",
		"+++ b/libs/flow/blocks/resource/echo.block.js",
		"@@ -13,7 +13,7 @@",
		" \t\trun: function () {",
		"-\t\t\treturn \"ok\";",
		"+\t\t\treturn \"patched ok\";",
		" \t\t}",
		" \t};",
		" }())"
	].join("\n")
})));
assertTrue(resourcePatch.ok === true && resourcePatch.changed === true && resourcePatch.validation.ok === true,
	"resourcePatch did not patch and validate the project block source");
var patchedResourceGet = JSON.parse(engine.resourceGet(JSON.stringify({
	path: "libs/flow/blocks/resource/echo.block.js"
})));
assertTrue(patchedResourceGet.content.indexOf("patched ok") !== -1,
	"resourcePatch did not persist the patched source");
var legacyCatalogBlock = JSON.parse(engine.blockCreate(JSON.stringify({
	name: "resource.legacyCatalog",
	descriptor: {
		version: 1,
		name: "resource.legacyCatalog",
		implementation: {
			runtime: "rhino",
			file: "legacyCatalog.js"
		}
	},
	implementationSource: [
		"(function () {",
		"\treturn {",
		"\t\tcatalog: function () { return {}; },",
		"\t\trun: function () { return \"legacy\"; }",
		"\t};",
		"}())"
	].join("\n")
})));
assertTrue(legacyCatalogBlock.ok === false &&
	legacyCatalogBlock.error &&
	legacyCatalogBlock.error.code === "INVALID_BLOCK_IMPLEMENTATION",
	"blockCreate accepted a legacy catalog() implementation");
var resourceGetRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: readResource",
		"    block: resource.get",
		"    path: libs/flow/blocks/resource/echo.block.js",
		"    out: result.resource",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(resourceGetRun.result.resource.content.indexOf("patched ok") !== -1,
	"resource.get block did not read project Flow resources");
var resourceSearchRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: searchResource",
		"    block: resource.search",
		"    query: patched ok",
		"    doc: false",
		"    hints: false",
		"    out: result.search",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(resourceSearchRun.result.search.resources.some(function (resource) {
	return resource.path === "libs/flow/blocks/resource/echo.block.js";
}), "resource.search block did not find project Flow resources");
var docsDir = new java.io.File(projectDirFile, "libs/flow/resources/guide");
docsDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(docsDir, "start.md"), "# Start\n\nFlow documentation resource.", "UTF-8");
var docResourceSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "documentation resource",
	doc: false,
	hints: false
})));
assertTrue(docResourceSearch.resources.some(function (resource) {
	return resource.path === "libs/flow/resources/guide/start.md";
}), "resourceSearch did not include project Flow documentation resources");
var docResourceGet = JSON.parse(engine.resourceGet(JSON.stringify({
	path: "libs/flow/resources/guide/start.md"
})));
assertTrue(docResourceGet.content.indexOf("Flow documentation resource.") !== -1,
	"resourceGet did not read project Flow documentation resources");
var canonicalBlockJs = [
	"const _meta = {",
	"\t\"version\": 1,",
	"\t\"icon\": \"mdi:puzzle-outline\",",
	"\t\"description\": \"Canonical FlowScript descriptor backed by Rhino.\",",
	"\t\"properties\": {",
	"\t\t\"value\": {",
	"\t\t\t\"kind\": \"value\",",
	"\t\t\t\"type\": \"unknown\",",
	"\t\t\t\"description\": \"Value returned by the block.\"",
	"\t\t},",
	"\t\t\"out\": {",
	"\t\t\t\"kind\": \"path\",",
	"\t\t\t\"mode\": \"write\",",
	"\t\t\t\"description\": \"Scope path receiving the value.\"",
	"\t\t}",
	"\t},",
	"\t\"runtime\": \"rhino\",",
	"\t\"hooks\": {",
	"\t\t\"file\": \"echo.hooks.js\"",
	"\t}",
	"}",
	"",
	"(function () {",
	"\treturn {",
	"\t\trun: function (ctx, node) {",
	"\t\t\tvar props = ctx.props(node);",
	"\t\t\tvar value = ctx.template(props.value);",
	"\t\t\tctx.write(props.out || \"result.value\", value);",
	"\t\t\treturn value;",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var canonicalHooksJs = [
	"(function () {",
	"\treturn {",
	"\t\tdisplayName: function (node) {",
	"\t\t\tvar props = node.props || node;",
	"\t\t\treturn \"canonical -> \" + (props.out || \"result.value\");",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var canonicalBlocksDir = new java.io.File(projectDirFile, "libs/flow/blocks");
var canonicalDir = new java.io.File(canonicalBlocksDir, "canonical");
canonicalDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(canonicalDir, "echo.block.js"), canonicalBlockJs, "UTF-8");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(canonicalDir, "echo.hooks.js"), canonicalHooksJs, "UTF-8");
var canonicalCatalog = JSON.parse(engine.catalog(JSON.stringify({ detail: "compact" })));
var canonicalBlock = null;
canonicalCatalog.blocks.forEach(function (block) {
	if (block.blockId === "canonical.echo") {
		canonicalBlock = block;
	}
});
var canonicalProps = canonicalBlock ? canonicalBlock.props || canonicalBlock.properties || {} : {};
assertTrue(canonicalBlock && canonicalBlock.implementation === "rhino" &&
	canonicalProps.value && canonicalProps.value.kind === "value",
	"catalog did not expose canonical FlowScript metadata for a Rhino block");
var canonicalRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: echo",
		"    block: canonical.echo",
		"    value: Hello canonical",
		"    out: result.message",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(canonicalRun.result.message === "Hello canonical",
	"canonical FlowScript Rhino block did not execute through its implementation body");
var flowBackedCodeSource = [
	"const _meta = {",
	"\t\"description\": \"FlowScript block backed by Flow nodes.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"value\": {",
	"\t\t\t\"kind\": \"value\",",
	"\t\t\t\"type\": \"unknown\"",
	"\t\t}",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"unknown\"",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function flowBacked({ input, config, result }) {",
	"\treturn input.value",
	"}",
	""
].join("\n");
var createdFlowBackedBlock = JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.flowBacked",
	code: flowBackedCodeSource
})));
assertTrue(createdFlowBackedBlock.ok === true &&
	createdFlowBackedBlock.block && createdFlowBackedBlock.block.blockId === "smoke.flowBacked" &&
	new java.io.File(projectDirFile, "libs/flow/blocks/smoke/flowBacked.block.js").isFile(),
	"blockCreate did not write the canonical FlowScript block code file");
var missingBlockInputSource = [
	"const _meta = {",
	"\t\"description\": \"FlowScript block with an intentionally missing property declaration.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"unknown\"",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function missingBlockInput({ input, config, result }) {",
	"\treturn input.value",
	"}",
	""
].join("\n");
var missingBlockInputSet = JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.missingBlockInput",
	code: missingBlockInputSource
})));
assertTrue(missingBlockInputSet.ok === true &&
	missingBlockInputSet.warnings.some(function (warning) {
		return warning.code === "FLOW_BLOCK_INPUT_NOT_DECLARED" &&
			warning.missingInputs.indexOf("value") !== -1;
	}), "FlowScript block input property warning was not reported");
var flowBackedBlockGet = JSON.parse(engine.blockGet(JSON.stringify({
	name: "smoke.flowBacked",
	detail: "full"
})));
assertTrue(flowBackedBlockGet.implementationRuntime === "flow" &&
	flowBackedBlockGet.format === "flowscript" &&
	flowBackedBlockGet.code.indexOf("function flowBacked") !== -1 &&
	flowBackedBlockGet.implementationSource.indexOf("block: \"return\"") !== -1,
	"blockGet did not expose Flow implementation source");
var flowBackedRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: flowBacked",
		"    block: smoke.flowBacked",
		"    value: Hello flow backed block",
		"    out: result.message",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(flowBackedRun.result.message === "Hello flow backed block",
	"canonical YAML Flow block did not execute through its implementation file");
var innerLeakCodeSource = [
	"const _meta = {",
	"\t\"description\": \"Inner Flow block whose result scope must stay private to the block.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"value\": { \"kind\": \"value\", \"type\": \"string\" }",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"object\",",
	"\t\t\t\"properties\": {",
	"\t\t\t\t\"body\": { \"type\": \"string\" },",
	"\t\t\t\t\"count\": { \"type\": \"boolean\" }",
	"\t\t\t}",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function innerLeak({ input, result }) {",
	"\tresult.body = input.value",
	"\tresult.count = true",
	"\treturn result",
	"}",
	""
].join("\n");
var outerLeakCodeSource = [
	"const _meta = {",
	"\t\"description\": \"Outer Flow block exposing only its own declared result.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"value\": { \"kind\": \"value\", \"type\": \"string\" }",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"object\",",
	"\t\t\t\"properties\": {",
	"\t\t\t\t\"count\": { \"type\": \"integer\" },",
	"\t\t\t\t\"message\": { \"type\": \"string\" },",
	"\t\t\t\t\"type\": { \"type\": \"string\" }",
	"\t\t\t}",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function outerLeak({ input, result }) {",
	"\tvar raw = smoke.innerLeak({ value: input.value })",
	"\tresult.count = 1",
	"\tresult.message = raw.body",
	"\tresult.type = { nested: raw.body }",
	"\treturn result",
	"}",
	""
].join("\n");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.innerLeak",
	code: innerLeakCodeSource
}))).ok === true, "blockCodeSet did not create innerLeak");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.outerLeak",
	code: outerLeakCodeSource
}))).ok === true, "blockCodeSet did not create outerLeak");
var compositeSchema = JSON.parse(engine.outputSchema(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: outer",
		"    block: smoke.outerLeak",
		"    value: Hello isolated schema",
		"    out: local.outer",
		"  - id: count",
		"    block: set",
		"    path: result.count",
		"    value: \"{{ local.outer.count }}\"",
		"  - id: message",
		"    block: set",
		"    path: result.message",
		"    value: \"{{ local.outer.message }}\"",
		"  - id: type",
		"    block: set",
		"    path: result.type",
		"    value: \"{{ local.outer.type }}\"",
		""
	].join("\n"),
	detail: "full"
})));
var compositeProps = compositeSchema.schema && compositeSchema.schema.properties || {};
assertTrue(compositeProps.count && compositeProps.count.type === "integer" &&
	compositeProps.message && compositeProps.message.type === "string" &&
	compositeProps.type && compositeProps.type.type === "string" &&
	compositeProps.body === undefined,
	"composite Flow block analysis leaked internal result fields into the caller output schema");
var expressionEchoCodeSource = [
	"const _meta = {",
	"\t\"description\": \"Echoes an expression payload without templating nested strings.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"payload\": {",
	"\t\t\t\"kind\": \"expression\",",
	"\t\t\t\"type\": \"object\"",
	"\t\t}",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"object\"",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function expressionEcho({ input, config, result }) {",
	"\treturn input.payload",
	"}",
	""
].join("\n");
var expressionEchoSet = JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.expressionEcho",
	code: expressionEchoCodeSource
})));
assertTrue(expressionEchoSet.ok === true, "blockCodeSet did not create expressionEcho");
var expressionEchoRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: echoExpressionObject",
		"    block: smoke.expressionEcho",
		"    payload:",
		"      flowSource: \"value: {{ local.person.age }}\"",
		"    out: result.payload",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(expressionEchoRun.result.payload.flowSource === "value: {{ local.person.age }}",
	"Flow graph block expression object rendered nested template strings too early");
var callBlockDescriptorSource = [
	"version: 1",
	"name: smoke.callBlock",
	"description: Calls core blocks as capabilities.",
	"props:",
		"  message:",
		"    kind: template",
		"    type: string",
	"  out:",
	"    kind: path",
	"    mode: write",
	"implementation:",
	"  runtime: rhino",
	"  file: callBlock.js",
	""
].join("\n");
var callBlockImplementationSource = [
	"(function () {",
	"\treturn {",
	"\t\trun: function (ctx, node) {",
	"\t\t\tvar props = ctx.props(node);",
			"\t\t\tvar value = ctx.callBlock(\"set\", { path: \"local.called\", value: ctx.template(props.message) }, { trace: false });",
	"\t\t\tvar returned = ctx.callBlock(\"return\", { value: \"still-running\" }, { trace: false });",
	"\t\t\tctx.callBlock(\"set\", { path: \"local.afterReturn\", value: \"still-running\" }, { trace: false });",
	"\t\t\treturn { value: value, returned: returned, afterReturn: ctx.read(\"local.afterReturn\"), out: props.out || \"\" };",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var createdCallBlock = JSON.parse(engine.blockCreate(JSON.stringify({
	name: "smoke.callBlock",
	descriptorSource: callBlockDescriptorSource,
	implementationSource: callBlockImplementationSource
})));
assertTrue(createdCallBlock.blockId === "smoke.callBlock", "blockCreate did not create the callBlock smoke block");
var callBlockRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: callSmoke",
		"    block: smoke.callBlock",
		"    message: \"{{ input.name }}\"",
		"    out: result.call",
		""
	].join("\n"),
	input: {
		name: "Ada"
	},
	includeTrace: false
})));
assertTrue(callBlockRun.result.call.value === "Ada" &&
	callBlockRun.result.call.returned === "still-running" &&
	callBlockRun.result.call.afterReturn === undefined,
	"ctx.callBlock did not isolate props/local/return state");
var libDir = new java.io.File(projectDirFile, "libs/flow/lib");
libDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(libDir, "smoke.js"), [
	"(function () {",
	"\treturn {",
	"\t\tdecorate: function (value) {",
	"\t\t\treturn String(value || \"\") + \" from lib\";",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n"), "UTF-8");
var libBackedBlockDescriptorSource = [
	"version: 1",
	"name: smoke.lib",
	"description: Uses a project Flow library.",
	"props:",
	"  value:",
	"    kind: expression",
	"    type: string",
	"  out:",
	"    kind: path",
	"    mode: write",
	"implementation:",
	"  runtime: rhino",
	"  file: lib.js",
	""
].join("\n");
var libBackedBlockImplementationSource = [
	"(function () {",
	"\treturn {",
	"\t\trun: function (ctx, node) {",
	"\t\t\tvar props = ctx.props(node);",
	"\t\t\treturn ctx.lib(\"smoke\").decorate(ctx.expr(props.value || \"input.name\"));",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var createdLibBlock = JSON.parse(engine.blockCreate(JSON.stringify({
	name: "smoke.lib",
	descriptorSource: libBackedBlockDescriptorSource,
	implementationSource: libBackedBlockImplementationSource
})));
assertTrue(createdLibBlock.blockId === "smoke.lib", "blockCreate did not create a library-backed block");
var flowDir = new java.io.File(projectDirFile, "libs/flows");
flowDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(flowDir, "ChildSmoke.flow.js"), [
	"function ChildSmoke({ input, config, result }) {",
	"\tresult.message = smoke.lib({ id: \"decorate\", value: input.name })",
	"\treturn result",
	"}",
	""
].join("\n"), "UTF-8");
var flowCallRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: child",
		"    block: flow.call",
		"    flow: ChildSmoke",
		"    input:",
		"      name: input.name",
		"    out: result.child",
		""
	].join("\n"),
	input: {
		name: "Hello"
	}
})));
assertTrue(flowCallRun.result.child.message === "Hello from lib",
	"flow.call did not execute a child Flow sidecar with project library support");
var fragmentDir = new java.io.File(projectDirFile, "libs/flow/fragments");
fragmentDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(fragmentDir, "DecorateMessage.fragment.yaml"), [
	"version: 1",
	"nodes:",
	"  - id: fragmentDecorate",
	"    block: smoke.lib",
	"    value: input.name",
	"    out: result.fragmentMessage",
	""
].join("\n"), "UTF-8");
var fragmentFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: useDecorate",
	"    block: fragment.use",
	"    fragment: DecorateMessage",
	""
].join("\n");
var fragmentRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: fragmentFlowSource,
	input: {
		name: "Hello"
	}
})));
assertTrue(fragmentRun.result.fragmentMessage === "Hello from lib",
	"fragment.use did not execute project fragment nodes inline");
var fragmentAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: fragmentFlowSource })));
assertTrue(fragmentAnalysis.writes.indexOf("result.fragmentMessage") !== -1,
	"Flow analysis did not see writes produced inside fragment.use");
var fragmentTree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", flowSource: fragmentFlowSource })));
assertTrue(fragmentTree.children[0].children[0].type === "fragment.use" &&
	fragmentTree.children[0].children[0].children[0].type === "smoke.lib",
	"describeTree(flow) did not expand fragment.use children");
var fragmentContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: fragmentFlowSource,
	node: "fragmentDecorate",
	include: ["input"],
	detail: "compact"
})));
assertTrue(fragmentContext.ok === true && fragmentContext.path === "nodes[0].nodes[0]",
	"Flow context did not find nodes expanded from fragment.use");
var resourceLibSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "decorate",
	doc: false,
	hints: false
})));
assertTrue(resourceLibSearch.resources.some(function (resource) {
	return resource.path === "libs/flow/lib/smoke.js";
}), "resourceSearch did not include project Flow libraries");
assertTrue(resourceLibSearch.resources.some(function (resource) {
	return resource.path === "libs/flow/fragments/DecorateMessage.fragment.yaml";
}), "resourceSearch did not include project Flow fragments");
var propertyEditor = JSON.parse(engine.propertyEditor("{}"));
var propertyEditorCompactHtml = propertyEditor.html.replace(/\s+/g, "");
assertTrue(propertyEditor.ok === true && propertyEditor.html.indexOf("receiveFromJava") !== -1,
	"propertyEditor did not expose the web editor host");
assertTrue(propertyEditor.html.indexOf("flow-requestable-editor") !== -1 &&
	propertyEditor.html.indexOf("relativeQName(qname, currentProject)") !== -1,
	"propertyEditor did not embed standalone requestable editor");
assertTrue(propertyEditor.html.indexOf("flow-path-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-template-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-value-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-expression-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-literal-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-text-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-config-overrides-editor") !== -1,
	"propertyEditor did not embed core standalone editors");
assertTrue(propertyEditorCompactHtml.indexOf("hostRequest(name,payload)") !== -1 &&
	propertyEditorCompactHtml.indexOf("typeEditorTag(kind)") !== -1,
	"propertyEditor did not expose generic type editor host API");
assertTrue(propertyEditorCompactHtml.indexOf("enrichRequestPayload(name,payload)") !== -1 &&
	propertyEditorCompactHtml.indexOf("activeRequestProperty()") !== -1 &&
	propertyEditorCompactHtml.indexOf("flowNodePath(state.virtualPath)") !== -1,
	"propertyEditor did not pass the selected property and node path to embedded editor context requests");
assertTrue(propertyEditorCompactHtml.indexOf("typeEditorState(source)") !== -1 &&
	propertyEditorCompactHtml.indexOf("editor.setState(typeEditorState(state))") !== -1 &&
	propertyEditorCompactHtml.indexOf("editor.setState(typeEditorState(pickerEditorState(prop)))") !== -1,
	"propertyEditor did not refresh embedded editor context before setting webcomponent state");
assertTrue(propertyEditorCompactHtml.indexOf("stateDefinition()") !== -1 &&
	propertyEditorCompactHtml.indexOf("itemCurrentContext(next.context,next)") !== -1,
	"propertyEditor did not normalize string definitions or derive item current context for picker editors");
assertTrue(propertyEditor.html.indexOf("data-picker-property-button") !== -1 &&
	propertyEditor.html.indexOf("data-picker-editor") !== -1 &&
	propertyEditor.html.indexOf("data-apply-picked") !== -1 &&
	propertyEditor.html.indexOf("data-cancel-picked") !== -1,
	"propertyEditor did not expose picker target property apply actions");
assertTrue(propertyEditorCompactHtml.indexOf("target&&hasTypeEditor(pickerKind(target))") !== -1 &&
	propertyEditor.html.indexOf("pickerUpdatingEditor") !== -1,
	"propertyEditor did not route picker properties through standalone type editors");
assertTrue(propertyEditor.html.indexOf("details.scopeGroup") !== -1 &&
	propertyEditor.html.indexOf("acceptsPath(propertyDefinition, entry)") !== -1,
	"template/value editors did not expose collapsible filtered picker groups");
assertTrue(propertyEditor.html.indexOf("syncSimpleExpression") !== -1 &&
	propertyEditor.html.indexOf("pathMatches(value, context)") !== -1 &&
	propertyEditor.html.indexOf("replaceSimpleSelection(path)") !== -1 &&
	propertyEditor.html.indexOf("data-action=\"nullish\"") !== -1 &&
	propertyEditorCompactHtml.indexOf("insertNullishFallback()") !== -1 &&
	propertyEditor.html.indexOf("data-simple=\"expression\"") !== -1 &&
	propertyEditor.html.indexOf("path.imported") !== -1,
	"expression editor did not expose segmented Simple editing with imported path highlights");
assertTrue(propertyEditor.html.indexOf("data-picker-format") === -1,
	"propertyEditor still exposes the confusing path/template picker format selector");
print(engine.analyze(JSON.stringify({ flowSource: flowSource })));
var describedFlowTree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", flowSource: flowSource })));
print(JSON.stringify(describedFlowTree));
assertTrue(describedFlowTree.children[0].name === "flow" &&
	describedFlowTree.children[0].children[2].type === "forEach",
	"describeTree(flow) did not expose flow nodes");
assertTrue(describedFlowTree.children[0].children[0].summary === "[set] local.items = [\"Paris\",\"Lyon\"]",
	"describeTree(flow) did not expose data-centric display names");
var simpleLoopContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: flowSource,
	node: "pushCurrent",
	include: ["current"],
	detail: "normal"
})));
print(JSON.stringify(simpleLoopContext));
assertTrue(simpleLoopContext.ok === true &&
	simpleLoopContext.scopes.current.paths.length === 1 &&
	simpleLoopContext.scopes.current.paths[0].path === "current" &&
	simpleLoopContext.scopes.current.paths[0].type === "string",
	"Flow context did not infer current type from a static array set before forEach");
var simpleOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: flowSource })));
assertTrue(simpleOutputSchema.schema.properties.cities.type === "array" &&
	simpleOutputSchema.schema.properties.cities.items.type === "string",
	"Flow output schema did not infer pushed array item type from current");
var pickerArrayFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: initPeople",
	"    block: set",
	"    path: local.people",
	"    value:",
	"      - name: Ada",
	"        age: 36",
	"        city: Paris",
	"      - name: Grace",
	"        age: 40",
	"        city: London",
	"  - id: filterAdults",
	"    block: list.filter",
	"    items: local.people",
	"    where: current.age >= 18",
	"    out: local.adults",
	""
].join("\n");
var pickerArrayContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: pickerArrayFlowSource,
	node: "filterAdults",
	include: ["local"],
	detail: "normal"
})));
assertTrue(pickerArrayContext.scopes.local.paths.some(function (entry) {
	return entry.path === "local.people[0].name" && entry.type === "string";
}), "Flow context did not expose object item fields below an array with bracket notation");
assertTrue(!pickerArrayContext.scopes.local.paths.some(function (entry) {
	return entry.path === "local.people.name" || entry.path === "local.people.[0].name";
}), "Flow context exposed an impossible or malformed field path below an array");
var pickerArrayCurrentContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: pickerArrayFlowSource,
	path: "nodes[1]",
	property: "where",
	include: ["current"],
	detail: "normal"
})));
assertTrue(pickerArrayCurrentContext.scopes.current.paths.some(function (entry) {
	return entry.path === "current.age" && entry.type === "integer";
}) && pickerArrayCurrentContext.scopes.current.paths.some(function (entry) {
	return entry.path === "current.name" && entry.type === "string";
}), "Flow context did not expose current item fields for an item-scoped expression property");
var mutatedFlow = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "flow",
	flowSource: flowSource,
	mutation: {
		op: "insert",
		path: "/nodes",
		index: 4,
		value: {
			id: "setMutationFlag",
			block: "set",
			path: "result.mutated",
			value: true
		}
	}
})));
print(JSON.stringify(mutatedFlow));
assertTrue(mutatedFlow.ok === true && mutatedFlow.analysis.writes.indexOf("result.mutated") !== -1,
	"applyMutation(flow) did not append and analyze a node");
var mutatedFlowRun = JSON.parse(engine.run(JSON.stringify({ flowSource: mutatedFlow.source })));
assertTrue(mutatedFlowRun.result.mutated === true, "Mutated flow source did not execute");
var semanticMutatedFlow = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "flow",
	flowSource: flowSource,
	mutation: {
		op: "replace",
		nodeId: "setMessage",
		property: "value",
		value: "Hello semantic mutation"
	}
})));
print(JSON.stringify(semanticMutatedFlow));
var semanticMutatedRun = JSON.parse(engine.run(JSON.stringify({ flowSource: semanticMutatedFlow.source })));
assertTrue(semanticMutatedRun.result.message === "Hello semantic mutation",
	"applyMutation(flow) did not replace a node property by nodeId");
var semanticInsertedFlow = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "flow",
	flowSource: flowSource,
	mutation: {
		op: "insert",
		afterNodeId: "setMessage",
		value: {
			id: "setAfterMessage",
			block: "set",
			path: "result.afterMessage",
			value: "after"
		}
	}
})));
print(JSON.stringify(semanticInsertedFlow));
assertTrue(semanticInsertedFlow.ok === true &&
	semanticInsertedFlow.analysis.writes.indexOf("result.afterMessage") !== -1,
	"applyMutation(flow) did not insert a node after nodeId");
print(engine.run(JSON.stringify({ flowSource: flowSource })));
var staticSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceItems",
	"    block: set",
	"    path: local.items",
	"    value:",
	"      - city: Paris",
	"        temperature: 36",
	"  - id: copyItems",
	"    block: set",
	"    path: result.items",
	"    value: \"{{ local.items }}\"",
	""
].join("\n");
var staticOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: staticSchemaFlowSource })));
assertTrue(staticOutputSchema.schema.properties.items.type === "array" &&
	staticOutputSchema.schema.properties.items.items.properties.city.type === "string" &&
	staticOutputSchema.schema.properties.items.items.properties.temperature.type === "integer",
	"outputSchema did not derive result from static dataflow analysis");
var staticOutputSchemaFull = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: staticSchemaFlowSource, detail: "full" })));
assertTrue(staticOutputSchemaFull.sources.static.available === true &&
	staticOutputSchemaFull.sources.effective.schema.properties.items.items.properties.city.type === "string",
	"outputSchema detail full did not expose static/effective sources");
var schemaChoiceFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: parsePayload",
	"    block: json.safeParse",
	"    text: \"{{ input.raw }}\"",
	"    out: local.parsed",
	"  - id: copyValue",
	"    block: set",
	"    path: result.value",
	"    value: \"{{ local.parsed.value }}\"",
	"  - id: count",
	"    block: set",
	"    path: result.count",
	"    value: true",
	"  - id: tags",
	"    block: set",
	"    path: result.tags",
	"    value:",
	"      - stable",
	""
].join("\n");
var schemaChoiceDir = new java.io.File(projectDirFile, "libs/flow/schemas/SchemaChoiceSmoke");
schemaChoiceDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(schemaChoiceDir, "result.out.schema.json"), JSON.stringify({
	type: "object",
	properties: {
		value: {
			type: "object",
			properties: {
				name: { type: "string" },
				city: { type: "string" },
				age: { type: "integer" }
			}
		},
		count: { type: "integer" },
		tags: {
			type: "array",
			items: { type: "unknown" }
		}
	}
}, null, 2), "UTF-8");
var schemaChoiceOutput = JSON.parse(engine.outputSchema(JSON.stringify({
	flowName: "SchemaChoiceSmoke",
	flowSource: schemaChoiceFlowSource,
	detail: "full"
})));
assertTrue(schemaChoiceOutput.source === "learned" &&
	schemaChoiceOutput.schema.properties.value.properties.name.type === "string" &&
	schemaChoiceOutput.schema.properties.count.type === "integer" &&
	schemaChoiceOutput.schema.properties.tags.items.type === "string" &&
	schemaChoiceOutput.sources.static.summary.leafPaths.some(function (entry) {
		return entry.path === "value" && entry.type === "unknown";
	}),
	"outputSchema effective selection did not prefer learned schema and fill unknown paths from static");
var nodeOutputSchema = JSON.parse(engine.nodeOutputSchema(JSON.stringify({
	flowSource: staticSchemaFlowSource,
	nodeId: "sourceItems",
	detail: "full"
})));
assertTrue(nodeOutputSchema.target.property === "path" &&
	nodeOutputSchema.target.path === "local.items" &&
	nodeOutputSchema.schema.type === "array" &&
	nodeOutputSchema.schema.items.properties.city.type === "string",
	"nodeOutputSchema did not expose the node static output schema");
var duplicateNodePointerSchemaSource = [
	"version: 1",
	"nodes:",
	"  - id: duplicated",
	"    block: set",
	"    path: local.first",
	"    value: first",
	"  - id: duplicated",
	"    block: set",
	"    path: local.second",
	"    value:",
	"      name: Ada",
	""
].join("\n");
var nodePointerOutputSchema = JSON.parse(engine.nodeOutputSchema(JSON.stringify({
	flowSource: duplicateNodePointerSchemaSource,
	nodePointer: "/nodes/1",
	detail: "full"
})));
assertTrue(nodePointerOutputSchema.target.path === "local.second" &&
	nodePointerOutputSchema.schema.properties.name.type === "string",
	"nodeOutputSchema did not target an ambiguous node by pointer");
var adoptedNodeOutputSchema = JSON.parse(engine.nodeOutputSchema(JSON.stringify({
	flowName: "NodeSchemaAdoptSmoke",
	flowSource: staticSchemaFlowSource,
	nodeId: "sourceItems",
	action: "adopt",
	schema: {
		type: "array",
		items: {
			type: "object",
			properties: {
				city: { type: "string" },
				temperature: { type: "number" },
				source: { type: "string" }
			}
		}
	}
})));
assertTrue(adoptedNodeOutputSchema.action === "adopt" &&
	adoptedNodeOutputSchema.source === "schema" &&
	adoptedNodeOutputSchema.written.file.indexOf("NodeSchemaAdoptSmoke") !== -1,
	"nodeOutputSchema did not adopt a manual node schema");
var learnedNodeOutputSchema = JSON.parse(engine.nodeOutputSchema(JSON.stringify({
	flowName: "NodeSchemaAdoptSmoke",
	flowSource: staticSchemaFlowSource,
	nodeId: "sourceItems",
	source: "learned",
	detail: "full"
})));
assertTrue(learnedNodeOutputSchema.source === "learned" &&
	learnedNodeOutputSchema.schema.items.properties.source.type === "string" &&
	learnedNodeOutputSchema.sources.learned.available === true,
	"nodeOutputSchema did not read the adopted node schema as learned");
var removedNodeOutputSchema = JSON.parse(engine.nodeOutputSchema(JSON.stringify({
	flowName: "NodeSchemaAdoptSmoke",
	flowSource: staticSchemaFlowSource,
	nodeId: "sourceItems",
	action: "remove"
})));
assertTrue(removedNodeOutputSchema.action === "remove" &&
	removedNodeOutputSchema.deleted === true,
	"nodeOutputSchema did not remove the adopted node schema");
var removedLearnedNodeOutputSchema = JSON.parse(engine.nodeOutputSchema(JSON.stringify({
	flowName: "NodeSchemaAdoptSmoke",
	flowSource: staticSchemaFlowSource,
	nodeId: "sourceItems",
	source: "learned",
	detail: "full"
})));
assertTrue(removedLearnedNodeOutputSchema.sources.learned.available === false,
	"nodeOutputSchema still exposed a learned schema after remove");
var declaredFlowScriptOutputSource = [
	"const _flow = {",
	"  outputs: {",
	"    message: { type: \"string\" },",
	"    count: { type: \"integer\" }",
	"  }",
	"}",
	"",
	"function DeclaredOutput({ input, config, result }) {",
	"  result.message = 42",
	"  result.extra = true",
	"  return result",
	"}",
	""
].join("\n");
var declaredFlowScriptOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({
	flowSource: declaredFlowScriptOutputSource
})));
assertTrue(declaredFlowScriptOutputSchema.source === "declared" &&
	declaredFlowScriptOutputSchema.declared === true &&
	declaredFlowScriptOutputSchema.schema.properties.message.type === "string" &&
	declaredFlowScriptOutputSchema.schema.properties.count.type === "integer" &&
	declaredFlowScriptOutputSchema.schema.properties.extra === undefined,
	"_flow.outputs was not used as the explicit result schema contract");
var declaredFlowScriptOutputSchemaFull = JSON.parse(engine.outputSchema(JSON.stringify({
	flowSource: declaredFlowScriptOutputSource,
	detail: "full"
})));
assertTrue(declaredFlowScriptOutputSchemaFull.sources.declared.available === true &&
	declaredFlowScriptOutputSchemaFull.sources.static.available === true &&
	declaredFlowScriptOutputSchemaFull.warnings.some(function (warning) {
		return warning.code === "DECLARED_SCHEMA_MISSING_PATHS" && warning.paths.indexOf("extra") !== -1;
	}),
	"outputSchema detail full did not warn about an incomplete declared contract");
var explicitReturnSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceItems",
	"    block: set",
	"    path: local.items",
	"    value:",
	"      - city: Paris",
	"        temperature: 36",
	"  - id: done",
	"    block: return",
	"    value: \"{{ local.items }}\"",
	""
].join("\n");
var explicitReturnSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: explicitReturnSchemaFlowSource })));
assertTrue(explicitReturnSchema.schema.type === "array" &&
	explicitReturnSchema.schema.items.properties.city.type === "string",
	"outputSchema did not derive explicit return schema from static dataflow analysis");
var learnedRun = JSON.parse(engine.run(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource })));
var learnedSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource })));
assertTrue(learnedRun.result.message === "Hello Flow", "Named flow did not execute for schema learning");
assertTrue(learnedSchema.schema.properties.cities.type === "array" &&
	learnedSchema.schema.properties.message.type === "string",
	"outputSchema did not expose the learned Flow result structure");

var implicitReturnFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: implicit result",
	""
].join("\n");
var implicitReturnRun = JSON.parse(engine.run(JSON.stringify({ flowSource: implicitReturnFlowSource })));
print(JSON.stringify(implicitReturnRun));
assertTrue(implicitReturnRun.result.message === "implicit result", "Flow did not return result implicitly");

var templatedValueFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: \"Hello {{ input.append }}\"",
	""
].join("\n");
var templatedValueRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: templatedValueFlowSource,
	input: {
		append: "Flow"
	}
})));
print(JSON.stringify(templatedValueRun));
assertTrue(templatedValueRun.result.message === "Hello Flow", "Flow did not template string literal values");

var explicitReturnFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: before",
	"    block: set",
	"    path: result.message",
	"    value: before return",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result }}\"",
	"  - id: after",
	"    block: set",
	"    path: result.message",
	"    value: after return",
	""
].join("\n");
var explicitReturnRun = JSON.parse(engine.run(JSON.stringify({ flowSource: explicitReturnFlowSource })));
print(JSON.stringify(explicitReturnRun));
assertTrue(explicitReturnRun.result.message === "before return", "Flow did not stop after return");

var throwFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fail",
	"    block: throw",
	"    code: WEATHER_ALERT_ERROR",
	"    status: 422",
	"    message: Weather alert failed",
	"    details:",
	"      reason: threshold missing",
	""
].join("\n");
var throwRun = JSON.parse(engine.run(JSON.stringify({ flowSource: throwFlowSource })));
print(JSON.stringify(throwRun));
assertTrue(throwRun.ok === false && throwRun.error.code === "WEATHER_ALERT_ERROR",
	"Flow throw did not produce a structured error");

var fixtureUrl = new java.io.File(new java.io.File(engineDir).getParentFile().getParentFile(), "fixtures/weather-alert.json").toURI().toURL().toString();
var weatherUrl = new java.lang.String(fixtureUrl);
var apiKey = new java.lang.String("demo-key");
var threshold = new java.lang.String("35");
var weatherFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fetchWeather",
	"    block: http.get",
	"    url: \"{{ config.weatherUrl }}\"",
	"    headers:",
	"      X-Api-Key: \"{{ config.apiKey }}\"",
	"    out: local.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: local.weather",
	"    path: body.metropoles",
	"    out: local.metropoles",
	"  - id: initHotCities",
	"    block: set",
	"    path: result.hotCities",
	"    value: []",
	"  - id: eachCity",
	"    block: forEach",
	"    items: local.metropoles",
	"    nodes:",
	"      - id: keepHotCity",
	"        block: if",
	"        condition: current.temperature >= config.threshold",
	"        then:",
	"          - id: pushHotCity",
	"            block: json.push",
	"            path: result.hotCities",
	"            value: \"{{ current.city }}\"",
	"  - id: notify",
	"    block: email.mock",
	"    to: ops@example.com",
	"    subject: Weather alert",
	"    body: \"Hot cities over {{ config.threshold }}C: {{ result.hotCities }}\"",
	"    out: result.notification",
	"  - id: message",
	"    block: set",
	"    path: result.message",
	"    value: Weather alert computed",
	"  - id: done",
	"    block: return",
	"    value: \"{{ result }}\"",
	""
].join("\n");
print(engine.analyze(JSON.stringify({ flowSource: weatherFlowSource })));
var notifyContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "notify",
	property: "body",
	include: ["local", "result"],
	detail: "normal"
})));
print(JSON.stringify(notifyContext));
assertTrue(notifyContext.ok === true &&
	notifyContext.scopes.local.paths.some(function (entry) { return entry.path === "local.metropoles"; }) &&
	notifyContext.scopes.result.paths.some(function (entry) { return entry.path === "result.hotCities"; }) &&
	!notifyContext.scopes.result.paths.some(function (entry) { return entry.path === "result.message"; }),
	"Flow context did not expose only paths available before notify");

var keepHotCityContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "keepHotCity",
	property: "condition",
	include: ["current"],
	detail: "normal"
})));
print(JSON.stringify(keepHotCityContext));
assertTrue(keepHotCityContext.ok === true &&
	keepHotCityContext.scopes.current.paths.length === 1 &&
	keepHotCityContext.scopes.current.paths[0].producer &&
	keepHotCityContext.scopes.current.paths[0].producer.path === "local.metropoles",
	"Flow context did not expose current source inside forEach");

var compactContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "notify",
	include: ["local"],
	detail: "compact"
})));
print(JSON.stringify(compactContext));
assertTrue(Object.keys(compactContext.scopes).join(",") === "local" &&
	compactContext.scopes.local.indexOf("local.weather") !== -1,
	"Flow compact context did not filter scopes");
print(engine.run(JSON.stringify({ flowSource: weatherFlowSource })));
print(engine.run(JSON.stringify({
	flowSource: weatherFlowSource,
	config: {
		weatherUrl: fixtureUrl,
		apiKey: "demo-key",
		threshold: 35
	}
})));
var schemaFlowName = "WeatherSchemaLearn";
var schemaFile = new java.io.File(projectDirFile, "libs/flow/schemas/" + schemaFlowName + "/fetchWeather.out.schema.json");
assertTrue(!schemaFile.isFile(), "Learned schema should not exist before the first named run");
var schemaLearnRun = JSON.parse(engine.run(JSON.stringify({
	flowName: schemaFlowName,
	flowSource: weatherFlowSource,
	config: {
		weatherUrl: fixtureUrl,
		apiKey: "demo-key",
		threshold: 35
	},
	includeTrace: false
})));
assertTrue(schemaLearnRun.ok === true && schemaFile.isFile(),
	"HTTP block did not learn its output schema when the schema file was missing");
var learnedContext = JSON.parse(engine.context(JSON.stringify({
	flowName: schemaFlowName,
	flowSource: weatherFlowSource,
	node: "selectMetropoles",
	include: ["local"],
	detail: "compact"
})));
print(JSON.stringify(learnedContext));
assertTrue(learnedContext.scopes.local.indexOf("local.weather.body.metropoles[0].city") !== -1,
	"Flow context did not expose learned HTTP JSON item schema paths");
assertTrue(learnedContext.scopes.local.indexOf("local.weather.body.metropoles.city") === -1,
	"Flow context exposed an impossible direct field below an array schema");
assertTrue(learnedContext.scopes.local.indexOf("local.weather.body.metropoles") !== -1,
	"Flow context did not expose learned array schema path");
var learnedLoopContext = JSON.parse(engine.context(JSON.stringify({
	flowName: schemaFlowName,
	flowSource: weatherFlowSource,
	node: "keepHotCity",
	include: ["current"],
	detail: "compact"
})));
print(JSON.stringify(learnedLoopContext));
assertTrue(learnedLoopContext.scopes.current.indexOf("current.city") !== -1 &&
	learnedLoopContext.scopes.current.indexOf("current.temperature") !== -1,
	"Flow context did not expose iterated item fields from a learned array schema");
var schemaReset = JSON.parse(engine.schemaReset(JSON.stringify({
	flowName: schemaFlowName,
	node: "fetchWeather"
})));
print(JSON.stringify(schemaReset));
assertTrue(schemaReset.ok === true && schemaReset.deleted === true && !schemaFile.isFile(),
	"Flow schema reset did not delete the learned node schema");

var compactWeatherFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: fetchWeather",
	"    block: http.request",
	"    method: GET",
	"    url: \"{{ config.weatherUrl }}\"",
	"    headers:",
	"      X-Api-Key: \"{{ config.apiKey }}\"",
	"    out: local.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: local.weather",
	"    path: body.metropoles",
	"    out: local.metropoles",
	"  - id: filterHot",
	"    block: list.filter",
	"    items: local.metropoles",
	"    where: current.temperature >= config.threshold",
	"    out: local.hotMetropoles",
	"  - id: sortHot",
	"    block: list.sort",
	"    items: local.hotMetropoles",
	"    by: current.city",
	"    out: local.sortedHotMetropoles",
	"  - id: mapCities",
	"    block: list.map",
	"    items: local.sortedHotMetropoles",
	"    select: current.city",
	"    out: result.hotCities",
	"  - id: notify",
	"    block: email.mock",
	"    to: ops@example.com",
	"    subject: Weather alert",
	"    body: \"Hot cities over {{ config.threshold }}C: {{ result.hotCities }}\"",
	"    out: result.notification",
	"  - id: message",
	"    block: set",
	"    path: result.message",
	"    value: Weather alert computed with catalogue blocks",
	""
].join("\n");

var compactWeatherAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: compactWeatherFlowSource })));
print(JSON.stringify(compactWeatherAnalysis));
assertTrue(compactWeatherAnalysis.writes.indexOf("local.hotMetropoles") !== -1,
	"Compact weather analysis did not report list.filter output");

var compactWeatherRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: compactWeatherFlowSource,
	config: {
		weatherUrl: fixtureUrl,
		apiKey: "demo-key",
		threshold: 35
	}
})));
print(JSON.stringify(compactWeatherRun));
assertTrue(compactWeatherRun.result.hotCities.join(",") === "Marseille,Paris",
	"Compact weather flow did not filter, sort and map hot cities");

var listSchemaPropagationFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourcePeople",
	"    block: set",
	"    path: local.people",
	"    value:",
	"      - name: Ada",
	"        age: 36",
	"        city: London",
	"      - name: Grace",
	"        age: 40",
	"        city: Arlington",
	"  - id: filterAdults",
	"    block: list.filter",
	"    items: local.people",
	"    where: current.age >= 18",
	"    out: local.adults",
	"  - id: sortAdults",
	"    block: list.sort",
	"    items: local.adults",
	"    by: current.name",
	"    out: local.sortedAdults",
	"  - id: searchAdults",
	"    block: list.search",
	"    items: local.sortedAdults",
	"    query: a",
	"    out: local.matchingAdults",
	"  - id: mapNames",
	"    block: list.map",
	"    items: local.matchingAdults",
	"    select: current.name",
	"    out: result.names",
	"  - id: pluckAges",
	"    block: list.pluck",
	"    items: local.sortedAdults",
	"    path: age",
	"    out: result.ages",
	"  - id: copySorted",
	"    block: set",
	"    path: result.sorted",
	"    value: \"{{ local.sortedAdults }}\"",
	""
].join("\n");
var listSchemaAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: listSchemaPropagationFlowSource })));
print(JSON.stringify(listSchemaAnalysis));
function analysisNode(analysis, id) {
	for (var i = 0; i < (analysis.nodes || []).length; i++) {
		if (analysis.nodes[i].id === id) {
			return analysis.nodes[i];
		}
	}
	return null;
}
function nodeOutput(node, path) {
	for (var i = 0; i < (node && node.outputs || []).length; i++) {
		if (node.outputs[i].path === path) {
			return node.outputs[i];
		}
	}
	return null;
}
function schemaLeaf(output, path) {
	var leaves = output && output.schema && output.schema.leafPaths || [];
	for (var i = 0; i < leaves.length; i++) {
		if (leaves[i].path === path) {
			return leaves[i];
		}
	}
	return null;
}
assertTrue(listSchemaAnalysis.schemas["local.sortedAdults"].items.properties.name.type === "string" &&
	listSchemaAnalysis.schemas["local.sortedAdults"].items.properties.age.type === "integer",
	"list.filter/list.sort/list.search did not preserve array item schemas");
var filterAdultAgeOutput = schemaLeaf(nodeOutput(analysisNode(listSchemaAnalysis, "filterAdults"), "local.adults"), "[0].age");
var mapNameOutput = schemaLeaf(nodeOutput(analysisNode(listSchemaAnalysis, "mapNames"), "result.names"), "[0]");
var pluckAgeOutput = schemaLeaf(nodeOutput(analysisNode(listSchemaAnalysis, "pluckAges"), "result.ages"), "[0]");
assertTrue(filterAdultAgeOutput && filterAdultAgeOutput.type === "integer",
	"list.filter node output schema still exposes the item as unknown");
assertTrue(mapNameOutput && mapNameOutput.type === "string",
	"list.map node output schema still exposes the mapped item as unknown");
assertTrue(pluckAgeOutput && pluckAgeOutput.type === "integer",
	"list.pluck node output schema still exposes the plucked item as unknown");
var listSchemaOutput = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: listSchemaPropagationFlowSource })));
print(JSON.stringify(listSchemaOutput));
assertTrue(listSchemaOutput.schema.properties.names.type === "array" &&
	listSchemaOutput.schema.properties.names.items.type === "string",
	"list.map did not derive array item schema from current.* selection");
assertTrue(listSchemaOutput.schema.properties.ages.type === "array" &&
	listSchemaOutput.schema.properties.ages.items.type === "integer",
	"list.pluck did not derive array item schema from item path");
assertTrue(listSchemaOutput.schema.properties.sorted.type === "array" &&
	listSchemaOutput.schema.properties.sorted.items.properties.city.type === "string",
	"set did not reuse the propagated list schema for result output");

var collectionSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourcePayload",
	"    block: set",
	"    path: local.payload",
	"    value:",
	"      items:",
	"        - name: Ada",
	"          age: 36",
	"        - name: Grace",
	"          age: 40",
	"  - id: normalizeItems",
	"    block: json.items",
	"    source: local.payload",
	"    path: items",
	"    out: local.items",
	"  - id: sourceGroups",
	"    block: set",
	"    path: local.groups",
	"    value:",
	"      - - name: Ada",
	"          age: 36",
	"      - - name: Grace",
	"          age: 40",
	"  - id: compactGroups",
	"    block: list.compact",
	"    items: local.groups",
	"    flatten: true",
	"    out: local.flatPeople",
	""
].join("\n");
var collectionSchemaAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: collectionSchemaFlowSource })));
var jsonItemsAgeOutput = schemaLeaf(nodeOutput(analysisNode(collectionSchemaAnalysis, "normalizeItems"), "local.items"), "[0].age");
var compactAgeOutput = schemaLeaf(nodeOutput(analysisNode(collectionSchemaAnalysis, "compactGroups"), "local.flatPeople"), "[0].age");
assertTrue(collectionSchemaAnalysis.schemas["local.items"].items.properties.age.type === "integer" &&
	jsonItemsAgeOutput && jsonItemsAgeOutput.type === "integer",
	"json.items did not derive item schema from source path");
assertTrue(collectionSchemaAnalysis.schemas["local.flatPeople"].items.properties.name.type === "string" &&
	compactAgeOutput && compactAgeOutput.type === "integer",
	"list.compact did not preserve flattened item schema");

var jsonObjectSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourcePerson",
	"    block: set",
	"    path: local.person",
	"    value:",
	"      name: Ada",
	"      age: 36",
	"  - id: buildCard",
	"    block: json.object",
	"    out: result.card",
	"    fields:",
	"      - id: fieldName",
	"        block: json.field",
	"        key: name",
	"        value: \"{{ local.person.name }}\"",
	"      - id: fieldAge",
	"        block: json.field",
	"        key: age",
	"        value: \"{{ local.person.age }}\"",
	"      - id: fieldActive",
	"        block: json.field",
	"        key: active",
	"        value: true",
	"      - id: fieldCity",
	"        block: json.field",
	"        key: city",
	"        value: Paris",
	""
].join("\n");
var jsonObjectOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: jsonObjectSchemaFlowSource })));
assertTrue(jsonObjectOutputSchema.schema.properties.card.properties.name.type === "string" &&
	jsonObjectOutputSchema.schema.properties.card.properties.age.type === "integer" &&
	jsonObjectOutputSchema.schema.properties.card.properties.active.type === "boolean" &&
	jsonObjectOutputSchema.schema.properties.card.properties.city.type === "string",
	"json.object/json.field did not derive field schemas from typed values");

var configUsePickerFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourcePeople",
	"    block: set",
	"    path: local.people",
	"    value:",
	"      - name: Ada",
	"        age: 36",
	"        city: London",
	"      - name: Grace",
	"        age: 40",
	"        city: Arlington",
	"  - id: adultConfig",
	"    block: config.use",
	"    overrides:",
	"      adult:",
	"        age: 18",
	"    then:",
	"      - id: filterAdults",
	"        block: list.filter",
	"        items: local.people",
	"        where: current.age >= config.adult.age",
	"        out: local.adults",
	"      - id: copyAdults",
	"        block: set",
	"        path: result.adults",
	"        value: \"{{ local.adults }}\"",
	""
].join("\n");
var configUsePickerAnalysis = JSON.parse(engine.analyze(JSON.stringify({
	flowSource: configUsePickerFlowSource
})));
print(JSON.stringify(configUsePickerAnalysis));
assertTrue(configUsePickerAnalysis.writes.indexOf("local.adults") !== -1 &&
	configUsePickerAnalysis.writes.indexOf("result.adults") !== -1,
	"config.use analysis did not visit nodes in the then slot");
assertTrue(configUsePickerAnalysis.schemas["result.adults"].items.properties.age.type === "integer",
	"config.use analysis did not preserve list output schema from the then slot");
var configUsePickerContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: configUsePickerFlowSource,
	node: "filterAdults",
	property: "where",
	include: ["config", "current"],
	detail: "normal"
})));
print(JSON.stringify(configUsePickerContext));
function contextEntries(context, scope) {
	return context.scopes && context.scopes[scope] && context.scopes[scope].paths || [];
}
function contextEntry(context, scope, path) {
	var entries = contextEntries(context, scope);
	for (var i = 0; i < entries.length; i++) {
		if (entries[i].path === path) {
			return entries[i];
		}
	}
	return null;
}
var adultAgeEntry = contextEntry(configUsePickerContext, "config", "config.adult.age");
var currentAgeEntry = contextEntry(configUsePickerContext, "current", "current.age");
assertTrue(adultAgeEntry && adultAgeEntry.type === "integer",
	"config.use context did not expose typed config.adult.age to expression picker");
assertTrue(currentAgeEntry && currentAgeEntry.type === "integer",
	"list.filter context did not expose typed current.age to expression picker");

var standardDataFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceProfile",
	"    block: set",
	"    path: local.profile",
	"    value:",
	"      city: Paris",
	"      metrics:",
	"        temperature: 38",
	"        unit: C",
	"  - id: pickFields",
	"    block: object.pick",
	"    source: local.profile",
	"    keys:",
	"      - city",
	"      - metrics.temperature",
	"    out: local.selected",
	"  - id: mergeAlert",
	"    block: object.merge",
	"    target: local.selected",
	"    source:",
	"      alert: true",
	"    out: result.payload",
	"  - id: stringify",
	"    block: json.stringify",
	"    value: \"{{ result.payload }}\"",
	"    out: local.payloadText",
	"  - id: parse",
	"    block: json.parse",
	"    text: \"{{ local.payloadText }}\"",
	"    out: result.roundtrip",
	""
].join("\n");
var standardDataRun = JSON.parse(engine.run(JSON.stringify({ flowSource: standardDataFlowSource })));
print(JSON.stringify(standardDataRun));
assertTrue(standardDataRun.result.payload.city === "Paris" &&
	standardDataRun.result.payload.temperature === 38 &&
	standardDataRun.result.payload.alert === true &&
	standardDataRun.result.roundtrip.city === "Paris",
	"Standard data blocks did not pick, merge, stringify and parse correctly");

var inputFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ input.city }}\"",
	"  - id: setTags",
	"    block: set",
	"    path: result.tags",
	"    value: \"{{ input.tags }}\"",
	"  - id: setBodyMessage",
	"    block: set",
	"    path: result.message",
	"    value: \"{{ input.message }}\"",
	""
].join("\n");
var inputRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: inputFlowSource,
	input: {
		city: "Paris",
		tags: ["hot", "capital"],
		message: "from body"
	}
})));
print(JSON.stringify(inputRun));
assertTrue(inputRun.result.city === "Paris" &&
	inputRun.result.tags.join(",") === "hot,capital" &&
	inputRun.result.message === "from body",
	"Flow input scope did not expose request input");

var writerFile = new java.io.File(projectDirFile, "handle-writer.txt");
var writerFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: initLines",
	"    block: set",
	"    path: local.lines",
	"    value:",
	"      - Alpha",
	"      - Beta",
	"  - id: writeFile",
	"    block: file.withWriter",
	"    path: " + JSON.stringify(String(writerFile.getAbsolutePath())),
	"    as: local.writer",
	"    nodes:",
	"      - id: loopLines",
	"        block: forEach",
	"        items: local.lines",
	"        nodes:",
	"          - id: writeLine",
	"            block: file.write",
	"            writer: local.writer",
	"            value: \"{{ current }}\"",
	"            newline: true",
	"  - id: done",
	"    block: set",
	"    path: result.file",
	"    value: " + JSON.stringify(String(writerFile.getAbsolutePath())),
	""
].join("\n");
var writerRun = JSON.parse(engine.run(JSON.stringify({ flowSource: writerFlowSource })));
print(JSON.stringify(writerRun));
var writerText = String(Packages.org.apache.commons.io.FileUtils.readFileToString(writerFile, "UTF-8")).replace(/\r\n/g, "\n");
assertTrue(writerRun.ok === true &&
	writerText === "Alpha\nBeta\n" &&
	writerRun.trace.nodes.some(function (entry) {
		return entry.id === "writeFile" &&
			entry.result &&
			entry.result.handle === "file.writer" &&
			entry.result.state === "closed";
	}),
	"file.withWriter/file.write did not write lines and close the runtime handle");

var forbiddenHandleResultFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: openFile",
	"    block: file.withWriter",
	"    path: " + JSON.stringify(String(new java.io.File(projectDirFile, "handle-leak.txt").getAbsolutePath())),
	"    as: local.writer",
	"    nodes:",
	"      - id: leakHandle",
	"        block: set",
	"        path: result.writer",
	"        value: \"{{ local.writer }}\"",
	""
].join("\n");
var forbiddenHandleResultRun = JSON.parse(engine.run(JSON.stringify({ flowSource: forbiddenHandleResultFlowSource })));
print(JSON.stringify(forbiddenHandleResultRun));
assertTrue(forbiddenHandleResultRun.ok === false &&
	forbiddenHandleResultRun.error.code === "RUNTIME_HANDLE_IN_RESULT",
	"Runtime handles should be rejected from result payloads");

var readerFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: initReadLines",
	"    block: set",
	"    path: result.lines",
	"    value: []",
	"  - id: readFile",
	"    block: file.withReader",
	"    path: " + JSON.stringify(String(writerFile.getAbsolutePath())),
	"    as: local.reader",
	"    nodes:",
	"      - id: eachLine",
	"        block: file.forEachLine",
	"        reader: local.reader",
	"        out: result.readStats",
	"        nodes:",
	"          - id: pushReadLine",
	"            block: json.push",
	"            path: result.lines",
	"            value: \"{{ current }}\"",
	""
].join("\n");
var readerRun = JSON.parse(engine.run(JSON.stringify({ flowSource: readerFlowSource })));
print(JSON.stringify(readerRun));
assertTrue(readerRun.ok === true &&
	readerRun.result.lines.join(",") === "Alpha,Beta" &&
	readerRun.result.readStats.count === 2 &&
	readerRun.trace.nodes.some(function (entry) {
		return entry.id === "readFile" &&
			entry.result &&
			entry.result.handle === "file.reader" &&
			entry.result.state === "closed";
	}),
	"file.withReader/file.forEachLine did not read lines and close the runtime handle");
var readerContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: readerFlowSource,
	node: "pushReadLine",
	include: ["current"],
	detail: "normal"
})));
print(JSON.stringify(readerContext));
assertTrue(readerContext.ok === true &&
	readerContext.scopes.current.paths.length === 1 &&
	readerContext.scopes.current.paths[0].path === "current" &&
	readerContext.scopes.current.paths[0].type === "string",
	"Flow context did not expose current as string inside file.forEachLine");

var readLineFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: readFile",
	"    block: file.withReader",
	"    path: " + JSON.stringify(String(writerFile.getAbsolutePath())),
	"    as: local.reader",
	"    nodes:",
	"      - id: firstLine",
	"        block: file.readLine",
	"        reader: local.reader",
	"        line: result.first",
	"        eof: result.firstEof",
	"      - id: secondLine",
	"        block: file.readLine",
	"        reader: local.reader",
	"        out: result.second",
	""
].join("\n");
var readLineRun = JSON.parse(engine.run(JSON.stringify({ flowSource: readLineFlowSource })));
print(JSON.stringify(readLineRun));
assertTrue(readLineRun.ok === true &&
	readLineRun.result.first === "Alpha" &&
	readLineRun.result.firstEof === false &&
	readLineRun.result.second.line === "Beta" &&
	readLineRun.result.second.eof === false,
	"file.readLine did not read individual lines from the reader handle");

var smokeFlowsDir = new java.io.File(projectDirFile, "libs/flows");
smokeFlowsDir.mkdirs();
var namedGreetingFlowSource = [
	"function NamedGreeting({ input, config, result }) {",
	"\tset({ id: \"setMessage\", path: \"result.message\", value: `Hello ${input.name}${config.suffix}` })",
	"\tset({ id: \"setMode\", path: \"result.mode\", value: \"rhino-flow\" })",
	"\treturn result",
	"}",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "NamedGreeting.flow.js"),
	namedGreetingFlowSource,
	"UTF-8"
);
var namedSearch = JSON.parse(engine.search(JSON.stringify({
	project: "SmokeProject",
	name: "NamedGreeting",
	query: "setMessage",
	kinds: ["node"],
	context: 1
})));
print(JSON.stringify(namedSearch));
assertTrue(namedSearch.ok === true &&
	namedSearch.matches[0].flowQName === "SmokeProject.NamedGreeting" &&
	namedSearch.matches[0].nodeId === "setMessage" &&
	namedSearch.matches[0].path === "/nodes/0",
	"search did not return flowQName, nodeId and canonical path for a named Flow node");
var catalogSearch = JSON.parse(engine.search(JSON.stringify({
	query: "requestable",
	kinds: ["block", "type"],
	limit: 5,
	doc: false,
	hints: false
})));
print(JSON.stringify(catalogSearch));
assertTrue(catalogSearch.matches.some(function (match) {
	return match.kind === "block" && match.name === "requestable.call";
}) && catalogSearch.matches.some(function (match) {
	return match.kind === "type" && match.name === "requestable";
}), "search did not return catalog block/type matches");
var requestableCallSource = [
	"function RequestableBridge({ input, config, result }) {",
	"\tvar response = requestable.call({ id: \"callRequestable\", requestable: \".NamedGreeting\", input: { name: \"Nicolas\" } })",
	"\treturn result",
	"}",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "RequestableBridge.flow.js"),
	requestableCallSource,
	"UTF-8"
);
var multiTokenSearch = JSON.parse(engine.search(JSON.stringify({
	project: "SmokeProject",
	query: "NamedGreeting requestable call",
	kinds: ["node"],
	context: 1,
	doc: false,
	hints: false
})));
print(JSON.stringify(multiTokenSearch));
assertTrue(multiTokenSearch.matches.some(function (match) {
	return match.flow === "RequestableBridge" && match.nodeId === "callRequestable";
}), "search did not match Flow nodes with unordered query tokens");
var requestableCallAnalysis = JSON.parse(engine.analyze(JSON.stringify({
	flowSource: requestableCallSource,
	context: {
		project: "SmokeProject"
	}
})));
print(JSON.stringify(requestableCallAnalysis));
assertTrue(requestableCallAnalysis.writes.indexOf("local.response") !== -1,
	"requestable.call did not expose its output path during analysis");
var contractDefaultImplementationSource = [
	"function WeatherTemperatureDefaultMock({ input, config, result }) {",
	"\tresult.city = input.city",
	"\tresult.temperature = 42",
	"\tresult.unit = input.unit",
	"\tresult.provider = \"DefaultMock\"",
	"\treturn result",
	"}",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureDefaultMock.flow.js"),
	contractDefaultImplementationSource,
	"UTF-8"
);
var contractOverrideImplementationSource = [
	"function WeatherTemperatureOverrideMock({ input, config, result }) {",
	"\tresult.city = request.input.city",
	"\tresult.temperature = 20",
	"\tresult.unit = request.input.unit",
	"\tresult.provider = \"OverrideMock\"",
	"\treturn result",
	"}",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureOverrideMock.flow.js"),
	contractOverrideImplementationSource,
	"UTF-8"
);
var contractProjectImplementationSource = [
	"function WeatherTemperatureProjectMock({ input, config, result }) {",
	"\tresult.city = request.input.city",
	"\tresult.temperature = 12",
	"\tresult.unit = request.input.unit",
	"\tresult.provider = \"ProjectEngineMock\"",
	"\treturn result",
	"}",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureProjectMock.flow.js"),
	contractProjectImplementationSource,
	"UTF-8"
);
var smokeFlowEngineDir = new java.io.File(projectDirFile, "libs/flow");
smokeFlowEngineDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowEngineDir, "engine.yaml"),
	[
		"version: 1",
		"bindings:",
		"  weather.projectTemperature@1: WeatherTemperatureProjectMock",
		"config:",
		"  weather:",
		"    unit: C",
		""
	].join("\n"),
	"UTF-8"
);
var describedEngineTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: [
		"version: 1",
		"engineQName: lib_flow_engine.Engine",
		"bindings:",
		"  weather.projectTemperature@1: WeatherTemperatureProjectMock",
		"config:",
		"  weather:",
		"    unit: C",
		""
	].join("\n")
})));
print(JSON.stringify(describedEngineTree));
assertTrue(describedEngineTree.children[0].kind === "engine" &&
	describedEngineTree.children.some(function (child) { return child.name === "catalog"; }),
	"describeTree(engine) did not expose engine metadata and catalog");
var describedCatalog = findChild(describedEngineTree, "catalog");
var describedBlocks = findChild(describedCatalog, "blocks");
var describedCoreBlocks = findChild(describedBlocks, "provider_lib_flow_engine");
var describedSetBlock = findChild(describedCoreBlocks, "block_set");
assertTrue(describedSetBlock && describedSetBlock.children.some(function (child) {
	var definition = child.definition ? JSON.parse(child.definition) : {};
	return child.summary === "Implementation" && definition.implementationKind === "javascript";
}), "describeTree(engine) did not expose JavaScript block implementation resources");
var describedFragments = findChild(describedEngineTree, "fragments");
var describedFragment = describedFragments && describedFragments.children[0];
assertTrue(describedFragment && describedFragment.children.some(function (child) {
	var definition = child.definition ? JSON.parse(child.definition) : {};
	return child.summary === "Implementation" && definition.implementationKind === "flow";
}), "describeTree(engine) did not expose fragment implementation nodes");
var mutatedEngine = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "engine",
	engineSource: [
		"version: 1",
		"bindings: {}",
		"config:",
		"  weather:",
		"    unit: C",
		""
	].join("\n"),
	mutation: {
		op: "replace",
		path: "/config/weather/unit",
		value: "F"
	}
})));
print(JSON.stringify(mutatedEngine));
assertTrue(mutatedEngine.ok === true &&
	mutatedEngine.children.some(function (child) {
		return child.name === "config" && child.definition.indexOf('"unit":"F"') !== -1;
	}),
	"applyMutation(engine) did not update config");

var contractFlowSource = [
	"version: 1",
	"contracts:",
	"  weather.currentTemperature@1:",
	"    input:",
	"      city: string",
	"      unit: C|F",
	"    output:",
	"      city: string",
	"      temperature: number",
	"      unit: C|F",
	"      provider: string",
	"    defaultImplementation: WeatherTemperatureDefaultMock",
	"nodes:",
	"  - id: getTemperature",
	"    block: use",
	"    contract: weather.currentTemperature@1",
	"    input:",
	"      city:",
	"        value: Paris",
	"      unit:",
	"        value: C",
	"    out: result.weather",
	""
].join("\n");
var contractDefaultRun = JSON.parse(engine.run(JSON.stringify({ flowSource: contractFlowSource })));
print(JSON.stringify(contractDefaultRun));
assertTrue(contractDefaultRun.result.weather.temperature === 42 &&
	contractDefaultRun.result.weather.provider === "DefaultMock",
	"Contract use did not run defaultImplementation");

var contractOverrideRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: contractFlowSource,
	config: {
		bindings: {
			"weather.currentTemperature@1": "WeatherTemperatureOverrideMock"
		}
	}
})));
print(JSON.stringify(contractOverrideRun));
assertTrue(contractOverrideRun.result.weather.temperature === 20 &&
	contractOverrideRun.result.weather.provider === "OverrideMock",
	"Contract use did not honor config binding override");

var projectBindingFlowSource = [
	"version: 1",
	"contracts:",
	"  weather.projectTemperature@1:",
	"    defaultImplementation: WeatherTemperatureDefaultMock",
	"nodes:",
	"  - id: getTemperature",
	"    block: use",
	"    contract: weather.projectTemperature@1",
	"    input:",
	"      city:",
	"        value: Lyon",
	"      unit:",
	"        value: \"{{ config.weather.unit }}\"",
	"    out: result.weather",
	""
].join("\n");
var projectBindingRun = JSON.parse(engine.run(JSON.stringify({ flowSource: projectBindingFlowSource })));
print(JSON.stringify(projectBindingRun));
assertTrue(projectBindingRun.result.weather.temperature === 12 &&
	projectBindingRun.result.weather.provider === "ProjectEngineMock",
	"Contract use did not honor project FlowEngine binding");
