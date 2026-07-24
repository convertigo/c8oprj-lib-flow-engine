var engineDir = arguments.length > 0 ? arguments[0] : "libs/flow";
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var __flowEngineDir = String(new java.io.File(engineDir).getAbsolutePath());
var projectDirFile = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-smoke-project");
var persistentFrontendCacheDir = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"convertigo-flow-cache/frontend-documents-v1");
if (persistentFrontendCacheDir.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(persistentFrontendCacheDir);
}
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

function findNode(parent, predicate) {
	if (!parent) {
		return null;
	}
	if (predicate(parent)) {
		return parent;
	}
	var children = parent.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = findNode(children[i], predicate);
		if (found) {
			return found;
		}
	}
	return null;
}

var requestableServiceSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/requestable-service.js"), "UTF-8"));
var isolatedRequestableService = eval(requestableServiceSource);
assertTrue(isolatedRequestableService.runtimeSampleError({
	couchdb_output: {
		error: { text: "not_found" },
		reason: { text: "missing" },
		_c8oMeta: { statusCode: { text: "404" } }
	}
}) === "The requestable returned HTTP 404: missing.",
	"Requestable schema learning did not reject a CouchDB error envelope");
assertTrue(isolatedRequestableService.runtimeSampleError({ rows: [], total_rows: 0 }) === "",
	"Requestable schema learning rejected a valid empty read response");

var flowTreeServiceSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8"));
var isolatedFlowTreeService = eval(flowTreeServiceSource);
var embeddedInvalidBinding = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><PageShell id="page"><Children><ForEach id="rows" source={{ mode: "action", actionId: "load", path: "news" }} /></Children></PageShell></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedInvalidBinding.diagnostics.length === 1 &&
	embeddedInvalidBinding.diagnostics[0].code === "FRONTEND_BINDING_INVALID" &&
	embeddedInvalidBinding.diagnostics[0].suggestedBinding.source.actionId === "load" &&
	embeddedInvalidBinding.diagnostics[0].suggestedReference === "@load.news",
	"Embedded Flow Svelte projection did not reject and migrate an ad hoc action binding");
var embeddedCanonicalBinding = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><PageShell id="page"><Children><ForEach id="rows" source={{ mode: "source", source: { category: "requestable", actionId: "load" }, path: [{ kind: "property", name: "news" }] }} /></Children></PageShell></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedCanonicalBinding.diagnostics.length === 0,
	"Embedded Flow Svelte projection rejected a canonical structured binding");
var embeddedIntuitiveBinding = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><CallSequence id="load" requestable=".Load" /><ForEach id="rows" source="@load.news" context="row"><Children>',
	'    <Text id="title" source="@row.title" />',
	'  </Children></ForEach></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedIntuitiveBinding.diagnostics.length === 0,
	"Embedded Flow Svelte projection rejected intuitive action or lexical bindings");
var embeddedLiteralBinding = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><ForEach id="rows" source={[{id: "p1"}]} context="item"><Children><Text id="title" source="Static" /></Children></ForEach></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedLiteralBinding.diagnostics.length === 0,
	"Embedded Flow Svelte projection rejected literal binding attributes");
var embeddedActionExpression = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><CallSequence id="load" requestable=".Load"><Variables><Variable name="id" value={item.id} /></Variables></CallSequence></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedActionExpression.diagnostics.length === 1 &&
	embeddedActionExpression.diagnostics[0].code === "FRONTEND_ACTION_EXPRESSION_NOT_PORTABLE" &&
	embeddedActionExpression.diagnostics[0].suggestedReference === "@item.id",
	"Embedded Flow Svelte projection did not reject a client action expression with a source correction");
var embeddedDynamicMarker = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><CallSequence id="load" requestable=".Load" marker={item.id} /></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedDynamicMarker.diagnostics.length === 1 &&
	embeddedDynamicMarker.diagnostics[0].code === "FRONTEND_CALLSEQUENCE_MARKER_STATIC_REQUIRED" &&
	embeddedDynamicMarker.diagnostics[0].fix.value === "load",
	"Embedded Flow Svelte projection did not reject a dynamic CallSequence marker with a literal correction");
var embeddedUnknownBinding = isolatedFlowTreeService.embeddedFlowSvelteDocument("/smoke/+page.flow.svelte", [
	'<FlowComponent id="smoke" label="Smoke">',
	'  <Structure><Text id="title" source="@missing.title" /></Structure>',
	'</FlowComponent>'
].join("\n"));
assertTrue(embeddedUnknownBinding.diagnostics.length === 1 &&
	embeddedUnknownBinding.diagnostics[0].code === "FRONTEND_BINDING_REFERENCE_UNKNOWN",
	"Embedded Flow Svelte projection did not reject an unknown intuitive binding reference");

var flowCodeServiceFile = new java.io.File(engineDir, "modules/flow-code-service.js");
var flowCodeServiceSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(flowCodeServiceFile, "UTF-8"));
var isolatedFlowCodeService = eval(flowCodeServiceSource);
var isolatedFlowCodeEnv = {
	raise: function (code, message) {
		var error = new Error(message);
		error.code = code;
		throw error;
	},
	normalizeFlowScriptFunctionSyntax: function (code) { return String(code); },
	currentProjectName: function () { return "DraftSmoke"; },
	renderFlowScript: function () { return ""; },
	sha256Hex: function (code) { return "hash:" + String(code).length; },
	flowScriptValidateRequest: function () { return { ok: true, source: "version: 1\nnodes: []\n", definition: {}, diagnostics: [] }; },
	readProjectFlowWorkingCode: function () { return null; },
	writeProjectFlowWorkingCode: function (name, code) {
		return { name: name, code: code, revision: "dbo:" + String(code).length, file: "/draft/" + name + ".flow.js" };
	},
	discardProjectFlowWorkingCopy: function () { return false; },
	flowScriptGetRequest: function () {
		var error = new Error("missing");
		error.code = "UNKNOWN_FLOW";
		throw error;
	},
	normalizeFlowScriptCode: function (code) { return String(code); },
	stripFlowScriptMirrorHeader: function (code) { return String(code); },
	normalizeTree: function (value) { return value; }
};
var mirroredDraftCode = "function MirrorDraft({ result }) { result.ok = true; return result }\n";
var mirroredDraftSet = isolatedFlowCodeService.flowCodeDraftSetRequest({}, {}, "MirrorDraft", mirroredDraftCode, isolatedFlowCodeEnv);
var mirroredDraftRead = isolatedFlowCodeService.flowCodeDraftRead("MirrorDraft", isolatedFlowCodeEnv);
assertTrue(mirroredDraftSet.ok === true && mirroredDraftRead && mirroredDraftRead.code === mirroredDraftCode &&
	mirroredDraftRead.revision === mirroredDraftSet.revision,
	"FlowScript draft was not mirrored when a live DBO accepted the working copy");

var blockFileLoaderSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/block-file-loader-service.js"), "UTF-8"));
var isolatedBlockFileLoader = eval(blockFileLoaderSource);
var lazySourceReads = 0;
var lazyCompiles = 0;
var lazyBlocks = {};
var lazyFile = {
	getName: function () { return "lazy.block.js"; },
	getParentFile: function () { return null; },
	getAbsolutePath: function () { return "/smoke/lazy.block.js"; }
};
var lazyBlockEnv = {
	blockIdFromDescriptorFile: function () { return "smoke.lazy"; },
	readBlockArtifact: function () { return null; },
	writeBlockArtifact: function () {},
	blockSourceFingerprint: function () { return "lazy-source"; },
	blockCompilerFingerprint: "smoke",
	sourceForFile: function () {
		lazySourceReads++;
		return "const _meta = { runtime: 'flow' }; function lazy({ result }) { return result }";
	},
	extractFlowScriptBlockMeta: function () { return { meta: { runtime: "flow" } }; },
	flowScriptBlockMetaFromRequest: function () { return {}; },
	normalizeTree: function (value) { return value; },
	blockCodeRuntimeFromMeta: function (meta) { return meta.runtime; },
	flowScriptBlockDescriptorFromMeta: function (name, meta) {
		return { name: name, implementation: { runtime: meta.runtime }, props: {} };
	},
	graphBlockCatalog: function (descriptor) { return descriptor; },
	compileProjectBlockCode: function () {
		lazyCompiles++;
		return { descriptor: { name: "smoke.lazy", implementation: { runtime: "flow" }, props: {} } };
	},
	graphBlockFromDefinition: function () {
		return { name: "smoke.lazy", run: function () { return "lazy"; }, catalog: function () { return {}; } };
	},
	raise: function (code, message) { throw new Error(code + ": " + message); }
};
isolatedBlockFileLoader.reserveFlowScriptBlockFile(lazyBlocks, lazyFile, "project", "Smoke", null, lazyBlockEnv);
assertTrue(lazySourceReads === 0 && lazyCompiles === 0,
	"reserving a project block parsed or compiled its implementation eagerly");
lazyBlocks["smoke.lazy"].catalog();
assertTrue(lazySourceReads === 1 && lazyCompiles === 0,
	"reading lazy block metadata did not stay separate from implementation compilation");
isolatedBlockFileLoader.materializeFlowScriptBlock(lazyBlocks, "smoke.lazy", "rhino");
assertTrue(lazyCompiles === 0 && lazyBlocks["smoke.lazy"].__flowScriptPlaceholder === true,
	"targeted Rhino preparation compiled a Flow composite block");
isolatedBlockFileLoader.materializeFlowScriptBlock(lazyBlocks, "smoke.lazy");
assertTrue(lazyCompiles === 1 && lazyBlocks["smoke.lazy"].__flowScriptPlaceholder !== true,
	"lazy project block did not compile on first unrestricted materialization");

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
var budgetedCatalog = JSON.parse(engine.catalog(JSON.stringify({
	detail: "full",
	limit: 20,
	maxResponseKB: 1,
	minItems: 1,
	doc: false,
	hints: false
})));
assertTrue(budgetedCatalog.partial === true && budgetedCatalog.count >= 1 &&
	String(budgetedCatalog.nextCursor || "").indexOf("rb1.") === 0 &&
	budgetedCatalog.warnings[0].code === "PARTIAL_RESULT_SIZE_BUDGET",
	"catalog response budget did not stop descriptor materialization");
var resumedCatalog = JSON.parse(engine.catalog(JSON.stringify({
	detail: "full",
	limit: 1,
	cursor: budgetedCatalog.nextCursor,
	doc: false,
	hints: false
})));
assertTrue(resumedCatalog.count === 1, "catalog response cursor did not resume descriptor materialization");
print(JSON.stringify(catalog));
assertTrue(catalog.blocks.some(function (block) {
	return block.blockId === "requestable.call";
}), "catalog did not expose requestable.call");
var portableTrimCatalog = catalog.blocks.filter(function (block) {
	return block.blockId === "text.trim";
})[0];
var legacyBackendCatalog = catalog.blocks.filter(function (block) {
	return block.blockId === "requestable.call";
})[0];
assertTrue(portableTrimCatalog && portableTrimCatalog.targets.join(",") === "backend,frontend" &&
	portableTrimCatalog.effects.length === 0 &&
	portableTrimCatalog.implementations.backend.runtime === "rhino" &&
	portableTrimCatalog.implementations.frontend.runtime === "browser" &&
	portableTrimCatalog.implementations.frontend.file === "trim.browser.js",
	"portable block metadata did not expose both target implementations");
