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
	"    path: flow.items",
	"    value:",
	"      - Paris",
	"      - Lyon",
	"  - id: initResult",
	"    block: set",
	"    path: result.cities",
	"    value: []",
	"  - id: loopItems",
	"    block: forEach",
	"    items: flow.items",
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
	return block.name === "requestable.call";
}), "catalog did not expose requestable.call");
assertTrue(catalog.blocks.some(function (block) {
	return block.name === "json.push" && block.namespace === "json" && block["package"] === "core";
}), "catalog did not expose package/namespace metadata");
var expressionType = catalog.types.filter(function (type) {
	return type.name === "expression";
})[0];
assertTrue(expressionType && expressionType.editor && String(expressionType.editor.file).indexOf("expression.html") !== -1,
	"catalog did not expose type editor resources");
var typeListApi = JSON.parse(engine.types("{}"));
assertTrue(typeListApi.ok === true && typeListApi.types.some(function (type) {
	return type.name === "requestable";
}), "types API did not expose core property types");
var customTypeSource = [
	"(function () {",
	"\treturn {",
	"\t\tname: \"custom.note\",",
	"\t\tlabel: \"Custom note\",",
	"\t\ttype: \"string\",",
	"\t\tdescription: \"Project-local smoke test type.\"",
	"\t};",
	"}())",
	""
].join("\n");
var createdType = JSON.parse(engine.typeCreate(JSON.stringify({
	name: "custom.note",
	source: customTypeSource
})));
assertTrue(createdType.name === "custom.note", "typeCreate did not create a project-local type");
var readType = JSON.parse(engine.typeGet(JSON.stringify({
	name: "custom.note"
})));
assertTrue(readType.descriptor.description === "Project-local smoke test type.",
	"typeGet did not return the custom type descriptor");
var resourceBlockSource = [
	"(function () {",
	"\treturn {",
	"\t\tname: \"resource.echo\",",
	"\t\tcatalog: function () {",
	"\t\t\treturn {",
	"\t\t\t\tname: \"resource.echo\",",
	"\t\t\t\tdescription: \"Resource smoke block.\",",
	"\t\t\t\tprops: {}",
	"\t\t\t};",
	"\t\t},",
	"\t\trun: function () {",
	"\t\t\treturn \"ok\";",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var createdResourceBlock = JSON.parse(engine.blockCreate(JSON.stringify({
	name: "resource.echo",
	source: resourceBlockSource
})));
assertTrue(createdResourceBlock.name === "resource.echo", "blockCreate did not prepare a resource block");
assertTrue(new java.io.File(projectDirFile, "libs/flow/blocks/resource.echo.block.yaml").isFile() &&
	new java.io.File(projectDirFile, "libs/flow/blocks/resource.echo.js").isFile(),
	"blockCreate did not write the canonical descriptor plus implementation files");
var createdResourceBlockGet = JSON.parse(engine.blockGet(JSON.stringify({
	name: "resource.echo"
})));
assertTrue(createdResourceBlockGet.format === "canonical" &&
	createdResourceBlockGet.descriptorSource.indexOf("Resource smoke block.") !== -1 &&
	createdResourceBlockGet.implementationSource.indexOf("resource.echo") !== -1,
	"blockGet did not expose canonical descriptor and implementation sources");
var resourceSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "Resource smoke",
	doc: false,
	hints: false
})));
assertTrue(resourceSearch.resources.some(function (resource) {
	return resource.path === "libs/flow/blocks/resource.echo.js";
}), "resourceSearch did not find the project block source");
var resourceGet = JSON.parse(engine.resourceGet(JSON.stringify({
	path: "libs/flow/blocks/resource.echo.js"
})));
assertTrue(resourceGet.hash && resourceGet.content.indexOf("Resource smoke block.") !== -1,
	"resourceGet did not return content and hash");
var resourcePatch = JSON.parse(engine.resourcePatch(JSON.stringify({
	path: "libs/flow/blocks/resource.echo.js",
	baseHash: resourceGet.hash,
	patch: [
		"--- a/libs/flow/blocks/resource.echo.js",
		"+++ b/libs/flow/blocks/resource.echo.js",
		"@@ -1,7 +1,7 @@",
		" \t\t\treturn {",
		" \t\t\t\tname: \"resource.echo\",",
		"-\t\t\t\tdescription: \"Resource smoke block.\",",
		"+\t\t\t\tdescription: \"Resource patched block.\",",
		" \t\t\t\tprops: {}",
		" \t\t\t};"
	].join("\n")
})));
assertTrue(resourcePatch.ok === true && resourcePatch.changed === true && resourcePatch.validation.ok === true,
	"resourcePatch did not patch and validate the project block source");
var patchedResourceGet = JSON.parse(engine.resourceGet(JSON.stringify({
	path: "libs/flow/blocks/resource.echo.js"
})));
assertTrue(patchedResourceGet.content.indexOf("Resource patched block.") !== -1,
	"resourcePatch did not persist the patched source");
var resourceGetRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: readResource",
		"    block: resource.get",
		"    path: libs/flow/blocks/resource.echo.js",
		"    out: result.resource",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(resourceGetRun.result.resource.content.indexOf("Resource patched block.") !== -1,
	"resource.get block did not read project Flow resources");
var resourceSearchRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: searchResource",
		"    block: resource.search",
		"    query: Resource patched",
		"    doc: false",
		"    hints: false",
		"    out: result.search",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(resourceSearchRun.result.search.resources.some(function (resource) {
	return resource.path === "libs/flow/blocks/resource.echo.js";
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
var canonicalYaml = [
	"version: 1",
	"name: canonical.echo",
	"icon: mdi:puzzle-outline",
	"description: Canonical YAML descriptor backed by Rhino.",
	"props:",
	"  value:",
	"    kind: value",
	"    type: unknown",
	"    description: Value returned by the block.",
	"  out:",
	"    kind: path",
	"    mode: write",
	"    description: Scope path receiving the value.",
	"implementation:",
	"  runtime: rhino",
	"  file: canonical.echo.js",
	""
].join("\n");
var canonicalJs = [
	"(function () {",
	"\treturn {",
	"\t\tname: \"canonical.echo\",",
	"\t\tdisplayName: function (node) {",
	"\t\t\tvar props = node.props || node;",
	"\t\t\treturn \"canonical -> \" + (props.out || \"result.value\");",
	"\t\t},",
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
var canonicalBlocksDir = new java.io.File(projectDirFile, "libs/flow/blocks");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(canonicalBlocksDir, "canonical.echo.block.yaml"), canonicalYaml, "UTF-8");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(canonicalBlocksDir, "canonical.echo.js"), canonicalJs, "UTF-8");
var canonicalCatalog = JSON.parse(engine.catalog(JSON.stringify({ detail: "compact" })));
var canonicalBlock = null;
canonicalCatalog.blocks.forEach(function (block) {
	if (block.name === "canonical.echo") {
		canonicalBlock = block;
	}
});
assertTrue(canonicalBlock && canonicalBlock.implementation === "rhino" &&
	canonicalBlock.props.value.kind === "value",
	"catalog did not expose canonical YAML metadata for a Rhino block");
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
	"canonical YAML Rhino block did not execute through its implementation file");
var callBlockSource = [
	"(function () {",
	"\treturn {",
	"\t\tname: \"smoke.callBlock\",",
	"\t\tcatalog: function () {",
	"\t\t\treturn {",
	"\t\t\t\tname: \"smoke.callBlock\",",
	"\t\t\t\tdescription: \"Calls core blocks as capabilities.\",",
	"\t\t\t\tprops: {",
	"\t\t\t\t\tout: { kind: \"path\", mode: \"write\" }",
	"\t\t\t\t}",
	"\t\t\t};",
	"\t\t},",
	"\t\trun: function (ctx, node) {",
	"\t\t\tvar props = ctx.props(node);",
	"\t\t\tctx.callBlock(\"set\", { path: \"flow.called\", value: \"{{ input.name }}\" }, { trace: false });",
	"\t\t\tvar returned = ctx.callBlock(\"return\", { value: \"{{ flow.called }}\" }, { trace: false });",
	"\t\t\tctx.callBlock(\"set\", { path: \"flow.afterReturn\", value: \"still-running\" }, { trace: false });",
	"\t\t\treturn { value: returned, afterReturn: ctx.read(\"flow.afterReturn\"), out: props.out || \"\" };",
	"\t\t}",
	"\t};",
	"}())",
	""
].join("\n");
var createdCallBlock = JSON.parse(engine.blockCreate(JSON.stringify({
	name: "smoke.callBlock",
	source: callBlockSource
})));
assertTrue(createdCallBlock.name === "smoke.callBlock", "blockCreate did not create the callBlock smoke block");
var callBlockRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: callSmoke",
		"    block: smoke.callBlock",
		"    out: result.call",
		""
	].join("\n"),
	input: {
		name: "Ada"
	},
	includeTrace: false
})));
assertTrue(callBlockRun.result.call.value === "Ada" &&
	callBlockRun.result.call.afterReturn === "still-running",
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
var libBackedBlockSource = [
	"(function () {",
	"\treturn {",
	"\t\tname: \"smoke.lib\",",
	"\t\tcatalog: function () {",
	"\t\t\treturn {",
	"\t\t\t\tname: \"smoke.lib\",",
	"\t\t\t\tdescription: \"Uses a project Flow library.\",",
	"\t\t\t\tprops: {",
	"\t\t\t\t\tvalue: { kind: \"expression\", type: \"string\" },",
	"\t\t\t\t\tout: { kind: \"path\", mode: \"write\" }",
	"\t\t\t\t}",
	"\t\t\t};",
	"\t\t},",
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
	source: libBackedBlockSource
})));
assertTrue(createdLibBlock.name === "smoke.lib", "blockCreate did not create a library-backed block");
var flowDir = new java.io.File(projectDirFile, "libs/flows");
flowDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(flowDir, "ChildSmoke.flow.yaml"), [
	"version: 1",
	"nodes:",
	"  - id: decorate",
	"    block: smoke.lib",
	"    value: input.name",
	"    out: result.message",
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
	propertyEditor.html.indexOf("flow-text-editor") !== -1,
	"propertyEditor did not embed core standalone editors");