var portableCatalogBlocks = catalog.blocks.filter(function (block) {
	return block.targets && block.targets.indexOf("backend") !== -1 && block.targets.indexOf("frontend") !== -1;
});
var portableFixtureCount = JSON.parse(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "portable-axiom-fixtures.json"), "UTF-8"))).length;
assertTrue(portableCatalogBlocks.length === portableFixtureCount && portableCatalogBlocks.every(function (block) {
	var relativeFile = block.implementations && block.implementations.frontend && block.implementations.frontend.file;
	return relativeFile && new java.io.File(new java.io.File(block.file).getParentFile(), relativeFile).isFile();
}), "portable catalog blocks did not expose every fixture-backed browser implementation file");
assertTrue(legacyBackendCatalog.targets.join(",") === "backend" &&
	legacyBackendCatalog.effects.join(",") === "unspecified",
	"legacy backend blocks did not receive compatible target/effect defaults");
var compiledScriptsAfterCatalog = JSON.parse(engine.cacheInfo()).caches.compiledScripts;
assertTrue(compiledScriptsAfterCatalog.size > 0 && compiledScriptsAfterCatalog.misses > 0,
	"compiled script cache did not compile Rhino scripts");
var blockArtifactsAfterCatalog = JSON.parse(engine.cacheInfo()).caches.blockArtifacts;
var coreBlocksAfterCatalog = JSON.parse(engine.cacheInfo()).caches.coreBlocks;
var secondProjectDir = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "lib-flow-engine-smoke-project-2");
secondProjectDir.mkdirs();
var secondProjectPreload = JSON.parse(engine.preload(JSON.stringify({
	project: "SmokeProject2",
	projectDir: String(secondProjectDir.getAbsolutePath())
})));
var blockArtifactsAfterSecondProject = JSON.parse(engine.cacheInfo()).caches.blockArtifacts;
var coreBlocksAfterSecondProject = JSON.parse(engine.cacheInfo()).caches.coreBlocks;
assertTrue(secondProjectPreload.ok === true && secondProjectPreload.blockCount >= catalog.count &&
	(coreBlocksAfterSecondProject.hits > coreBlocksAfterCatalog.hits ||
		blockArtifactsAfterSecondProject.hits > blockArtifactsAfterCatalog.hits) &&
	blockArtifactsAfterSecondProject.misses === blockArtifactsAfterCatalog.misses,
	"a second project catalog reparsed core blocks instead of reusing global block artifacts: " +
	JSON.stringify({ preload: secondProjectPreload, artifactsBefore: blockArtifactsAfterCatalog,
		artifactsAfter: blockArtifactsAfterSecondProject, coreBefore: coreBlocksAfterCatalog, coreAfter: coreBlocksAfterSecondProject,
		catalogCount: catalog.count }));
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
var bindingType = catalog.types.filter(function (type) {
	return type.name === "binding";
})[0];
assertTrue(bindingType && bindingType.type === "object" && bindingType.editor &&
	String(bindingType.editor.component) === "flow-binding-editor" &&
	String(bindingType.editor.file).indexOf("binding.html") !== -1,
	"catalog did not expose the binding SmartType-style web editor");
var frontendCatalogServiceSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/frontend-catalog-service.js"), "UTF-8"));
var isolatedFrontendCatalogService = eval(frontendCatalogServiceSource);
var frontendDescriptors = isolatedFrontendCatalogService.frontendCreateDescriptorsForSettings("svelte", {}, {
	projectDir: function () { return null; }
});
var onMountDescriptor = frontendDescriptors.filter(function (descriptor) {
	return descriptor.id === "frontbuilder.svelte.onMount";
})[0];
assertTrue(onMountDescriptor && onMountDescriptor.properties.once &&
	onMountDescriptor.properties.once.type === "boolean",
	"frontend catalog did not expose the persistent OnMount once property");
var callSequenceDescriptor = frontendDescriptors.filter(function (descriptor) {
	return descriptor.id === "frontbuilder.svelte.callSequence";
})[0];
assertTrue(callSequenceDescriptor && callSequenceDescriptor.properties.marker &&
	callSequenceDescriptor.insert.marker === "",
	"frontend catalog did not expose the NGX-compatible CallSequence marker");
var requestableBindingSchema = {
	type: "object",
	properties: {
		news: {
			type: "array",
			items: { type: "object", properties: { title: { type: "string" } } }
		}
	}
};
var bindingSchemaDocument = {
	tree: {
		children: [{
			id: "feedItems",
			type: "ForEach",
			props: {
				kind: "each",
				source: {
					mode: "source",
					source: { category: "requestable", actionId: "getFeed" },
					path: [{ kind: "property", name: "news" }]
				}
			},
			propertyDefinitions: {
				source: { bindingSources: [{ id: "getFeed", source: { category: "requestable", actionId: "getFeed" } }] }
			},
			children: [{
				id: "title",
				propertyDefinitions: {
					source: { bindingSources: [{ id: "feedItems", source: { category: "iteration", scopeId: "feedItems", value: "item" } }] }
				}
			}]
		}]
	}
};
var enrichedBindingDocument = isolatedFrontendCatalogService.enrichBindingSources(bindingSchemaDocument, {
	getFeed: requestableBindingSchema
}, {
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	schemaPaths: function (schema) {
		return schema.properties && schema.properties.news ? ["news", "news[0]", "news[0].title"] : ["title"];
	},
	schemaArrayPaths: function (schema) { return schema.properties && schema.properties.news ? ["news"] : []; },
	schemaLeafEntries: function (schema) {
		return schema.properties && schema.properties.news ? [{ path: "news[0].title", type: "string" }] : [{ path: "title", type: "string" }];
	},
	schemaSimpleType: function (schema) { return schema && schema.type || "unknown"; },
	schemaAtPath: function (schema, path) {
		if (path === "news") return schema.properties.news;
		if (path === "news[0]") return schema.properties.news.items;
		if (path === "news[0].title") return schema.properties.news.items.properties.title;
		return schema.properties && schema.properties[path];
	}
});
var enrichedLoop = enrichedBindingDocument.tree.children[0];
var enrichedRequestable = enrichedLoop.propertyDefinitions.source.bindingSources[0];
var enrichedIteration = enrichedLoop.children[0].propertyDefinitions.source.bindingSources[0];
assertTrue(enrichedRequestable.paths.some(function (entry) { return entry.path === "news" && entry.type === "array"; }) &&
	enrichedIteration.paths.some(function (entry) { return entry.path === "title" && entry.type === "string"; }) &&
	enrichedIteration.schema.properties.title.type === "string",
	"frontend binding schemas did not propagate requestable array items into the lexical iteration scope");
enrichedLoop.children[0].propertyDefinitions.source.bindingSources.push({
	id: "feedItems:index",
	source: { category: "iteration", scopeId: "feedItems", value: "index" }
});
var enrichedBindingDocumentWithIndex = isolatedFrontendCatalogService.enrichBindingSources(enrichedBindingDocument, {
	getFeed: requestableBindingSchema
}, {
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	schemaPaths: function (schema) { return schema.type === "integer" ? [""] : ["title"]; },
	schemaArrayPaths: function () { return []; },
	schemaLeafEntries: function () { return []; },
	schemaSimpleType: function (schema) { return schema && schema.type || "unknown"; },
	schemaAtPath: function (schema) { return schema; }
});
var enrichedIndex = enrichedBindingDocumentWithIndex.tree.children[0].children[0].propertyDefinitions.source.bindingSources.filter(function (candidate) {
	return candidate.source && candidate.source.value === "index";
})[0];
assertTrue(enrichedIndex && enrichedIndex.schema.type === "integer" &&
	enrichedIndex.bindings[0].path === "" && enrichedIndex.bindings[0].binding.path.length === 0,
	"frontend binding schemas did not expose the lexical iteration index as an integer root binding");
var fullSyncBindingDocument = JSON.parse(JSON.stringify(bindingSchemaDocument));
var fullSyncLoop = fullSyncBindingDocument.tree.children[0];
fullSyncLoop.props.source.source = { category: "fullsync", actionId: "rootCatalog", operation: "view" };
fullSyncLoop.propertyDefinitions.source.bindingSources[0] = {
	id: "rootCatalog",
	source: { category: "fullsync", actionId: "rootCatalog", operation: "view" }
};
var enrichedFullSyncDocument = isolatedFrontendCatalogService.enrichBindingSources(fullSyncBindingDocument, {
	rootCatalog: requestableBindingSchema
}, {
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	schemaPaths: function (schema) {
		return schema.properties && schema.properties.news ? ["news", "news[0]", "news[0].title"] : ["title"];
	},
	schemaArrayPaths: function (schema) { return schema.properties && schema.properties.news ? ["news"] : []; },
	schemaLeafEntries: function (schema) {
		return schema.properties && schema.properties.news ? [{ path: "news[0].title", type: "string" }] : [{ path: "title", type: "string" }];
	},
	schemaSimpleType: function (schema) { return schema && schema.type || "unknown"; },
	schemaAtPath: function (schema, path) {
		if (path === "news") return schema.properties.news;
		if (path === "news[0]") return schema.properties.news.items;
		if (path === "news[0].title") return schema.properties.news.items.properties.title;
		return schema.properties && schema.properties[path];
	}
});
var enrichedFullSyncIteration = enrichedFullSyncDocument.tree.children[0].children[0].propertyDefinitions.source.bindingSources[0];
assertTrue(enrichedFullSyncIteration.paths.some(function (entry) {
	return entry.path === "title" && entry.type === "string";
}), "frontend binding schemas did not propagate FullSync array items into the lexical iteration scope");
var stateBindingDocument = JSON.parse(JSON.stringify(bindingSchemaDocument));
stateBindingDocument.model = {
	clientActions: [{
		id: "appendBreadcrumb",
		kind: "updateList",
		target: "breadcrumbs",
		operation: "append",
		value: {
			mode: "source",
			source: { category: "iteration", scopeId: "feedItems", value: "item" },
			path: []
		}
	}, {
		id: "clearBreadcrumb",
		kind: "updateList",
		target: "breadcrumbs",
		operation: "set",
		value: { mode: "literal", value: [] }
	}]
};
stateBindingDocument.tree.children.push({
	id: "breadcrumbs",
	type: "ForEach",
	props: {
		kind: "each",
		source: {
			mode: "source",
			source: { category: "action", actionId: "breadcrumbs" },
			path: []
		}
	},
	children: [{
		id: "breadcrumbLabel",
		propertyDefinitions: {
			source: { bindingSources: [{
				id: "breadcrumbs",
				source: { category: "iteration", scopeId: "breadcrumbs", value: "item" }
			}] }
		}
	}]
});
var enrichedStateBinding = isolatedFrontendCatalogService.enrichBindingSources(stateBindingDocument, {
	getFeed: requestableBindingSchema
}, {
	normalizeTree: function (value) { return JSON.parse(JSON.stringify(value)); },
	schemaPaths: function (schema) {
		return schema.properties && schema.properties.news ? ["news", "news[0]", "news[0].title"] : ["title"];
	},
	schemaArrayPaths: function (schema) { return schema.properties && schema.properties.news ? ["news"] : []; },
	schemaLeafEntries: function (schema) {
		return schema.properties && schema.properties.news ? [{ path: "news[0].title", type: "string" }] : [{ path: "title", type: "string" }];
	},
	schemaSimpleType: function (schema) { return schema && schema.type || "unknown"; },
	schemaAtPath: function (schema, path) {
		if (path === "news") return schema.properties.news;
		if (path === "news[0]") return schema.properties.news.items;
		if (path === "news[0].title") return schema.properties.news.items.properties.title;
		return schema.properties && schema.properties[path];
	}
});
var enrichedStateIteration = enrichedStateBinding.tree.children[1].children[0].propertyDefinitions.source.bindingSources[0];
assertTrue(enrichedStateIteration.paths.some(function (entry) {
	return entry.path === "title" && entry.type === "string";
}), "frontend binding schemas did not propagate an iterator item through UpdateList state into a second iterator");
assertTrue(catalog.types.some(function (type) {
	return type.name === "configOverrides" && type.editor && String(type.editor.file).indexOf("configOverrides.html") !== -1;
}), "catalog did not expose configOverrides type editor resources");
var typeListApi = JSON.parse(engine.types("{}"));
assertTrue(typeListApi.ok === true && typeListApi.types.some(function (type) {
	return type.name === "requestable";
}), "types API did not expose core property types");
var referencedProjectDir = new java.io.File(projectDirFile.getParentFile(), "c8oprj-lib-flow-process");
if (referencedProjectDir.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(referencedProjectDir);
}
var referencedBlocksDir = new java.io.File(referencedProjectDir, "libs/flow/blocks/process");
referencedBlocksDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(projectDirFile, "c8oProject.yaml"), [
	"↓SmokeProject [core.Project]:",
	"  ↓lib_flow_process_reference [references.ProjectSchemaReference]:",
	"    projectName: lib_flow_process",
	""
].join("\n"), "UTF-8");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(referencedBlocksDir, "echo.block.js"), [
	"const _meta = {",
	"  version: 1,",
	"  description: \"Referenced smoke block.\",",
	"  properties: {",
	"    value: { kind: \"template\", type: \"string\" }",
	"  },",
	"  outputs: { out: { type: \"string\" } },",
	"  visibility: \"internal\"",
	"}",
	"",
	"function process_echo({ input }) {",
	"  return input.value",
	"}",
	""
].join("\n"), "UTF-8");
var referencedBlockFlowScriptSource = [
	"function ReferencedBlockSmoke({ input, result }) {",
	"\tvar value = process.echo({ value: \"reference-ok\" })",
	"\tresult.value = value",
	"\treturn result",
	"}",
	""
].join("\n");
var portableTrimFlowScriptSource = [
	"function PortableTrimSmoke({ result }) {",
	"\tconst value = text.trim({ text: \"  portable  \" })",
	"\tresult.value = value",
	"\treturn result",
	"}",
	""
].join("\n");
var portableTrimValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "PortableTrimSmoke",
	code: portableTrimFlowScriptSource,
	target: "backend"
})));
assertTrue(portableTrimValidation.ok === true, "portable text.trim did not validate for backend");
var portableTrimRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: portableTrimFlowScriptSource,
	includeTrace: false
})));
assertTrue(portableTrimRun.result.value === "portable", "portable text.trim Rhino implementation returned the wrong value");
var portableFixtureFile = new java.io.File(engineDir, "portable-axiom-fixtures.json");
var portableFixtures = JSON.parse(String(Packages.org.apache.commons.io.FileUtils.readFileToString(portableFixtureFile, "UTF-8")));
portableFixtures.forEach(function (fixture, index) {
	var variable = "portable" + index;
	var source = [
		"function PortableFixture" + index + "({ result }) {",
		"\tconst " + variable + " = " + fixture.block + "(" + JSON.stringify(fixture.input) + ")",
		"\tresult.value = " + variable,
		"\treturn result",
		"}",
		""
	].join("\n");
	var validation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
		name: "PortableFixture" + index,
		code: source,
		target: "backend"
	})));
	assertTrue(validation.ok === true, "portable fixture did not validate: " + fixture.block + " " + JSON.stringify(validation.diagnostics));
	var run = JSON.parse(engine.run(JSON.stringify({ flowSource: source, includeTrace: false })));
	assertTrue(run.ok === true && JSON.stringify(run.result.value) === JSON.stringify(fixture.expected),
		"portable Rhino fixture mismatch for " + fixture.block + ": " + JSON.stringify(run));
});
var frontendTargetValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "BackendOnlyTargetSmoke",
	code: [
		"function BackendOnlyTargetSmoke({ result }) {",
		"\tresult.value = requestable.call({ requestable: \".Get\" })",
		"\treturn result",
		"}",
		""
	].join("\n"),
	target: "frontend"
})));
assertTrue(frontendTargetValidation.ok === false && frontendTargetValidation.diagnostics.some(function (diagnostic) {
	return diagnostic.code === "BLOCK_NOT_AVAILABLE_ON_TARGET" && diagnostic.block === "requestable.call";
}), "frontend validation did not reject a backend-only block with a structured diagnostic");
var referencedBlockValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ReferencedBlockSmoke",
	code: referencedBlockFlowScriptSource
})));
assertTrue(referencedBlockValidation.ok === true &&
	referencedBlockValidation.definition.nodes[0].block === "process.echo",
	"c8oprj-prefixed referenced project blocks were not available to Flow validation");
var referencedBlockRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: referencedBlockFlowScriptSource,
	includeTrace: false
})));
assertTrue(referencedBlockRun.result.value === "reference-ok",
	"c8oprj-prefixed referenced project block did not execute correctly");
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
var flowPlanCacheBeforeRepeat = JSON.parse(engine.cacheInfo()).caches.flowPlans;
var naturalRunRepeat = JSON.parse(engine.run(JSON.stringify({
	flowSource: naturalFlowScriptSource,
	includeTrace: false
})));
var flowPlanCacheAfterRepeat = JSON.parse(engine.cacheInfo()).caches.flowPlans;
assertTrue(naturalRunRepeat.result.first === "b" && naturalRunRepeat.result.encoded === "[\"a\",\"b\"]" &&
	flowPlanCacheAfterRepeat.hits > flowPlanCacheBeforeRepeat.hits,
	"repeated Flow execution did not reuse its compiled plan");
assertTrue(naturalRun.result.first === "b" && naturalRun.result.encoded === "[\"a\",\"b\"]",
	"natural FlowScript syntax did not execute correctly");
var earlyReturnFlowScriptSource = [
	"function EarlyReturnSmoke({ input, result }) {",
	"\tif (input.skip) {",
	"\t\tresult.message = \"skipped\"",
	"\t\treturn result",
	"\t}",
	"\tresult.message = \"continued\"",
	"\treturn result",
	"}",
	""
].join("\n");
var earlyReturnValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "EarlyReturnSmoke",
	code: earlyReturnFlowScriptSource
})));
assertTrue(earlyReturnValidation.ok === true &&
	earlyReturnValidation.definition.nodes[0].block === "if" &&
	earlyReturnValidation.definition.nodes[0].then[1].block === "return" &&
	earlyReturnValidation.definition.nodes.length === 2,
	"nested return result did not compile to the core early-return block");
var earlyReturnRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: earlyReturnFlowScriptSource,
	input: { skip: true },
	includeTrace: false
})));
assertTrue(earlyReturnRun.result.message === "skipped",
	"nested return result did not stop FlowScript execution");
var nestedProjectionFlowScriptSource = [
	"function NestedProjectionSmoke({ input, result }) {",
	"\tvar items = list.map({",
	"\t\titems: input.items,",
	"\t\tselect: { name: object.get({ source: current, key: \"name\" }) }",
	"\t})",
	"\tresult.items = items",
	"\treturn result",
	"}",
	""
].join("\n");
var nestedProjectionRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: nestedProjectionFlowScriptSource,
	input: { items: [{ name: "Category" }] },
	includeTrace: false
})));
assertTrue(nestedProjectionRun.ok === true && nestedProjectionRun.result.items[0].name === "Category",
	"nested Flow block calls in list.map object projections did not execute per item: " + JSON.stringify(nestedProjectionRun));
var nestedProjectionTraceRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: nestedProjectionFlowScriptSource,
	input: { items: Array.apply(null, Array(1000)).map(function (_, index) { return { name: "Category " + index }; }) },
	includeTrace: true
})));
assertTrue(nestedProjectionTraceRun.ok === true && nestedProjectionTraceRun.result.items.length === 1000,
	"nested Flow block calls did not preserve all mapped results with tracing enabled");
assertTrue(nestedProjectionTraceRun.trace.nodes.length < 10 &&
	nestedProjectionTraceRun.trace.nodes.every(function (entry) { return entry.block !== "object.get"; }),
	"trace:false nested calls retained one internal trace per mapped item: " + nestedProjectionTraceRun.trace.nodes.length);
var objectValuesRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"function ObjectValuesSmoke({ input, result }) {",
		"\tvar values = object.values({ source: input.map })",
		"\tresult.values = values",
		"\treturn result",
		"}",
		""
	].join("\n"),
	input: { map: { first: "Menu", second: "NEWS" } },
	includeTrace: false
})));
assertTrue(objectValuesRun.ok === true && objectValuesRun.result.values.join(",") === "Menu,NEWS",
	"object.values did not preserve object values as an array: " + JSON.stringify(objectValuesRun));
assertTrue(naturalRun.trace === undefined,
	"includeTrace false should skip runtime trace materialization");
var naturalTraceRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: naturalFlowScriptSource,
	includeTrace: true
})));
assertTrue(naturalTraceRun.trace && naturalTraceRun.trace.nodes && naturalTraceRun.trace.nodes.length > 0,
	"includeTrace true should keep the runtime trace available");
var structuredMapFlowScriptSource = [
	"function StructuredMapSmoke({ result }) {",
	"\tvar rows = [{ title: \"first\", detail: { url: \"one\" } }, { title: \"second\", detail: { url: \"two\" } }]",
	"\tvar projected = list.map({ items: rows, select: { title: current.title, url: current.detail.url } })",
	"\tresult.items = projected",
	"\treturn result",
	"}",
	""
].join("\n");
var structuredMapValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "StructuredMapSmoke",
	code: structuredMapFlowScriptSource
})));
assertTrue(structuredMapValidation.ok === true && structuredMapValidation.definition.nodes[1].block === "list.map" &&
	structuredMapValidation.definition.nodes.length === 3,
	"structured list.map was not preserved as one executable Flow block");
var structuredMapRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: structuredMapFlowScriptSource,
	includeTrace: false
})));
assertTrue(structuredMapRun.result.items.length === 2 &&
	structuredMapRun.result.items[0].title === "first" && structuredMapRun.result.items[0].url === "one" &&
	structuredMapRun.result.items[1].title === "second" && structuredMapRun.result.items[1].url === "two",
	"structured list.map projection did not preserve its result");
var objectMapFlowScriptSource = [
	"function ObjectMapSmoke({ result }) {",
	"\tconst rates = { EUR: { rate: 1, label: \"Euro\" }, USD: { rate: 1.1, label: \"Dollar\" } }",
	"\tconst codes = object.keys({ source: rates })",
	"\tconst first = object.firstEntry({ source: rates })",
	"\tconst info = object.get({ source: rates, key: first.key })",
	"\tresult.codes = codes",
	"\tresult.firstCode = first.key",
	"\tresult.label = info.label",
	"\treturn result",
	"}",
	""
].join("\n");
var objectMapValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ObjectMapSmoke",
	code: objectMapFlowScriptSource
})));
assertTrue(objectMapValidation.ok === true &&
	objectMapValidation.definition.nodes[1].block === "object.keys" &&
	objectMapValidation.definition.nodes[2].block === "object.firstEntry" &&
	objectMapValidation.definition.nodes[3].block === "object.get",
	"object map FlowScript did not compile to object.* blocks");
var objectMapRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: objectMapFlowScriptSource,
	includeTrace: false
})));
assertTrue(objectMapRun.result.codes.join(",") === "EUR,USD" &&
	objectMapRun.result.firstCode === "EUR" &&
	objectMapRun.result.label === "Euro",
	"object map FlowScript did not run object.keys/object.firstEntry/object.get correctly");
var objectMapAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: objectMapFlowScriptSource })));
assertTrue(objectMapAnalysis.schemas["local.codes"].items.type === "string" &&
	objectMapAnalysis.schemas["local.first"].properties.value.properties.label.type === "string" &&
	objectMapAnalysis.schemas["local.info"].properties.label.type === "string",
	"object map FlowScript did not propagate object.* schemas");
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
var declaredInputOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({
	flowSource: declaredInputFlowScriptSource
})));
assertTrue(declaredInputOutputSchema.ok === true &&
	declaredInputOutputSchema.schema.properties.value.type === "string",
	"Declared FlowScript input schemas did not propagate to result output schema");