assertTrue(propertyEditor.html.indexOf("hostRequest(name,payload)") !== -1 &&
	propertyEditor.html.indexOf("typeEditorTag(kind)") !== -1,
	"propertyEditor did not expose generic type editor host API");
assertTrue(propertyEditor.html.indexOf("data-picker-property-button") !== -1 &&
	propertyEditor.html.indexOf("data-picker-editor") !== -1 &&
	propertyEditor.html.indexOf("data-apply-picked") !== -1 &&
	propertyEditor.html.indexOf("data-cancel-picked") !== -1,
	"propertyEditor did not expose picker target property apply actions");
assertTrue(propertyEditor.html.indexOf("target&&hasTypeEditor(pickerKind(target))") !== -1 &&
	propertyEditor.html.indexOf("pickerUpdatingEditor") !== -1,
	"propertyEditor did not route picker properties through standalone type editors");
assertTrue(propertyEditor.html.indexOf("details.scopeGroup") !== -1 &&
	propertyEditor.html.indexOf("acceptsPath(propertyDefinition, entry)") !== -1,
	"template/value editors did not expose collapsible filtered picker groups");
assertTrue(propertyEditor.html.indexOf("data-picker-format") === -1,
	"propertyEditor still exposes the confusing path/template picker format selector");
print(engine.analyze(JSON.stringify({ flowSource: flowSource })));
var describedFlowTree = JSON.parse(engine.describeTree(JSON.stringify({ target: "flow", flowSource: flowSource })));
print(JSON.stringify(describedFlowTree));
assertTrue(describedFlowTree.children[0].name === "flow" &&
	describedFlowTree.children[0].children[2].type === "forEach",
	"describeTree(flow) did not expose flow nodes");
assertTrue(describedFlowTree.children[0].children[0].summary === "[set] flow.items = [\"Paris\",\"Lyon\"]",
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
	"    path: flow.items",
	"    value:",
	"      - city: Paris",
	"        temperature: 36",
	"  - id: copyItems",
	"    block: set",
	"    path: result.items",
	"    value: \"{{ flow.items }}\"",
	""
].join("\n");
var staticOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowSource: staticSchemaFlowSource })));
assertTrue(staticOutputSchema.schema.properties.items.type === "array" &&
	staticOutputSchema.schema.properties.items.items.properties.city.type === "string" &&
	staticOutputSchema.schema.properties.items.items.properties.temperature.type === "integer",
	"outputSchema did not derive result from static dataflow analysis");
var explicitReturnSchemaFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceItems",
	"    block: set",
	"    path: flow.items",
	"    value:",
	"      - city: Paris",
	"        temperature: 36",
	"  - id: done",
	"    block: return",
	"    value: \"{{ flow.items }}\"",
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
	"    out: flow.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: flow.weather",
	"    path: body.metropoles",
	"    out: flow.metropoles",
	"  - id: initHotCities",
	"    block: set",
	"    path: result.hotCities",
	"    value: []",
	"  - id: eachCity",
	"    block: forEach",
	"    items: flow.metropoles",
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
	include: ["flow", "result"],
	detail: "normal"
})));
print(JSON.stringify(notifyContext));
assertTrue(notifyContext.ok === true &&
	notifyContext.scopes.flow.paths.some(function (entry) { return entry.path === "flow.metropoles"; }) &&
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
	keepHotCityContext.scopes.current.paths[0].producer.path === "flow.metropoles",
	"Flow context did not expose current source inside forEach");

var compactContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: weatherFlowSource,
	node: "notify",
	include: ["flow"],
	detail: "compact"
})));
print(JSON.stringify(compactContext));
assertTrue(Object.keys(compactContext.scopes).join(",") === "flow" &&
	compactContext.scopes.flow.indexOf("flow.weather") !== -1,
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
	include: ["flow"],
	detail: "compact"
})));
print(JSON.stringify(learnedContext));
assertTrue(learnedContext.scopes.flow.indexOf("flow.weather.body.metropoles.city") !== -1,
	"Flow context did not expose learned HTTP JSON schema paths");