var emptyArrayMergeFlowScriptSource = [
	"function EmptyArrayMergeSchemaSmoke({ input, result }) {",
	"\tvar names = [\"Ada\", \"Grace\"]",
	"\tresult.names = names",
	"\tresult.names = []",
	"\treturn result",
	"}",
	""
].join("\n");
var emptyArrayMergeOutputSchema = JSON.parse(engine.outputSchema(JSON.stringify({
	flowSource: emptyArrayMergeFlowScriptSource
})));
assertTrue(emptyArrayMergeOutputSchema.ok === true &&
	emptyArrayMergeOutputSchema.schema.properties.names.type === "array" &&
	emptyArrayMergeOutputSchema.schema.properties.names.items.type === "string",
	"Empty array writes downgraded an existing array item schema");
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
var outputOnlyInputSync = JSON.parse(engine.syncInputs(JSON.stringify({
	project: "SmokeProject",
	flowName: "OutputOnlyContractSmoke",
	flowQName: "SmokeProject.OutputOnlyContractSmoke",
	projectDir: String(projectDirFile.getAbsolutePath()),
	flowSource: [
		"const _flow = { outputs: { ready: { type: \"boolean\" } } }",
		"function OutputOnlyContractSmoke({ result }) {",
		"\tunknown.block({ value: true })",
		"\tresult.ready = true",
		"\treturn result",
		"}",
		""
	].join("\n")
})));
assertTrue(outputOnlyInputSync.ok === true &&
	outputOnlyInputSync.metadataOnly === true &&
	Object.keys(outputOnlyInputSync.inputDefinitions).length === 0,
	"syncInputs compiled an output-only FlowScript instead of using its top-level metadata");
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

var duplicateVirtualTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "flow",
	flowSource: [
		"version: 1",
		"inputs:",
		"  query: { type: string }",
		"outputs:",
		"  items: { type: array }",
		"nodes:",
		"  - id: same",
		"    block: set",
		"    props: { path: local.first, value: 1 }",
		"  - id: same",
		"    block: set",
		"    props: { path: local.second, value: 2 }",
		""
	].join("\n"),
	detail: "full"
})));
var duplicateVirtualFlow = findChild(duplicateVirtualTree, "flow");
assertTrue(findChild(duplicateVirtualTree, "inputs") !== null && findChild(duplicateVirtualTree, "outputs") !== null,
	"Flow tree did not expose declared Inputs and Outputs");
assertTrue(duplicateVirtualFlow.children.length === 2 &&
	duplicateVirtualFlow.children[0].name !== duplicateVirtualFlow.children[1].name,
	"Flow tree reused a virtual QName when business node ids were duplicated");
var duplicateVirtualInfo = JSON.parse(duplicateVirtualFlow.children[0].info || "{}");
assertTrue(duplicateVirtualInfo.propertyDefinitions.value.editorClass === "flow-value-editor",
	"Flow tree did not propagate the declared type editor to virtual properties");
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
var budgetedResourceSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "resource",
	answerBefore: 1,
	minItems: 1,
	limit: 10,
	doc: false,
	hints: false
})));
assertTrue(budgetedResourceSearch.partial === true && budgetedResourceSearch.count === 1 &&
	String(budgetedResourceSearch.nextCursor || "").indexOf("rb1.") === 0 &&
	budgetedResourceSearch.warnings[0].code === "PARTIAL_RESULT_TIME_BUDGET",
	"resource search did not interrupt file reads at answerBefore");
var resumedResourceSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "resource",
	cursor: budgetedResourceSearch.nextCursor,
	limit: 10,
	doc: false,
	hints: false
})));
assertTrue(resumedResourceSearch.ok === true,
	"resource search did not resume from its opaque scan cursor");
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
var publicResourceGet = JSON.parse(engine.blockGet(JSON.stringify({ name: "resource.get" })));
assertTrue(catalog.blocks.some(function (block) {
	return block.blockId === "resource.get" && block.private === false;
}) && publicResourceGet.block.outputs.out.leafPaths.some(function (leaf) {
	return leaf.path === "content" && leaf.type === "string";
}) && !publicResourceGet.block.properties.projectDir,
	"resource.get should be a discoverable typed fixture reader");
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
var flowEngineConfigFile = new java.io.File(projectDirFile, "libs/flow/engine.yaml");
flowEngineConfigFile.getParentFile().mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(flowEngineConfigFile, [
	"version: 1",
	"engineQName: lib_flow_engine.Engine",
	"bindings: {}",
	"config: {}",
	""
].join("\n"), "UTF-8");
var projectConfigSearch = JSON.parse(engine.resourceSearch(JSON.stringify({
	query: "engineQName",
	doc: false,
	hints: false
})));
assertTrue(projectConfigSearch.resources.some(function (resource) {
	return resource.path === "libs/flow/engine.yaml" && resource.kind === "projectConfig";
}), "resourceSearch did not include project Flow engine config");
var projectConfigGet = JSON.parse(engine.resourceGet(JSON.stringify({
	path: "libs/flow/engine.yaml"
})));
assertTrue(projectConfigGet.kind === "projectConfig" &&
	projectConfigGet.content.indexOf("engineQName: lib_flow_engine.Engine") !== -1,
	"resourceGet did not read project Flow engine config");
var projectConfigPatch = JSON.parse(engine.resourcePatch(JSON.stringify({
	path: "libs/flow/engine.yaml",
	baseHash: projectConfigGet.hash,
	patch: [
		"--- a/libs/flow/engine.yaml",
		"+++ b/libs/flow/engine.yaml",
		"@@ -1,4 +1,6 @@",
		" version: 1",
		" engineQName: lib_flow_engine.Engine",
		" bindings: {}",
		"-config: {}",
		"+config:",
		"+  services:",
		"+    weatherUrl: https://example.invalid/forecast"
	].join("\n")
})));
assertTrue(projectConfigPatch.ok === true && projectConfigPatch.validation.kind === "projectConfig",
	"resourcePatch did not patch project Flow engine config: " + JSON.stringify(projectConfigPatch));
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
	"\t\t\"options\": {",
	"\t\t\t\"kind\": \"literal\",",
	"\t\t\t\"type\": \"object\",",
	"\t\t\t\"properties\": { \"enabled\": { \"type\": \"boolean\" } },",
	"\t\t\t\"required\": [\"enabled\"],",
	"\t\t\t\"additionalProperties\": false",
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
	canonicalProps.value && canonicalProps.value.kind === "value" &&
	canonicalProps.options.properties.enabled.type === "boolean" &&
	canonicalProps.options.required[0] === "enabled" &&
	canonicalProps.options.additionalProperties === false,
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
var frontendOnlyCodeSource = [
	"const _meta = {",
	"  \"version\": 1,",
	"  \"description\": \"Frontend-only portable smoke block.\",",
	"  \"targets\": [\"frontend\"],",
	"  \"effects\": [],",
	"  \"implementations\": { \"frontend\": { \"runtime\": \"browser\", \"file\": \"normalize.browser.js\" } },",
	"  \"properties\": { \"value\": { \"kind\": \"value\", \"type\": \"string\" } },",
	"  \"outputs\": { \"out\": { \"type\": \"string\" } },",
	"  \"mock\": true,",
	"  \"todo\": \"Implement browser target.\",",
	"  \"tags\": [\"mock\", \"todo\"]",
	"}",
	"",
	"function normalize({ input }) { return input.value }",
	""
].join("\n");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({ name: "smoke.normalize", code: frontendOnlyCodeSource }))).ok === true,
	"blockCodeSet did not create the canonical frontend-only block contract");
var frontendWrite = JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.normalize",
	target: "frontend",
	code: "function (input) { return String(input.value || '').trim() }",
	finalize: true
})));
assertTrue(frontendWrite.ok === true && frontendWrite.target === "frontend" && frontendWrite.finalized === true,
	"blockCodeSet did not write and finalize the browser implementation: " + JSON.stringify(frontendWrite));
var frontendRead = JSON.parse(engine.blockCodeGet(JSON.stringify({ name: "smoke.normalize", target: "frontend" })));
assertTrue(frontendRead.ok === true && frontendRead.code.indexOf("trim()") !== -1 && frontendRead.revision === frontendWrite.revision,
	"blockCodeGet did not return browser code and its revision");
var frontendInvalid = JSON.parse(engine.blockCodeCheck(JSON.stringify({
	name: "smoke.normalize", target: "frontend", code: "function () { return Packages.java.lang.System }"
})));
assertTrue(frontendInvalid.ok === false && frontendInvalid.diagnostics[0].code === "FRONTEND_BLOCK_RUNTIME_FORBIDDEN",
	"blockCodeCheck did not reject JVM APIs in browser code");
var frontendPatch = JSON.parse(engine.blockCodePatch(JSON.stringify({
	name: "smoke.normalize",
	target: "frontend",
	revision: frontendRead.revision,
	code: "function (input) { return String(input.value || '').trim().toLowerCase() }"
})));
assertTrue(frontendPatch.ok === true && frontendPatch.oldRevision === frontendRead.revision,
	"blockCodePatch did not update revision-checked browser code");
var finalizedFrontendDescriptor = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(projectDirFile, "libs/flow/blocks/smoke/normalize.block.js"), "UTF-8"));
assertTrue(finalizedFrontendDescriptor.indexOf('"mock": true') === -1 && finalizedFrontendDescriptor.indexOf('"mock"') === -1,
	"finalizing a frontend-only block did not remove mock metadata");
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
var sourceMutationBlockSource = [
	"const _meta = {",
	"\t\"description\": \"FlowScript block source mutation smoke.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"one\": { \"type\": \"string\" },",
	"\t\t\"two\": { \"type\": \"string\" }",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"object\"",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function sourceMutation({ input, result }) {",
	"\tresult.one = input.one",
	"\treturn result",
	"}",
	""
].join("\n");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.sourceMutation",
	code: sourceMutationBlockSource
}))).ok === true, "blockCodeSet did not create sourceMutation");
var sourceMutationFile = new java.io.File(projectDirFile, "libs/flow/blocks/smoke/sourceMutation.block.js");
var sourceMutationResponse = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(sourceMutationFile.getAbsolutePath()),
	sourcePath: String(sourceMutationFile.getAbsolutePath()),
	flowSource: sourceMutationBlockSource,
	projectDir: String(projectDirFile.getAbsolutePath()),
	mutation: {
		op: "append",
		path: "nodes",
		value: {
			id: "setTwo",
			block: "set",
			path: "result.two",
			value: "{{ input.two }}"
		}
	}
})));
assertTrue(sourceMutationResponse.ok === true &&
	sourceMutationResponse.format === "blockjs" &&
	sourceMutationResponse.name === "smoke.sourceMutation" &&
	sourceMutationResponse.source.indexOf("const _meta") !== -1 &&
	sourceMutationResponse.source.indexOf("FlowScript block source mutation smoke.") !== -1 &&
	sourceMutationResponse.source.indexOf("function sourceMutation") !== -1 &&
	sourceMutationResponse.source.indexOf("function Flow") === -1,
	"applySourceMutation did not preserve canonical FlowScript block source");
var stringLatitudeBlockSource = [
	"const _meta = {",
	"\t\"description\": \"Block with an intentionally narrow latitude contract.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"latitude\": { \"type\": \"string\" }",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": { \"type\": \"object\" }",
	"\t}",
	"}",
	"",
	"function stringLatitude({ input }) {",
	"\treturn { latitude: input.latitude }",
	"}",
	""
].join("\n");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.stringLatitude",
	code: stringLatitudeBlockSource
}))).ok === true, "blockCodeSet did not create stringLatitude");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(flowEngineConfigFile, [
	"version: 1",
	"engineQName: lib_flow_engine.Engine",
	"bindings: {}",
	"config:",
	"  timezones:",
	"    representatives:",
	"      - city: Paris",
	"        latitude: 48.8566",
	""
].join("\n"), "UTF-8");
var propertyTypeMismatchFlowScriptSource = [
	"function PropertyTypeMismatchSmoke({ input, result }) {",
	"\tvar places = config.timezones.representatives",
	"\tvar items = list.map({ items: places, select: smoke.stringLatitude({ latitude: current.latitude }) })",
	"\tresult.items = items",
	"\treturn result",
	"}",
	""
].join("\n");
var propertyTypeMismatchValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "PropertyTypeMismatchSmoke",
	code: propertyTypeMismatchFlowScriptSource,
	maxDiagnostics: 25
})));
assertTrue(propertyTypeMismatchValidation.ok === true &&
	propertyTypeMismatchValidation.diagnostics.some(function (diagnostic) {
		return diagnostic.code === "FLOWSCRIPT_PROPERTY_TYPE_MISMATCH" &&
			diagnostic.block === "smoke.stringLatitude" &&
			diagnostic.property === "latitude" &&
			diagnostic.path === "current.latitude" &&
			diagnostic.expected === "string" &&
			diagnostic.actual === "number" &&
			diagnostic.next.indexOf("_meta.properties.latitude.type to number") !== -1 &&
			diagnostic.hint.indexOf("block contract feedback") !== -1;
	}), "FlowScript property type mismatch warning was not reported");
var unknownDomainBlockFlowScriptSource = [
	"function UnknownDomainBlockSmoke({ input, config, result }) {",
	"\tvar item = domain.fetchWeatherItem({ zone: input.zone, forecastUrl: config.services.weather.forecastUrl })",
	"\tresult.item = item",
	"\treturn result",
	"}",
	""
].join("\n");
var unknownDomainBlockValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "UnknownDomainBlockSmoke",
	code: unknownDomainBlockFlowScriptSource,
	maxDiagnostics: 25
})));
assertTrue(unknownDomainBlockValidation.ok === false &&
	unknownDomainBlockValidation.diagnostics.some(function (diagnostic) {
		return diagnostic.code === "UNKNOWN_BLOCK" &&
			diagnostic.message === "Unknown Flow block: domain.fetchWeatherItem" &&
			diagnostic.mock &&
			diagnostic.mock.tool === "flow-block-mock" &&
			diagnostic.mock.name === "domain.fetchWeatherItem" &&
			diagnostic.candidateDecision &&
			diagnostic.candidateDecision.recommendation === "mock" &&
			diagnostic.candidateDecision.bestScore < diagnostic.candidateDecision.preferExistingScore &&
			diagnostic.create &&
			diagnostic.create.tool === "flow-block-mock" &&
			diagnostic.create.candidateTool === "flow-block-get" &&
			diagnostic.next.indexOf("flow-block-mock") !== -1 &&
			diagnostic.next.indexOf("typed properties") !== -1 &&
			diagnostic.hint.indexOf("flow-block-mock-list") !== -1;
	}), "FlowScript unknown domain block did not guide toward a typed project mock");
var existingCandidateFlowScriptSource = [
	"function ExistingCandidateSmoke({ input, result }) {",
	"\tvar value = requestable.cal({ requestable: input.requestable })",
	"\tresult.value = value",
	"\treturn result",
	"}",
	""
].join("\n");
var existingCandidateValidation = JSON.parse(engine.flowSourceValidate(JSON.stringify({
	name: "ExistingCandidateSmoke",
	code: existingCandidateFlowScriptSource,
	maxDiagnostics: 25
})));
assertTrue(existingCandidateValidation.ok === false &&
	existingCandidateValidation.diagnostics.some(function (diagnostic) {
		return diagnostic.code === "UNKNOWN_BLOCK" &&
			diagnostic.message === "Unknown Flow block: requestable.cal" &&
			diagnostic.candidateDecision &&
			diagnostic.candidateDecision.recommendation === "existing" &&
			diagnostic.candidateDecision.bestBlock === "requestable.call" &&
			diagnostic.candidateDecision.bestScore >= diagnostic.candidateDecision.preferExistingScore &&
			diagnostic.create &&
			diagnostic.create.tool === "flow-block-get" &&
			diagnostic.create.block === "requestable.call" &&
			diagnostic.create.alternativeTool === "flow-block-mock";
	}), "FlowScript unknown close block did not guide toward the scored existing candidate");
var declaredResponseBlockSource = [
	"const _meta = {",
	"\t\"description\": \"FlowScript block with a declared returned response schema.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {},",
	"\t\"outputs\": {",
	"\t\t\"out\": {",
	"\t\t\t\"type\": \"object\",",
	"\t\t\t\"properties\": {",
	"\t\t\t\t\"ok\": { \"type\": \"boolean\" },",
	"\t\t\t\t\"events\": {",
	"\t\t\t\t\t\"type\": \"array\",",
	"\t\t\t\t\t\"items\": {",
	"\t\t\t\t\t\t\"type\": \"object\",",
	"\t\t\t\t\t\t\"properties\": {",
	"\t\t\t\t\t\t\t\"type\": { \"type\": \"string\" }",
	"\t\t\t\t\t\t}",
	"\t\t\t\t\t}",
	"\t\t\t\t}",
	"\t\t\t}",
	"\t\t}",
	"\t}",
	"}",
	"",
	"function declaredResponse({ input, result }) {",
	"\tvar response = json.object({ id: \"response\" }) {",
	"\t\tjson.field({ id: \"ok\", key: \"ok\", value: input.ok })",
	"\t\tjson.field({ id: \"events\", key: \"events\", value: input.events })",
	"\t}",
	"\treturn response",
	"}",
	""
].join("\n");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.declaredResponse",
	code: declaredResponseBlockSource
}))).ok === true, "blockCodeSet did not create declaredResponse");
var declaredResponseContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: declaredResponseBlockSource,
	sourceBlockName: "smoke.declaredResponse",
	node: "returnValue",
	include: ["local"],
	detail: "normal"
})));
assertTrue(declaredResponseContext.scopes.local.paths.some(function (entry) {
	return entry.path === "local.response.events[0].type" && entry.type === "string";
}), "Flow block context did not apply the declared public output schema to the returned local value");
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
var httpInputUrlFile = new java.io.File(projectDirFile, "flow-http-input-url-smoke.txt");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(httpInputUrlFile, "Flow HTTP input URL smoke", "UTF-8");
var httpInputUrlCodeSource = [
	"const _meta = {",
	"\t\"description\": \"Reads an URL received through block input.\",",
	"\t\"runtime\": \"flow\",",
	"\t\"properties\": {",
	"\t\t\"url\": { \"kind\": \"expression\", \"type\": \"string\" }",
	"\t},",
	"\t\"outputs\": {",
	"\t\t\"out\": { \"type\": \"string\" }",
	"\t}",
	"}",
	"",
	"function httpInputUrl({ input }) {",
	"\tvar page = http.get({ url: input.url })",
	"\treturn page.text",
	"}",
	""
].join("\n");
assertTrue(JSON.parse(engine.blockCodeSet(JSON.stringify({
	name: "smoke.httpInputUrl",
	code: httpInputUrlCodeSource
}))).ok === true, "blockCodeSet did not create httpInputUrl");
var httpInputUrlRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: url",
		"    block: set",
		"    path: local.url",
		"    value: " + JSON.stringify(String(httpInputUrlFile.toURI().toURL())),
		"  - id: read",
		"    block: smoke.httpInputUrl",
		"    url: local.url",
		"    out: result.text",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(httpInputUrlRun.result.text === "Flow HTTP input URL smoke",
	"http.get shortcut lost the caller input scope inside a FlowScript block");
var xmlParseCatalog = JSON.parse(engine.catalog(JSON.stringify({ q: "xml.parse" })));
assertTrue(xmlParseCatalog.blocks.some(function (block) {
	return block.blockId === "xml.parse" && block.namespace === "xml" && block.origin === "core";
}), "catalog did not expose xml.parse");
var xmlParseRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: parseFeed",
		"    block: xml.parse",
		"    text: \"<rss><channel><item><title>One</title><enclosure url=\\\"https://example.test/one.png\\\" /></item><item><title>Two</title></item></channel></rss>\"",
		"    out: local.feed",
		"  - id: firstTitle",
		"    block: set",
		"    path: result.title",
		"    value: \"{{ local.feed.rss.channel.item[0].title }}\"",
		"  - id: firstImage",
		"    block: set",
		"    path: result.imageUrl",
		"    value: \"{{ local.feed.rss.channel.item[0].enclosure.attr.url }}\"",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(xmlParseRun.result.title === "One" &&
	xmlParseRun.result.imageUrl === "https://example.test/one.png",
	"xml.parse did not expose the expected Convertigo XML-to-JSON shape");
var xmlParseEnvelopeRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: parseEnvelope",
		"    block: xml.parse",
		"    text:",
		"      content: \"<rss />\"",
		"      path: libs/flow/resources/feed.xml",
		"    out: local.feed",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(xmlParseEnvelopeRun.ok === false &&
	JSON.stringify(xmlParseEnvelopeRun).indexOf("xml.parse expects raw XML text") !== -1 &&
	JSON.stringify(xmlParseEnvelopeRun).indexOf("asset.read") !== -1,
	"xml.parse did not reject a resource envelope with an actionable asset.read hint");
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
var compositeRun = JSON.parse(engine.run(JSON.stringify({
	flowSource: [
		"version: 1",
		"nodes:",
		"  - id: outer",
		"    block: smoke.outerLeak",
		"    value: Hello isolated runtime",
		"    out: result.outer",
		""
	].join("\n"),
	includeTrace: false
})));
assertTrue(compositeRun.result.outer &&
	compositeRun.result.outer.count === 1 &&
	compositeRun.result.outer.message === "Hello isolated runtime" &&
	compositeRun.result.body === undefined,
	"composite Flow block runtime leaked internal result fields into the caller result scope");
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
	propertyEditor.html.indexOf("flow-binding-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-template-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-value-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-expression-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-literal-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-text-editor") !== -1 &&
	propertyEditor.html.indexOf("flow-config-overrides-editor") !== -1,
	"propertyEditor did not embed core standalone editors");
assertTrue(propertyEditor.html.indexOf('"fullsync"') !== -1 &&
	propertyEditor.html.indexOf('"event"') !== -1,
	"binding editor did not expose FullSync and event source modes");
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
var pickerJsonObjectFlowSource = [
	"version: 1",
	"nodes:",
	"  - id: initSource",
	"    block: set",
	"    path: local.source",
	"    value:",
	"      name: Ada",
	"      count: 3",
	"  - id: buildResponse",
	"    block: json.object",
	"    out: local.response",
	"    fields:",
	"      - id: name",
	"        block: json.field",
	"        key: name",
	"        value: \"{{ local.source.name }}\"",
	"      - id: count",
	"        block: json.field",
	"        key: count",
	"        value: \"{{ local.source.count }}\"",
	"  - id: done",
	"    block: return",
	"    value: \"{{ local.response }}\"",
	""
].join("\n");
var pickerJsonObjectContext = JSON.parse(engine.context(JSON.stringify({
	flowSource: pickerJsonObjectFlowSource,
	node: "done",
	include: ["local"],
	detail: "normal"
})));
assertTrue(pickerJsonObjectContext.scopes.local.paths.some(function (entry) {
	return entry.path === "local.response" && entry.type === "object";
}) && pickerJsonObjectContext.scopes.local.paths.some(function (entry) {
	return entry.path === "local.response.name" && entry.type === "string";
}) && pickerJsonObjectContext.scopes.local.paths.some(function (entry) {
	return entry.path === "local.response.count" && entry.type === "integer";
}), "Flow context did not expose json.object output schema before a return node");
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
var defaultRun = JSON.parse(engine.run(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource })));
var defaultSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource, detail: "full" })));
assertTrue(defaultRun.result.message === "Hello Flow", "Named flow did not execute before schema inspection");
assertTrue(!defaultRun.schemaUpdates || defaultRun.schemaUpdates.length === 0,
	"Default run should not record a learned Flow result schema");