assertTrue(learnedContext.scopes.flow.indexOf("flow.weather.body.metropoles") !== -1,
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
	"    out: flow.weather",
	"  - id: selectMetropoles",
	"    block: json.select",
	"    source: flow.weather",
	"    path: body.metropoles",
	"    out: flow.metropoles",
	"  - id: filterHot",
	"    block: list.filter",
	"    items: flow.metropoles",
	"    where: current.temperature >= config.threshold",
	"    out: flow.hotMetropoles",
	"  - id: sortHot",
	"    block: list.sort",
	"    items: flow.hotMetropoles",
	"    by: current.city",
	"    out: flow.sortedHotMetropoles",
	"  - id: mapCities",
	"    block: list.map",
	"    items: flow.sortedHotMetropoles",
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
assertTrue(compactWeatherAnalysis.writes.indexOf("flow.hotMetropoles") !== -1,
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

var standardDataFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: sourceProfile",
	"    block: set",
	"    path: flow.profile",
	"    value:",
	"      city: Paris",
	"      metrics:",
	"        temperature: 38",
	"        unit: C",
	"  - id: pickFields",
	"    block: object.pick",
	"    source: flow.profile",
	"    keys:",
	"      - city",
	"      - metrics.temperature",
	"    out: flow.selected",
	"  - id: mergeAlert",
	"    block: object.merge",
	"    target: flow.selected",
	"    source:",
	"      alert: true",
	"    out: result.payload",
	"  - id: stringify",
	"    block: json.stringify",
	"    value: \"{{ result.payload }}\"",
	"    out: flow.payloadText",
	"  - id: parse",
	"    block: json.parse",
	"    text: \"{{ flow.payloadText }}\"",
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
	"    path: flow.lines",
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
	"        items: flow.lines",
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
	"    as: flow.writer",
	"    nodes:",
	"      - id: leakHandle",
	"        block: set",
	"        path: result.writer",
	"        value: \"{{ flow.writer }}\"",
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
	"version: 1",
	"input:",
	"  name: string",
	"output:",
	"  message: string",
	"  mode: string",
	"nodes:",
	"  - id: setMessage",
	"    block: set",
	"    path: result.message",
	"    value: \"Hello {{ input.name }}{{ config.suffix }}\"",
	"  - id: setMode",
	"    block: set",
	"    path: result.mode",
	"    value: rhino-flow",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "NamedGreeting.flow.yaml"),
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
	"version: 1",
	"nodes:",
	"  - id: callRequestable",
	"    block: requestable.call",
	"    requestable: .NamedGreeting",
	"    input:",
	"      name: Nicolas",
	"    out: flow.response",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "RequestableBridge.flow.yaml"),
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
assertTrue(requestableCallAnalysis.writes.indexOf("flow.response") !== -1,
	"requestable.call did not expose its output path during analysis");
var contractDefaultImplementationSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ input.city }}\"",
	"  - id: setTemperature",
	"    block: set",
	"    path: result.temperature",
	"    value: 42",
	"  - id: setUnit",
	"    block: set",
	"    path: result.unit",
	"    value: \"{{ input.unit }}\"",
	"  - id: setProvider",
	"    block: set",
	"    path: result.provider",
	"    value: DefaultMock",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureDefaultMock.flow.yaml"),
	contractDefaultImplementationSource,
	"UTF-8"
);
var contractOverrideImplementationSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ request.input.city }}\"",
	"  - id: setTemperature",
	"    block: set",
	"    path: result.temperature",
	"    value: 20",
	"  - id: setUnit",
	"    block: set",
	"    path: result.unit",
	"    value: \"{{ request.input.unit }}\"",
	"  - id: setProvider",
	"    block: set",
	"    path: result.provider",
	"    value: OverrideMock",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureOverrideMock.flow.yaml"),
	contractOverrideImplementationSource,
	"UTF-8"
);
var contractProjectImplementationSource = [
	"version: 1",
	"nodes:",
	"  - id: setCity",
	"    block: set",
	"    path: result.city",
	"    value: \"{{ request.input.city }}\"",
	"  - id: setTemperature",
	"    block: set",
	"    path: result.temperature",
	"    value: 12",
	"  - id: setUnit",
	"    block: set",
	"    path: result.unit",
	"    value: \"{{ request.input.unit }}\"",
	"  - id: setProvider",
	"    block: set",
	"    path: result.provider",
	"    value: ProjectEngineMock",
	""
].join("\n");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(
	new java.io.File(smokeFlowsDir, "WeatherTemperatureProjectMock.flow.yaml"),
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
var describedCoreBlocks = findChild(describedBlocks, "origin_core");
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