assertTrue(defaultSchema.source === "static" &&
	defaultSchema.sources.learned.available === false &&
	defaultSchema.schema.properties.cities.type === "array" &&
	defaultSchema.schema.properties.message.type === "string",
	"outputSchema should stay dynamic/static by default and not learn the Flow result");
var learnedRun = JSON.parse(engine.run(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource, learnResultSchema: true })));
var learnedSchema = JSON.parse(engine.outputSchema(JSON.stringify({ flowName: "SmokeResult", flowSource: flowSource, detail: "full" })));
assertTrue(learnedRun.schemaUpdates && learnedRun.schemaUpdates.length > 0,
	"Explicit learnResultSchema did not record a learned Flow result schema");
assertTrue(learnedSchema.sources.learned.available === true &&
	learnedSchema.schema.properties.cities.type === "array" &&
	learnedSchema.schema.properties.message.type === "string",
	"outputSchema did not expose the explicitly learned Flow result structure");

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
	"  - id: countSorted",
	"    block: set",
	"    path: result.count",
	"    value: \"{{ local.sortedAdults.length }}\"",
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
var countSortedOutput = nodeOutput(analysisNode(listSchemaAnalysis, "countSorted"), "result.count");
assertTrue(filterAdultAgeOutput && filterAdultAgeOutput.type === "integer",
	"list.filter node output schema still exposes the item as unknown");
assertTrue(mapNameOutput && mapNameOutput.type === "string",
	"list.map node output schema still exposes the mapped item as unknown");
assertTrue(pluckAgeOutput && pluckAgeOutput.type === "integer",
	"list.pluck node output schema still exposes the plucked item as unknown");
assertTrue(countSortedOutput && countSortedOutput.schema && countSortedOutput.schema.type === "integer",
	"list length expression did not infer an integer node output schema");
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
assertTrue(listSchemaOutput.schema.properties.count.type === "integer",
	"outputSchema did not derive integer schema for list length expressions");

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
	"      currencies:",
	"        EUR:",
	"          name: Euro",
	"          symbol: EUR",
	"        DKK:",
	"          name: Danish krone",
	"          symbol: DKK",
	"  - id: pickFields",
	"    block: object.pick",
	"    source: local.profile",
	"    keys:",
	"      - city",
	"      - metrics.temperature",
	"    out: local.selected",
	"  - id: currencyKeys",
	"    block: object.keys",
	"    source: local.profile.currencies",
	"    out: local.currencyCodes",
	"  - id: firstCurrency",
	"    block: object.firstEntry",
	"    source: local.profile.currencies",
	"    out: local.firstCurrency",
	"  - id: currencyInfo",
	"    block: object.get",
	"    source: local.profile.currencies",
	"    key: local.firstCurrency.key",
	"    out: local.currencyInfo",
	"  - id: mergeAlert",
	"    block: object.merge",
	"    target: local.selected",
	"    source:",
	"      alert: true",
	"    out: result.payload",
	"  - id: setCurrencyCodes",
	"    block: set",
	"    path: result.currencyCodes",
	"    value: \"{{ local.currencyCodes }}\"",
	"  - id: setCurrencyCode",
	"    block: set",
	"    path: result.currencyCode",
	"    value: \"{{ local.firstCurrency.key }}\"",
	"  - id: setCurrencyName",
	"    block: set",
	"    path: result.currencyName",
	"    value: \"{{ local.currencyInfo.name }}\"",
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
	standardDataRun.result.roundtrip.city === "Paris" &&
	standardDataRun.result.currencyCodes.join(",") === "EUR,DKK" &&
	standardDataRun.result.currencyCode === "EUR" &&
	standardDataRun.result.currencyName === "Euro",
	"Standard data blocks did not pick, merge, inspect, get, stringify and parse correctly");
var standardDataAnalysis = JSON.parse(engine.analyze(JSON.stringify({ flowSource: standardDataFlowSource })));
assertTrue(standardDataAnalysis.schemas["local.currencyCodes"].items.type === "string" &&
	standardDataAnalysis.schemas["local.firstCurrency"].properties.value.properties.name.type === "string" &&
	standardDataAnalysis.schemas["local.currencyInfo"].properties.name.type === "string",
	"object.keys/object.firstEntry/object.get did not propagate object schemas");

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
var budgetedEmptySearch = JSON.parse(engine.search(JSON.stringify({
	project: "SmokeProject",
	query: "definitely-no-such-flow-match",
	kinds: ["node"],
	answerBefore: 1,
	minItems: 1,
	limit: 5,
	doc: false,
	hints: false
})));
assertTrue(budgetedEmptySearch.partial === true && budgetedEmptySearch.count === 0 &&
	String(budgetedEmptySearch.nextCursor || "").indexOf("rb1.") === 0 &&
	budgetedEmptySearch.warnings[0].code === "PARTIAL_RESULT_TIME_BUDGET",
	"budgeted flow search did not stop a no-match traversal after useful work");
var resumedEmptySearch = JSON.parse(engine.search(JSON.stringify({
	project: "SmokeProject",
	query: "definitely-no-such-flow-match",
	kinds: ["node"],
	cursor: budgetedEmptySearch.nextCursor,
	limit: 5,
	doc: false,
	hints: false
})));
assertTrue(resumedEmptySearch.ok === true,
	"budgeted flow search did not resume its phased cursor");
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
var frontendRoot = new java.io.File(projectDirFile, "libs/flow/frontbuilder/svelte");
var frontendUiDir = new java.io.File(frontendRoot, "ui/project");
frontendUiDir.mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(frontendUiDir, "Text.uiblock.json"), JSON.stringify({
	id: "project.text",
	label: "Text",
	category: "Project / UI blocks",
	kind: "widget",
	tag: "Text",
	targetKinds: ["frontendStructure"],
	acceptedPositions: ["inside"],
	insert: {
		id: "text",
		kind: "text",
		text: "Text"
	},
	properties: {
		text: {
			label: "Text",
			kind: "text",
			type: "string"
		}
	}
}, null, 2), "UTF-8");
var frontendEngineSource = [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: libs/flow/frontbuilder/svelte",
	"      modelPath: libs/flow/frontbuilder/svelte/model/App.front.json",
	""
].join("\n");
var authoringTree = JSON.parse(engine.authoringTree(JSON.stringify({
	engineSource: frontendEngineSource,
	detail: "full"
})));
var authoringProvider = findNode(authoringTree, function (node) {
	return node.type === "frontendBlockProvider" && node.summary === String(projectDirFile.getName());
});
assertTrue(authoringProvider !== null, "authoring-tree did not expose the current project as a frontend catalog provider");
var authoringTextBlock = findNode(authoringProvider, function (node) {
	return node.kind === "frontendBlock" && node.type === "project.text";
});
assertTrue(authoringTextBlock !== null && authoringTextBlock.info.indexOf("\"sourceWritable\":true") !== -1,
	"authoring-tree did not expose project Text as a writable source-backed frontend UI block");
var authoringUiBlocks = findNode(authoringProvider, function (node) {
	return node.type === "frontendBlocks";
});
assertTrue(authoringUiBlocks !== null, "authoring-tree did not expose the project UI blocks folder");
var createFrontendPalette = JSON.parse(engine.authoringPalette(JSON.stringify({
	engineSource: frontendEngineSource,
	focusPath: authoringUiBlocks.path
})));
assertTrue(createFrontendPalette.ok === true &&
	createFrontendPalette.items.some(function (item) { return item.id === "frontbuilder.svelte.flowUiBlock"; }) &&
	createFrontendPalette.items.some(function (item) { return item.id === "frontbuilder.svelte.svelteUiBlock"; }),
	"authoring-palette did not propose source-backed UI block creation actions on writable project UI blocks");
var fallbackFrontendPalette = JSON.parse(engine.authoringPalette(JSON.stringify({
	engineSource: frontendEngineSource,
	focusPath: authoringTextBlock.path
})));
assertTrue(fallbackFrontendPalette.ok === true && fallbackFrontendPalette.eligibleCount > 0 &&
	fallbackFrontendPalette.fallback && fallbackFrontendPalette.fallback.available === true &&
	fallbackFrontendPalette.fallback.applied === true &&
	fallbackFrontendPalette.items.some(function (item) { return item.id === "frontbuilder.svelte.flowUiBlock"; }),
	"authoring-palette did not apply parent fallback for a frontend definition leaf focus");

var flowSvelteModelDir = new java.io.File(frontendRoot, "model/AstSmoke");
var flowSvelteRoutesDir = new java.io.File(flowSvelteModelDir, "src/routes");
var flowSvelteComponentDir = new java.io.File(flowSvelteModelDir, "src/lib/components");
flowSvelteComponentDir.mkdirs();
flowSvelteRoutesDir.mkdirs();
var flowSveltePageFile = new java.io.File(flowSvelteRoutesDir, "+page.flow.svelte");
var flowSvelteComponentFile = new java.io.File(flowSvelteComponentDir, "SmokePanel.flow.svelte");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(flowSveltePageFile, [
	"<script module>",
	"  export const _flow = {",
	"    app: { id: \"AstSmoke\", title: \"Ast smoke\" },",
	"    page: { id: \"home\", route: \"/\", title: \"Ast smoke\" },",
	"    builder: { id: \"lib_flow_frontbuilder_svelte\" }",
	"  };",
	"</script>",
	"",
	"<FlowComponent id=\"home\" label=\"Ast smoke\">",
	"  <Structure>",
	"    <SmokePanel id=\"smokePanel1\" />",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n"), "UTF-8");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(flowSvelteComponentFile, [
	"<FlowComponent id=\"smokePanel\" label=\"Smoke panel\">",
	"  <Structure>",
	"    <Text id=\"first\" text=\"First\" />",
	"    <If id=\"guard\" test={ready}>",
	"      <Then>",
	"        <Text id=\"inside\" text=\"Inside\" />",
	"      </Then>",
	"    </If>",
	"    <Text id=\"last\" text=\"Last\" />",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n"), "UTF-8");
var flowSvelteEngineSource = [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: libs/flow/frontbuilder/svelte",
	"      modelPath: libs/flow/frontbuilder/svelte/model/AstSmoke/src/routes/+page.flow.svelte",
	""
].join("\n");
var flowSvelteTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "full"
})));
var flowSvelteNames = {};
(function collectVirtualNames(node) {
	(node.children || []).forEach(function (child) {
		var parentPath = String(node.path || "root");
		var key = parentPath + "." + child.name;
		assertTrue(!flowSvelteNames[key], "Flow Svelte tree reused virtual child name " + key);
		flowSvelteNames[key] = true;
		collectVirtualNames(child);
	});
})(flowSvelteTree);
assertTrue(findNode(flowSvelteTree, function (node) {
	return node.path === "config.frontbuilder";
}) === null, "engine tree exposed private frontbuilder config in the Config branch");
assertTrue(findNode(flowSvelteTree, function (node) {
	return node.kind === "frontendBuilder" && node.type === "svelte";
}) !== null, "engine tree did not expose the Svelte builder in the dedicated Frontends branch");
var flowSvelteAuthoringTree = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "compact",
	maxDepth: 2
})));
assertTrue(flowSvelteAuthoringTree.childCount === 1 &&
	flowSvelteAuthoringTree.children[0].kind === "frontendBuilder",
	"authoring tree did not focus the Svelte builder by default");
assertTrue(Object.prototype.toString.call(flowSvelteAuthoringTree.diagnostics) === "[object Array]",
	"authoring tree did not preserve frontend document diagnostics");
var leanFlowSvelteAuthoringTree = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "compact",
	maxDepth: 2,
	includeFrontendCatalog: false,
	includeFlowCatalog: false
})));
assertTrue(findNode(leanFlowSvelteAuthoringTree, function (node) {
	return node.kind === "frontendBlockCatalog" || node.path === "catalog";
}) === null, "lean authoring tree should omit frontend and Flow catalogs");
var frontendDocumentServerInfo = JSON.parse(engine.cacheInfo()).caches.frontendDocumentServer;
assertTrue(frontendDocumentServerInfo.starts === 1 && frontendDocumentServerInfo.active === 1 &&
	frontendDocumentServerInfo.fallbacks === 0 && frontendDocumentServerInfo.errors === 0,
	"frontend document parsing should use one healthy persistent Node worker");
var engineAfterFrontendRestart = eval(source);
var persistentFrontendTree = JSON.parse(engineAfterFrontendRestart.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "compact",
	maxDepth: 2,
	includeFrontendCatalog: false,
	includeFlowCatalog: false
})));
var persistentFrontendCacheInfo = JSON.parse(engineAfterFrontendRestart.cacheInfo()).caches.persistentFrontendDocuments;
assertTrue(persistentFrontendTree.childCount === leanFlowSvelteAuthoringTree.childCount &&
	persistentFrontendCacheInfo.hits > 0 && persistentFrontendCacheInfo.errors === 0,
	"a new Flow runtime should reuse the persistent frontend document cache");
var flowSvelteOpenBuilt = JSON.parse(engine.contextAction(JSON.stringify({
	project: "AstSmoke",
	projectDir: __flowProjectDir,
	engineSource: flowSvelteEngineSource,
	actionId: "frontbuilder.svelte.openBuilt",
	targetObject: {
		kind: "frontendBuilder",
		type: "svelte",
		project: "AstSmoke"
	}
})));
var flowSvelteAcceptance = flowSvelteOpenBuilt.acceptance;
assertTrue(flowSvelteOpenBuilt.ok === true && flowSvelteAcceptance,
	"open built should expose frontend acceptance: " + JSON.stringify(flowSvelteOpenBuilt));
assertTrue(flowSvelteAcceptance.strategy === "safe-playwright-plan",
	"frontend acceptance should use the safe Playwright plan");
assertTrue(flowSvelteAcceptance.calls.length === 7,
	"frontend acceptance should contain seven bounded calls");
assertTrue(flowSvelteAcceptance.calls[0].tool === "browser_navigate" &&
	flowSvelteAcceptance.calls[2].tool === "browser_evaluate" &&
	flowSvelteAcceptance.calls[6].tool === "browser_close",
	"frontend acceptance should navigate, probe and close the browser");
assertTrue(String(flowSvelteAcceptance.calls[2].arguments["function"]).indexOf("async () =>") === 0 &&
	String(flowSvelteAcceptance.calls[2].arguments["function"]).indexOf("deadline = startedAt + 15000") > 0 &&
	String(flowSvelteAcceptance.calls[2].arguments["function"]).indexOf("if (!pendingText") > 0 &&
	String(flowSvelteAcceptance.calls[2].arguments["function"]).indexOf("terminalReached: !pendingText") > 0,
	"frontend acceptance should wait for a bounded stable terminal browser state");
var authoringTreeCacheBeforeRepeat = JSON.parse(engine.cacheInfo()).caches.treeSnapshots;
JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "compact",
	maxDepth: 2
})));
var authoringTreeCacheAfterRepeat = JSON.parse(engine.cacheInfo()).caches.treeSnapshots;
assertTrue(authoringTreeCacheAfterRepeat.hits > authoringTreeCacheBeforeRepeat.hits,
	"repeated authoring tree reads should reuse the shared tree snapshot");
var nestedRouteDir = new java.io.File(flowSvelteRoutesDir, "detail");
nestedRouteDir.mkdirs();
var nestedRouteFile = new java.io.File(nestedRouteDir, "+page.flow.svelte");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(nestedRouteFile, [
	"<FlowComponent id=\"detail\" label=\"Detail\">",
	"  <Structure><Text id=\"detailTitle\" text=\"Detail\" /></Structure>",
	"</FlowComponent>",
	""
].join("\n"), "UTF-8");
var authoringTreeCacheBeforeRouteChange = JSON.parse(engine.cacheInfo()).caches.treeSnapshots;
JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "compact",
	maxDepth: 2
})));
var authoringTreeCacheAfterRouteChange = JSON.parse(engine.cacheInfo()).caches.treeSnapshots;
assertTrue(authoringTreeCacheAfterRouteChange.misses > authoringTreeCacheBeforeRouteChange.misses,
	"changing a sibling Svelte route should invalidate the shared authoring tree snapshot");
var flowSvelteRoutesNode = findNode(flowSvelteAuthoringTree, function (node) {
	return node.kind === "frontendRoutes";
});
assertTrue(flowSvelteRoutesNode !== null && flowSvelteRoutesNode.path,
	"authoring tree did not expose a stable Svelte routes focus path");
var flowSvelteRoutesTree = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	focusPath: flowSvelteRoutesNode.path,
	detail: "compact",
	maxDepth: 3
})));
assertTrue(flowSvelteRoutesTree.childCount === 1 &&
	flowSvelteRoutesTree.children[0].kind === "frontendRoutes",
	"authoring tree focusPath did not return the focused Svelte route branch");
var flowSvelteTextNode = findNode(flowSvelteTree, function (node) {
	if (node.kind !== "frontendWidget" || node.type !== "Text") return false;
	var definition = node.definition ? JSON.parse(node.definition) : {};
	return definition.id === "first";
});
assertTrue(flowSvelteTextNode && flowSvelteTextNode.path,
	"authoring tree did not expose the Text node used by focused picker smoke tests");
var flowSvelteCompactInspect = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	focusPath: flowSvelteTextNode.path,
	detail: "inspect",
	maxDepth: 0
})));
assertTrue(JSON.stringify(flowSvelteCompactInspect).indexOf('"bindingSources"') === -1 &&
	String(flowSvelteCompactInspect.next || "").indexOf("property") !== -1,
	"untargeted inspect should summarize picker catalogs instead of returning every binding candidate");
var flowSvelteSourceInspect = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	focusPath: flowSvelteTextNode.path,
	detail: "inspect",
	property: "source",
	sourceId: "readSmoke",
	maxDepth: 0
})));
assertTrue(flowSvelteSourceInspect.property === "source" && flowSvelteSourceInspect.sourceId === "readSmoke" &&
	JSON.stringify(flowSvelteSourceInspect).indexOf('"bindingSources"') === -1,
	"property-targeted inspect did not preserve its exact picker scope");
var flowSvelteInternalInspect = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	focusPath: flowSvelteTextNode.path,
	detail: "inspect",
	includeDefinition: true,
	internalDeep: true,
	maxDepth: 0
})));
assertTrue(/^frontAst\./.test(String(flowSvelteInternalInspect.children[0].sourceMutationPath || "")),
	"internal authoring inspection did not expose the focused source mutation path");
var flowSvelteStructureNode = findNode(flowSvelteRoutesTree, function (node) {
	return node.kind === "frontendStructure";
});
assertTrue(flowSvelteStructureNode !== null && flowSvelteStructureNode.path,
	"authoring tree did not expose a Svelte structure focus path");
var flowSvelteMultiQueryPalette = JSON.parse(engine.authoringPalette(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	focusPath: flowSvelteStructureNode.path,
	query: "Text Card"
})));
assertTrue(flowSvelteMultiQueryPalette.ok === true &&
	flowSvelteMultiQueryPalette.items.some(function (item) {
		return item.id === "project.text" && item.properties && item.properties.text &&
			item.properties.text.type === "string" && item.properties.text.intents[0] === "literal";
	}),
	"authoring palette should match useful tokens from a multi-intent frontend query");
var flowSvelteContract = JSON.parse(engine.authoringContract(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir
})));
assertTrue(flowSvelteContract.ok === true && flowSvelteContract.items.some(function (item) {
	return item.id === "project.text" && item.properties && item.properties.text &&
		item.properties.text.type === "string" && item.properties.text.intents[0] === "literal";
}), "authoring contract should expose canonical properties without building a tree");
var flowSvelteForEachPalette = JSON.parse(engine.authoringPalette(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	focusPath: flowSvelteStructureNode.path,
	query: "ForEach"
})));
var flowSvelteForEachInsert = null;
flowSvelteForEachPalette.items.some(function (item) {
	if (item.id === "frontbuilder.svelte.forEach") {
		flowSvelteForEachInsert = item.insert;
		return true;
	}
	return false;
});
assertTrue(flowSvelteForEachInsert && flowSvelteForEachInsert.source &&
	flowSvelteForEachInsert.source.mode === "literal" &&
	Object.prototype.toString.call(flowSvelteForEachInsert.source.value) === "[object Array]",
	"authoring palette ForEach should insert a structured literal binding");
var configVisibilityEngineSource = [
	"version: 1",
	"configVisibility:",
	"  services.secret: private",
	"config:",
	"  services:",
	"    publicUrl: https://example.test/api",
	"    secret: keep-me-out-of-tree",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: libs/flow/frontbuilder/svelte",
	"      modelPath: libs/flow/frontbuilder/svelte/model/AstSmoke/src/routes/+page.flow.svelte",
	""
].join("\n");
var configVisibilityTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: configVisibilityEngineSource,
	projectDir: __flowProjectDir,
	detail: "full"
})));
assertTrue(findNode(configVisibilityTree, function (node) {
	return node.path === "config.services.publicUrl";
}) !== null, "engine tree hid public config");
assertTrue(findNode(configVisibilityTree, function (node) {
	return node.path === "config.services.secret";
}) === null, "engine tree exposed configVisibility private config");
assertTrue(findNode(configVisibilityTree, function (node) {
	return node.path === "config.frontbuilder";
}) === null, "engine tree exposed default-private frontbuilder config");
function nodeInfoObject(node) {
	return node && node.info ? JSON.parse(node.info) : {};
}
var smokePanelRoot = findNode(flowSvelteTree, function (node) {
	return node.kind === "frontendComponent" && node.summary === "Smoke panel";
});
var smokePanelRouteRef = findNode(flowSvelteTree, function (node) {
	return node.type === "SmokePanel" && node.summary === "smokePanel1";
});
var smokeIf = findNode(flowSvelteTree, function (node) {
	return node.kind === "frontendDirectiveBlock" && node.summary === "If";
});
assertTrue(nodeInfoObject(smokePanelRoot).frontendInsertMutationPath === "frontAst.slots.structure.children",
	"flow-svelte component root did not expose the AST structure insert path");
assertTrue(smokePanelRouteRef !== null,
	"flow-svelte canonical route page did not expose the referenced component instance");
assertTrue(nodeInfoObject(smokeIf).frontendInsertMutationPath === "frontAst.slots.structure.children[1].slots.then.children",
	"flow-svelte directive did not expose its default AST insert slot");
var flowSvelteMoveSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(flowSvelteComponentFile, "UTF-8"));
var flowSvelteMove = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteMoveSource,
	mutation: {
		op: "move",
		from: "frontAst.slots.structure.children[2]",
		fromId: "last",
		path: "frontAst.slots.structure.children",
		index: 1
	}
})));
assertTrue(flowSvelteMove.ok === true && String(flowSvelteMove.source).indexOf("id=\"last\"") < String(flowSvelteMove.source).indexOf("id=\"guard\""),
	"flow-svelte AST move did not reorder siblings");
var flowSvelteImplicitProps = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteMoveSource,
	mutation: {
		op: "merge",
		path: "frontAst.slots.structure.children[0]",
		value: { text: "Edited without explicit props" }
	}
})));
assertTrue(flowSvelteImplicitProps.ok === true &&
	flowSvelteImplicitProps.debug.propertyPathNormalized === true &&
	flowSvelteImplicitProps.debug.path === "frontAst.slots.structure.children[0].props" &&
	String(flowSvelteImplicitProps.source).indexOf("text=\"Edited without explicit props\"") !== -1,
	"flow-svelte AST property mutation without .props was not normalized to node attributes");
var flowSvelteReplaceNode = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteMoveSource,
	mutation: {
		op: "replace",
		path: "frontAst.slots.structure.children[0]",
		value: {
			id: "replacementCard",
			kind: "card",
			tag: "Card",
			variant: "sky",
			slots: {
				children: [{
					id: "replacementText",
					kind: "text",
					tag: "Text",
					text: "Replacement text"
				}]
			}
		}
	}
})));
assertTrue(flowSvelteReplaceNode.ok === true &&
	String(flowSvelteReplaceNode.source).indexOf("<Card id=\"replacementCard\"") !== -1 &&
	String(flowSvelteReplaceNode.source).indexOf("<Text id=\"replacementText\"") !== -1,
	"flow-svelte AST node replacement did not template palette-style values");
var flowSvelteBatchMutation = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteMoveSource,
	mutations: [{
		op: "insert",
		path: "frontAst.slots.structure.children",
		value: {
			id: "batchOne",
			kind: "text",
			tag: "Text",
			text: "Batch one"
		}
	}, {
		op: "insert",
		path: "frontAst.slots.structure.children",
		value: {
			id: "batchTwo",
			kind: "text",
			tag: "Text",
			text: "Batch two"
		}
	}]
})));
assertTrue(flowSvelteBatchMutation.ok === true &&
	flowSvelteBatchMutation.mutationCount === 2 &&
	flowSvelteBatchMutation.results.length === 2 &&
	String(flowSvelteBatchMutation.source).indexOf("text=\"Batch one\"") !== -1 &&
	String(flowSvelteBatchMutation.source).indexOf("text=\"Batch one\"") < String(flowSvelteBatchMutation.source).indexOf("text=\"Batch two\""),
	"flow-svelte source mutations were not applied as one ordered batch");
var flowSvelteBindingRoundTripSource = [
	"<FlowComponent id=\"bindingRoundTrip\" label=\"Binding round trip\">",
	"  <Structure>",
	"    <ForEach id=\"items\" source={{\"mode\":\"source\",\"source\":{\"category\":\"requestable\",\"actionId\":\"loadItems\"},\"path\":[{\"kind\":\"property\",\"name\":\"items\"}]}} context=\"item\">",
	"      <Children>",
	"        <Text id=\"itemTitle\" text=\"Placeholder\" source={{\"mode\":\"source\",\"source\":{\"category\":\"iteration\",\"scopeId\":\"items\",\"value\":\"item\"},\"path\":[{\"kind\":\"property\",\"name\":\"title\"}]}} />",
	"      </Children>",
	"      <Else />",
	"    </ForEach>",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n");
var flowSvelteBindingRoundTrip = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteBindingRoundTripSource,
	mutation: {
		op: "insert",
		path: "frontAst.slots.structure.children[0].slots.children.children",
		index: 1,
		value: { id: "itemDescription", kind: "text", tag: "Text", text: "Description" }
	}
})));
assertTrue(flowSvelteBindingRoundTrip.ok === true &&
	(String(flowSvelteBindingRoundTrip.source).match(/source=\{\{/g) || []).length === 2 &&
	String(flowSvelteBindingRoundTrip.source).indexOf('source="{') === -1,
	"flow-svelte AST mutations should preserve all structured binding attributes across reparses: " +
		JSON.stringify(flowSvelteBindingRoundTrip));
var flowSvelteIntuitiveBindingMutation = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteBindingRoundTripSource,
	mutation: {
		op: "replace",
		path: "frontAst.slots.structure.children[0].props.source",
		value: "@loadItems.items"
	}
})));
assertTrue(flowSvelteIntuitiveBindingMutation.ok === true &&
	String(flowSvelteIntuitiveBindingMutation.source).indexOf('source="@loadItems.items"') !== -1,
	"flow-svelte AST mutation did not accept an intuitive binding reference");
var flowSvelteSyntaxIntentSource = [
	"<FlowComponent id=\"syntaxIntent\" label=\"Syntax intent\">",
	"  <Structure>",
	"    <If id=\"ready\" test=\"@catalog.rows\">",
	"      <Then><Header id=\"header\" sticky={true} /><UpdateList id=\"trim\" count={itemIndex + 1} /></Then>",
	"    </If>",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n");
var flowSvelteSyntaxIntentRoundTrip = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteSyntaxIntentSource,
	mutation: {
		op: "replace",
		path: "frontAst.slots.structure.children[0].props.outputSchema",
		value: { type: "object", properties: { rows: { type: "array" } } }
	}
})));
assertTrue(flowSvelteSyntaxIntentRoundTrip.ok === true &&
	String(flowSvelteSyntaxIntentRoundTrip.source).indexOf('test="@catalog.rows"') !== -1 &&
	String(flowSvelteSyntaxIntentRoundTrip.source).indexOf('sticky={true}') !== -1 &&
	String(flowSvelteSyntaxIntentRoundTrip.source).indexOf('count={itemIndex + 1}') !== -1 &&
	String(flowSvelteSyntaxIntentRoundTrip.source).indexOf('test={@catalog.rows}') === -1,
	"flow-svelte AST mutations should preserve quoted, literal and expression attribute intent: " +
		JSON.stringify(flowSvelteSyntaxIntentRoundTrip));
var flowSvelteNaturalBindingSource = [
	"<FlowComponent id=\"naturalBindingRoundTrip\" label=\"Natural binding round trip\">",
	"  <Structure>",
	"    <ForEach id=\"items\" source={{ mode: \"literal\", value: [] }} context=\"item\">",
	"      <Children>",
	"        <UpdateNumber id=\"quantity\" count={{ mode: \"literal\", value: 0 }} step={{ mode: \"literal\", value: 1 }} />",
	"        <Text id=\"itemTitle\" text=\"Placeholder\" source={{ mode: \"source\", source: { category: \"iteration\", scopeId: \"items\", value: \"item\" }, path: [{ kind: \"property\", name: \"title\" }] }} />",
	"      </Children>",
	"      <Else />",
	"    </ForEach>",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n");
var flowSvelteNaturalBindingRoundTrip = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteNaturalBindingSource,
	mutation: {
		op: "insert",
		path: "frontAst.slots.structure.children[0].slots.children.children",
		index: 2,
		value: { id: "itemDescriptionNatural", kind: "text", tag: "Text", text: "Description" }
	}
})));
assertTrue(flowSvelteNaturalBindingRoundTrip.ok === true &&
	(String(flowSvelteNaturalBindingRoundTrip.source).match(/source=\{\{/g) || []).length === 2 &&
	String(flowSvelteNaturalBindingRoundTrip.source).indexOf('count={{"mode":"literal","value":0}}') !== -1 &&
	String(flowSvelteNaturalBindingRoundTrip.source).indexOf('step={{"mode":"literal","value":1}}') !== -1 &&
	String(flowSvelteNaturalBindingRoundTrip.source).indexOf('source="{') === -1 &&
	String(flowSvelteNaturalBindingRoundTrip.source).indexOf('count="{') === -1 &&
	String(flowSvelteNaturalBindingRoundTrip.source).indexOf('step="{') === -1,
	"flow-svelte AST mutations should preserve natural object literal bindings: " +
		JSON.stringify(flowSvelteNaturalBindingRoundTrip));
var flowSvelteFullSyncBinding = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteBindingRoundTripSource,
	mutation: {
		op: "replace",
		path: "frontAst.slots.structure.children[0].props.source",
		value: {
			mode: "source",
			source: { category: "fullsync", actionId: "readItems", operation: "view" },
			path: [{ kind: "property", name: "rows" }]
		}
	}
})));
assertTrue(flowSvelteFullSyncBinding.ok === true &&
	String(flowSvelteFullSyncBinding.source).indexOf('"category":"fullsync"') !== -1 &&
	String(flowSvelteFullSyncBinding.source).indexOf('"operation":"view"') !== -1,
	"flow-svelte AST mutations should accept structured FullSync binding sources");
var flowSvelteConditionalBindingSource = [
	"<FlowComponent id=\"conditionalBinding\" label=\"Conditional binding\">",
	"  <Structure>",
	"    <If id=\"alternateCard\" test={{\"mode\":\"source\",\"source\":{\"category\":\"iteration\",\"scopeId\":\"items\",\"value\":\"item\"},\"path\":[{\"kind\":\"property\",\"name\":\"alternate\"}]}}>",
	"      <Then>",
	"        <Text id=\"conditionalText\" text=\"Visible\" />",
	"      </Then>",
	"    </If>",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n");
var flowSvelteConditionalBindingRoundTrip = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteConditionalBindingSource,
	mutation: {
		op: "replace",
		path: "frontAst.slots.structure.children[0].slots.then.children[0].props.text",
		value: "Still visible"
	}
})));
assertTrue(flowSvelteConditionalBindingRoundTrip.ok === true &&
	String(flowSvelteConditionalBindingRoundTrip.source).indexOf('test={{"mode":"source"') !== -1 &&
	String(flowSvelteConditionalBindingRoundTrip.source).indexOf("test={{{") === -1,
	"flow-svelte AST mutations should preserve structured conditional bindings across reparses: " +
		JSON.stringify(flowSvelteConditionalBindingRoundTrip));
var flowSvelteNestedConditionalSource = [
	"<FlowComponent id=\"nestedConditional\" label=\"Nested conditional\">",
	"  <Structure>",
	"    <ForEach id=\"items\" source={{\"mode\":\"literal\",\"value\":[]}}>",
	"      <Each>",
	"        <If id=\"alternate\" test={index % 2 === 0}>",
	"          <Then><Card><Children>",
	"            <Text id=\"evenTitle\" text=\"Placeholder\" />",
	"          </Children></Card></Then>",
	"          <Else />",
	"        </If>",
	"      </Each>",
	"      <Else />",
	"    </ForEach>",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n");
var flowSvelteNestedConditionalMutation = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(flowSvelteComponentFile.getAbsolutePath()),
	sourcePath: String(flowSvelteComponentFile.getAbsolutePath()),
	source: flowSvelteNestedConditionalSource,
	mutation: {
		op: "replace",
		path: "frontAst.slots.structure.children[0].slots.children.children[0].slots.then.children[0].slots.children.children[0].props.source",
		value: {
			mode: "source",
			source: { category: "iteration", scopeId: "items", value: "item" },
			path: [{ kind: "property", name: "title" }]
		}
	}
})));
assertTrue(flowSvelteNestedConditionalMutation.ok === true &&
	String(flowSvelteNestedConditionalMutation.source).indexOf('id="evenTitle"') !== -1 &&
	String(flowSvelteNestedConditionalMutation.source).indexOf('"scopeId":"items"') !== -1,
	"flow-svelte AST mutations should resolve Each and named If slots: " +
		JSON.stringify(flowSvelteNestedConditionalMutation));
var flowSvelteDraftTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: flowSvelteEngineSource,
	projectDir: __flowProjectDir,
	detail: "full",
	frontendSourceDrafts: (function () {
		var drafts = {};
		drafts[String(flowSvelteComponentFile.getCanonicalPath())] = flowSvelteMove.source;
		return drafts;
	})()
})));
var smokePanelCatalogRoot = findNode(flowSvelteDraftTree, function (node) {
	return node.kind === "frontendComponent" && node.summary === "Smoke panel" &&
		String(node.path || "").indexOf(".catalog.") !== -1;
});
var smokePanelCatalogStructure = findNode(smokePanelCatalogRoot, function (node) {
	return node.type === "structure";
});
assertTrue(smokePanelCatalogStructure && smokePanelCatalogStructure.children.length >= 3 &&
	smokePanelCatalogStructure.children[1].summary === "Last",
	"flow-svelte catalog tree did not use the live frontend source draft");
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
