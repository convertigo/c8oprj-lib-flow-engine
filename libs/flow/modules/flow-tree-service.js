(function () {
	function create(env) {
		var File = env.File;
		var FileUtils = env.FileUtils;
		var Arrays = env.Arrays;
		var jsonMapper = env.jsonMapper;
		var yamlMapper = env.yamlMapper;
		var engineDir = env.engineDir;
		var projectDir = env.projectDir;
		var resourceRelativePath = env.resourceRelativePath;
		var resolveBlockIcon = env.resolveBlockIcon;
		var normalizeTree = env.normalizeTree;
		var compact = env.compact;
		var summaryText = env.summaryText;
		var blockCatalog = env.blockCatalog;
		var blockDescriptor = env.blockDescriptor;
		var typeDescriptor = env.typeDescriptor;
		var loadTypes = env.loadTypes || function () { return {}; };
		var catalogDefinition = env.catalogDefinition;
		var listFlowLibraries = env.listFlowLibraries;
		var normalizeGraphBlockUses = env.normalizeGraphBlockUses;
		var listProjectFragments = env.listProjectFragments;
		var readFragment = env.readFragment;
		var expandFragmentNodes = env.expandFragmentNodes;
		var blockName = env.blockName;
		var nodePath = env.nodePath;
		var sourceFromDefinition = env.sourceFromDefinition;
		var renderFlowScript = env.renderFlowScript;
		var parseYamlSource = env.parseYamlSource;
		var canonicalFlowDefinition = env.canonicalFlowDefinition;
		var parseSource = env.parseSource;
		var sourceForFlowRequest = env.sourceForFlowRequest;
		var expandFlowDefinition = env.expandFlowDefinition;
		var blocksWithFlowHelpers = env.blocksWithFlowHelpers;
		var analyzeFlowDefinition = env.analyzeFlowDefinition;
		var analyzeFlowSource = env.analyzeFlowSource;
		var analysisByNodeId = env.analysisByNodeId;
		var currentProjectName = env.currentProjectName;
		var visibleSearchFlows = env.visibleSearchFlows;
			var projectSchemasDir = env.projectSchemasDir;
			var readResultSchema = env.readResultSchema;
			var readOutputSchema = env.readOutputSchema;
			var writeOutputSchema = env.writeOutputSchema;
			var deleteOutputSchema = env.deleteOutputSchema;
			var declaredOutputSchema = env.declaredOutputSchema;
		var declaredPropertyOutputSchema = env.declaredPropertyOutputSchema;
		var resultSchemaFromAnalysis = env.resultSchemaFromAnalysis;
		var schemaScore = env.schemaScore;
		var schemaPaths = env.schemaPaths;
		var schemaAtPath = env.schemaAtPath;
		var schemaSimpleType = env.schemaSimpleType;
		var schemaSummary = env.schemaSummary;
		var objectSchema = env.objectSchema;
		var requestableInputContract = env.requestableInputContract || function () { return null; };
		var frontendBlocksForSettings = env.frontendBlocksForSettings || function () { return []; };
		var frontendCreateDescriptorsForSettings = env.frontendCreateDescriptorsForSettings || function () { return []; };
		var describeFrontendDocument = env.describeFrontendDocument || function () { return null; };
		var raise = env.raise;
		var intOption = env.intOption;
		var resolvedTypes;

	function flowTypes() {
		if (!resolvedTypes) {
			resolvedTypes = loadTypes();
		}
		return resolvedTypes;
	}

	function resolvedPropertyDefinition(value) {
		var definition = normalizeTree(value || {});
		var typeName = String(definition.kind || definition.type || "");
		var type = flowTypes()[typeName];
		if (type) {
			var descriptor = typeDescriptor(type);
			var editor = descriptor && descriptor.editor;
			if (editor && editor.component && !definition.editorClass) {
				definition.editorClass = String(editor.component);
			}
			if (editor && editor.file && !definition.editorResource) {
				definition.editorResource = String(editor.file);
			}
		}
		return definition;
	}

	function nodeInfo(nodeAnalysis, catalog) {
		var info = nodeAnalysis ? normalizeTree(nodeAnalysis) : {};
		var props = catalog && catalog.props || {};
		var propertyDefinitions = {};
		var propertyOrder = [];
		var defaults = {};
		Object.keys(props).forEach(function (key) {
			var descriptor = props[key];
			propertyOrder.push(key);
			propertyDefinitions[key] = resolvedPropertyDefinition(descriptor);
			if (descriptor && descriptor["default"] !== undefined) {
				defaults[key] = descriptor["default"];
			}
		});
		if (Object.keys(defaults).length > 0) {
			info.propertyDefaults = defaults;
		}
		if (catalog) {
			["icon", "iconify", "iconUrl", "iconSvg", "iconFile", "iconFile16", "iconFile32"].forEach(function (key) {
				if (catalog[key] !== undefined && catalog[key] !== null && String(catalog[key]) !== "") {
					info[key] = String(catalog[key]);
				}
			});
			if (catalog.file) {
				var source = sourceDefinitionForFile(catalog.file, catalog.implementation || "");
				info.implementationKind = source.implementationKind;
				info.sourcePath = source.sourcePath;
				info.sourceRelativePath = source.sourceRelativePath;
				info.sourceOrigin = source.sourceOrigin;
				info.sourceWritable = source.sourceWritable;
				if (source.implementationKind === "flow") {
					info.flowImplementation = true;
					info.readOnlyReference = true;
				}
			}
			if (catalog.provider) {
				info.blockProvider = String(catalog.provider);
				propertyDefinitions.blockProvider = propertyDefinition("Block provider", "Information",
					"Project or library providing this block.", { readOnly: true });
				propertyOrder.push("blockProvider");
			}
			if (catalog.file) {
				var blockSource = sourceDefinitionForFile(catalog.file, catalog.implementation || "");
				if (blockSource.sourceRelativePath) {
					info.blockSource = blockSource.sourceRelativePath;
					propertyDefinitions.blockSource = propertyDefinition("Block source", "Information",
						"Descriptor source for this block.", { readOnly: true });
					propertyOrder.push("blockSource");
				}
			}
		}
		if (propertyOrder.length > 0) {
			info.propertyDefinitions = propertyDefinitions;
			info.propertyOrder = propertyOrder;
		}
		return info;
	}

	function safeVirtualName(prefix, value) {
		var name = String(value === undefined || value === null || value === "" ? prefix : value)
			.replace(/[^A-Za-z0-9_]/g, "_")
			.replace(/_+/g, "_");
		if (!name) {
			name = prefix || "item";
		}
		if (!name.charAt(0).match(/[A-Za-z_]/)) {
			name = "_" + name;
		}
		return name;
	}

	function virtualIcon(icon) {
		var descriptor = {
			icon: icon
		};
		resolveBlockIcon({
			__flowFile: new File(engineDir(), "virtual-icons.js").getAbsolutePath()
		}, descriptor);
		return descriptor;
	}

	function virtualNode(name, kind, type, path, summary, definition, info, icon) {
		var nodeInfo = info === undefined || info === null ? "" : String(info);
		if (icon) {
			var baseInfo = {};
			if (nodeInfo) {
				try {
					baseInfo = normalizeTree(JSON.parse(nodeInfo));
				} catch (e) {
					baseInfo = {};
				}
			}
			var iconInfo = virtualIcon(icon);
			Object.keys(iconInfo).forEach(function (key) {
				baseInfo[key] = iconInfo[key];
			});
			nodeInfo = compact(baseInfo);
		}
		return {
			name: safeVirtualName(kind || "item", name),
			kind: String(kind || ""),
			type: String(type || ""),
			path: String(path || ""),
			summary: String(summary || name || ""),
			definition: definition === undefined || definition === null ? "" : String(definition),
			info: nodeInfo,
			children: []
		};
	}

	function addSchemaFields(parent, schema, path, name) {
		if (!schema || typeof schema !== "object" || Object.prototype.toString.call(schema) === "[object Array]") {
			return;
		}
		var folder = virtualNode(name, "schema", name, path, name, compact(schema), null, "mdi:code-json");
		parent.children.push(folder);
		addObjectFields(folder, schema, path);
	}

	function addFlowSchema(out, schema, path, name, label) {
		if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) {
			return;
		}
		var folder = virtualNode(name, "schema", name, path, label, compact(schema), null, "mdi:code-json");
		out.push(folder);
		addObjectFields(folder, schema, path);
	}

	function addObjectFields(parent, object, path, filter) {
		Object.keys(object || {}).sort().forEach(function (key) {
			var value = object[key];
			var fieldPath = path + "." + key;
			if (filter && filter(fieldPath, key, value) === false) {
				return;
			}
			if (value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]") {
				var folder = virtualNode(key, "object", key, fieldPath, key, compact(value), null, "mdi:cube-outline");
				parent.children.push(folder);
				addObjectFields(folder, value, fieldPath, filter);
			} else {
				parent.children.push(virtualNode(key, "field", value, fieldPath, key + ": " + String(value), compact(value), null, "mdi:variable"));
			}
		});
	}

	function addContracts(out, contracts, path) {
		if (!contracts || typeof contracts !== "object" || Object.keys(contracts).length === 0) {
			return;
		}
		var folder = virtualNode("contracts", "folder", "contracts", path, "Contracts", compact(contracts), null, "mdi:file-sign");
		out.push(folder);
		Object.keys(contracts).sort().forEach(function (name) {
			var contract = contracts[name] || {};
			var contractObject = virtualNode("contract_" + name, "contract", name, path + "." + name, name, compact(contract), null, "mdi:file-sign");
			folder.children.push(contractObject);
			addSchemaFields(contractObject, contract.input, path + "." + name + ".input", "input");
			addSchemaFields(contractObject, contract.output, path + "." + name + ".output", "output");
			if (contract.defaultImplementation !== undefined && contract.defaultImplementation !== null) {
				var implementation = String(contract.defaultImplementation);
				contractObject.children.push(virtualNode("defaultImplementation", "binding", implementation,
					path + "." + name + ".defaultImplementation", "default -> " + implementation, implementation, null, "mdi:link-variant"));
			}
		});
	}

	function addBindings(out, bindings, path) {
		if (!bindings || typeof bindings !== "object" || Object.keys(bindings).length === 0) {
			return;
		}
		var folder = virtualNode("bindings", "folder", "bindings", path, "Bindings", compact(bindings), null, "mdi:link-variant");
		out.push(folder);
		Object.keys(bindings).sort().forEach(function (contract) {
			var implementation = bindings[contract];
			folder.children.push(virtualNode("binding_" + contract, "binding", contract, path + "." + contract,
				contract + " -> " + String(implementation), compact(implementation), null, "mdi:link-variant"));
		});
	}

	function flattenConfigVisibility(value, prefix, out) {
		out = out || {};
		if (!value || typeof value !== "object") {
			return out;
		}
		Object.keys(value).forEach(function (key) {
			var child = value[key];
			var childPath = prefix ? prefix + "." + key : key;
			if (typeof child === "string") {
				out[childPath] = String(child).toLowerCase();
			} else if (child && typeof child === "object") {
				if (typeof child.visibility === "string") {
					out[childPath] = String(child.visibility).toLowerCase();
				}
				flattenConfigVisibility(child, childPath, out);
			}
		});
		return out;
	}

	function configVisibility(visibilityMap, fieldPath) {
		var relative = String(fieldPath || "").replace(/^config\.?/, "");
		if (!relative) {
			return "public";
		}
		var parts = relative.split(".");
		for (var i = parts.length; i > 0; i--) {
			var key = parts.slice(0, i).join(".");
			if (Object.prototype.hasOwnProperty.call(visibilityMap, key)) {
				return visibilityMap[key] || "public";
			}
		}
		if (relative === "frontbuilder" || relative.indexOf("frontbuilder.") === 0) {
			return "private";
		}
		return "public";
	}

	function configPathVisible(visibilityMap, fieldPath, request) {
		if (request && request.includePrivateConfig === true) {
			return true;
		}
		var visibility = configVisibility(visibilityMap, fieldPath);
		return visibility !== "private" && visibility !== "internal" && visibility !== "hidden";
	}

	function visibleConfigObject(value, path, visibilityMap, request) {
		if (!value || typeof value !== "object" || Object.prototype.toString.call(value) === "[object Array]") {
			return value;
		}
		var out = {};
		Object.keys(value).sort().forEach(function (key) {
			var fieldPath = path + "." + key;
			if (!configPathVisible(visibilityMap, fieldPath, request)) {
				return;
			}
			var visibleValue = visibleConfigObject(value[key], fieldPath, visibilityMap, request);
			if (visibleValue && typeof visibleValue === "object" && Object.prototype.toString.call(visibleValue) !== "[object Array]" &&
					Object.keys(visibleValue).length === 0) {
				return;
			}
			out[key] = visibleValue;
		});
		return out;
	}

	function addConfig(out, config, path, visibility, request) {
		if (!config || typeof config !== "object" || Object.keys(config).length === 0) {
			return;
		}
		var visibilityMap = flattenConfigVisibility(visibility || {});
		var visibleConfig = visibleConfigObject(config, path, visibilityMap, request);
		if (!visibleConfig || typeof visibleConfig !== "object" || Object.keys(visibleConfig).length === 0) {
			return;
		}
		var folder = virtualNode("config", "scope", "config", path, "Config", compact(visibleConfig), null, "mdi:cog-outline");
		out.push(folder);
		addObjectFields(folder, visibleConfig, path);
	}

	function addEngineMetadata(out, engine, path) {
		engine = engine || {};
		var definition = {
			version: engine.version || 1,
			engineQName: String(engine.engineQName || "")
		};
		var info = sourceObjectInfo(definition, {
			version: propertyDefinition("Version", "Information", "Flow engine config version.", {
				readOnly: true,
				kind: "number",
				type: "number"
			}),
			engineQName: propertyDefinition("Engine QName", "Information", "Convertigo FlowEngine object used by this project.", {
				readOnly: true,
				kind: "text",
				type: "string"
			})
		}, ["version", "engineQName"]);
		out.push(virtualNode("engine", "engine", "engine", path,
			definition.engineQName || "Flow engine", compact(definition), compact(info), "mdi:state-machine"));
	}

	function frontbuilderSettings(config) {
		var root = config && config.frontbuilder;
		if (!root || typeof root !== "object") {
			return [];
		}
		return Object.keys(root).sort().map(function (key) {
			var settings = root[key];
			if (!settings || typeof settings !== "object") {
				settings = {};
			}
			return {
				name: key,
				settings: settings
			};
		});
	}

	function frontendModelFile(modelPath) {
		var root = projectDir();
		var path = String(modelPath || "").trim();
		if (!root || !path) {
			return null;
		}
		var file = new File(path);
		if (!file.isAbsolute()) {
			file = new File(root, path);
		}
		var rootPath = String(root.getCanonicalPath());
		var filePath = String(file.getCanonicalPath());
		if (filePath !== rootPath && filePath.indexOf(rootPath + File.separator) !== 0) {
			return null;
		}
		return file;
	}

	function frontendDraftForFile(request, file) {
		if (!file) {
			return null;
		}
		var drafts = request && request.frontendSourceDrafts || {};
		if (!drafts || typeof drafts !== "object") {
			return null;
		}
		var key = String(file.getCanonicalPath());
		if (Object.prototype.hasOwnProperty.call(drafts, key)) {
			return String(drafts[key]);
		}
		return null;
	}

	function frontendModelSource(request, file) {
		var draft = frontendDraftForFile(request, file);
		return draft === null ? String(FileUtils.readFileToString(file, "UTF-8")) : draft;
	}

	function frontendModelDirty(request, file) {
		return frontendDraftForFile(request, file) !== null;
	}

	function isFlowSvelteModel(file) {
		return file && String(file.getName()).endsWith(".flow.svelte");
	}

	function frontendModelDocument(request, file, settings) {
		var source = frontendModelSource(request, file);
		if (isFlowSvelteModel(file)) {
			var described;
			try {
				described = describeFrontendDocument({
					sourceFile: String(file.getAbsolutePath()),
					source: source,
					projectDir: projectDir() ? String(projectDir().getAbsolutePath()) : "",
					resourceRoot: settings && settings.resourceRoot || "",
					engineSource: request && request.engineSource || "",
					drafts: request && request.frontendSourceDrafts || {},
					property: request && request.property || "",
					sourceId: request && request.sourceId || "",
					sourceTree: request && request.sourceTree === true,
					includeBindings: request && request.includeBindings !== false
				});
			} catch (e) {
				var message = String(e && e.message || e);
				var root = /Cannot run program|ENOENT|not found/i.test(message)
					? flowSvelteLiteComponentRoot(String(file.getAbsolutePath()), source)
					: null;
				if (!root) {
					throw e;
				}
				var embeddedDiagnostics = flowSvelteLiteBindingDiagnostics(root);
				embeddedDiagnostics.push({
					level: "warning",
					code: "FRONTEND_EMBEDDED_PROJECTION",
					message: "Using the embedded Flow Svelte projection because the optional Node authoring service is unavailable."
				});
				described = {
					model: {
						version: 1,
						app: { id: root.id, title: root.label }
					},
					tree: { children: [root] },
					diagnostics: embeddedDiagnostics
				};
			}
			if (!described || !described.model) {
				throw new Error("Frontend document service did not return a model for " + String(file.getAbsolutePath()));
			}
			var contractDiagnostics = [];
			(described.tree && described.tree.children || []).forEach(function (root) {
				flowSvelteCallContractDiagnostics(root, request).forEach(function (diagnostic) {
					contractDiagnostics.push(diagnostic);
				});
			});
			described.diagnostics = mergeFrontendDiagnostics(described.diagnostics, contractDiagnostics);
			return normalizeTree(described);
		}
		return {
			model: normalizeTree(JSON.parse(source))
		};
	}

	function frontendModelObject(request, file, settings) {
		return normalizeTree(frontendModelDocument(request, file, settings).model);
	}

	function lowerFirst(value) {
		value = String(value || "");
		return value ? value.charAt(0).toLowerCase() + value.substring(1) : value;
	}

	function titleFromCamel(value) {
		value = String(value || "").replace(/[_-]+/g, " ");
		value = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
		return value ? value.charAt(0).toUpperCase() + value.substring(1) : "Node";
	}

	function frontendSourceInfo(file, kind, mutationPath, request) {
		var source = sourceDefinitionForFile(file ? String(file.getAbsolutePath()) : "", kind || "frontend-model");
		source.sourceMutationPath = mutationPath || "";
		source.frontendModel = true;
		source.sourceDirty = frontendModelDirty(request, file);
		return source;
	}

	function addFrontendModels(out, config, path, request, blocks) {
		var builders = frontbuilderSettings(config);
		var folder = virtualNode("frontends", "folder", "frontends", path,
			"Frontends", compact({ count: builders.length }), null, "mdi:monitor-dashboard");
		out.push(folder);
		builders.forEach(function (entry) {
			addFrontendBuilder(folder, entry.name, entry.settings, path + "." + safeVirtualName("builder", entry.name), request, blocks);
		});
	}

	function addFrontendBuilder(parent, name, settings, path, request, blocks) {
		settings = settings || {};
		var modelFile = frontendModelFile(settings.modelPath);
		var definition = {
			id: name,
			target: settings.target || "",
			modelPath: settings.modelPath || "",
			privateDir: settings.privateDir || "",
			buildOutput: settings.buildOutput || "",
			resourceRoot: settings.resourceRoot || ""
		};
		var sourceInfo = frontendSourceInfo(modelFile, "frontend-model", "", request);
		var builder = virtualNode("builder_" + name, "frontendBuilder", name, path,
			name === "svelte" ? "Svelte builder" : name + " builder", compact(definition),
			compact(sourceObjectInfo(sourceInfo, frontendBuilderPropertyDefinitions(),
				["id", "target", "modelPath", "privateDir", "buildOutput", "resourceRoot", "sourceRelativePath", "sourceWritable", "sourceDirty"])),
			"mdi:application-braces-outline");
		parent.children.push(builder);
		if (settings.modelPath) {
			builder.children.push(virtualNode("sourceModel", "frontendSource", "model", path + ".source",
				"Source model", compact({
					path: settings.modelPath,
					dirty: frontendModelDirty(request, modelFile)
				}), compact(sourceObjectInfo(sourceInfo, frontendSourcePropertyDefinitions(),
					["sourceRelativePath", "sourceWritable", "sourceDirty"])), "mdi:file-code-outline"));
		}
		var catalogNode = request.includeFrontendCatalog === false
			? null
			: addFrontendBlockCatalog(builder, name, settings, path, request, blocks);
		if (!settings.modelPath) {
			return;
		}
		if (!modelFile || !modelFile.isFile()) {
			builder.children.push(virtualNode("missingModel", "error", "frontendModel", path + ".model",
				"Missing model: " + String(settings.modelPath || ""), compact(definition), null, "mdi:alert-outline"));
			return;
		}
		try {
			var document = frontendModelDocument(request, modelFile, settings);
			var model = normalizeTree(document.model);
			builder.diagnostics = document.diagnostics || [];
			builder.definition = compact(Object.assign(definition, {
				appId: model.app && model.app.id || "",
				title: model.app && model.app.title || "",
				modelVersion: model.version || "",
				dirty: frontendModelDirty(request, modelFile)
			}));
			if (document.tree && document.tree.children) {
				addFrontendAuthoringTree(builder, document.tree, path, modelFile);
				if (catalogNode) {
					addFrontendAuthoringCatalogMirror(catalogNode, document.tree, path + ".catalog.authoring", modelFile);
				}
			} else {
				addFrontendModelTree(builder, model, path + ".model", modelFile);
			}
		} catch (e) {
			builder.children.push(virtualNode("modelError", "error", "frontendModel", path + ".model",
				"Invalid model: " + String(e && e.message || e), compact({ error: String(e && e.message || e) }), null, "mdi:alert-outline"));
		}
	}

	function frontendBuilderPropertyDefinitions() {
		return {
			id: propertyDefinition("Builder", "Base properties", "Frontend builder family.", { readOnly: true }),
			target: propertyDefinition("Target", "Base properties", "Frontend target runtime.", { readOnly: true }),
			modelPath: propertyDefinition("Model path", "Base properties", "Project-relative frontend model source.", { readOnly: true, hidden: true }),
			privateDir: propertyDefinition("Private dir", "Build", "Generated source directory.", { readOnly: true }),
			buildOutput: propertyDefinition("Build output", "Build", "Production output directory.", { readOnly: true }),
			resourceRoot: propertyDefinition("Resource root", "Build", "Builder resource directory.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative model source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this model can be edited from this project.", { readOnly: true }),
			sourceDirty: propertyDefinition("Dirty", "Information", "Whether this source has a live draft.", { readOnly: true })
		};
	}

	function frontendSourcePropertyDefinitions() {
		return {
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative model source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this model can be edited from this project.", { readOnly: true }),
			sourceDirty: propertyDefinition("Dirty", "Information", "Whether this source has a live draft.", { readOnly: true })
		};
	}

	function addFrontendBlockCatalog(parent, name, settings, path, request, flowBlocks) {
		var blocks = (frontendBlocksForSettings(name, settings) || [])
			.concat(frontendPortableBlockDescriptors(flowBlocks));
		var createDescriptors = frontendCreateDescriptorsForSettings(name, settings) || [];
		if (blocks.length === 0 && createDescriptors.length === 0) {
			return null;
		}
		var catalog = virtualNode("catalog", "folder", "frontendBlockCatalog", path + ".catalog",
			"Catalog", compact({
				count: blocks.length
			}), null, "mdi:library-shelves");
		parent.children.push(catalog);
		var providers = {};
		blocks.forEach(function (block) {
			var provider = frontendCatalogProvider(block);
			if (!providers[provider]) {
				providers[provider] = [];
			}
			providers[provider].push(block);
		});
		var projectProvider = currentFrontendProjectProvider();
		if (!providers[projectProvider]) {
			providers[projectProvider] = [];
		}
		Object.keys(providers).sort(function (a, b) {
			if (a === projectProvider) {
				return -1;
			}
			if (b === projectProvider) {
				return 1;
			}
			return a.localeCompare(b);
		}).forEach(function (provider) {
			addFrontendProviderCatalog(catalog, name, projectProvider, provider, providers[provider],
				path + ".catalog." + safeVirtualName("provider", provider), settings, request);
		});
		return catalog;
	}

	function currentFrontendProjectProvider() {
		var dir = projectDir ? projectDir() : null;
		return dir && typeof env.projectNameForRoot === "function"
			? String(env.projectNameForRoot(dir) || "project")
			: dir ? String(dir.getName()) : "project";
	}

	function frontendCatalogProvider(block) {
		return String(block && block.provider || "project") || "project";
	}

	function frontendCatalogNamespace(block) {
		return String(block && block.namespace || "_root") || "_root";
	}

	function frontendPortableBlockDescriptors(blocks) {
		var out = [];
		var seen = {};
		Object.keys(blocks || {}).sort().forEach(function (name) {
			var block = blocks[name];
			if (!block) {
				return;
			}
			var descriptor;
			try {
				descriptor = normalizeTree(blockDescriptor(block) || {});
			} catch (e) {
				return;
			}
			var targets = frontendArray(descriptor.targets);
			var frontend = descriptor.implementations && descriptor.implementations.frontend || {};
			var blockId = String(descriptor.blockId || name || "");
			if (!blockId || targets.indexOf("frontend") < 0 || !frontend.file ||
					descriptor.visibility === "private" || seen[blockId]) {
				return;
			}
			seen[blockId] = true;
			var properties = {};
			var insert = {
				id: String(descriptor.localName || blockId.split(".").pop() || "result"),
				kind: "portableBlock",
				tag: frontendPortableBlockTag(blockId),
				block: blockId,
				target: String(descriptor.localName || blockId.split(".").pop() || "result") + "Result"
			};
			Object.keys(descriptor.props || {}).forEach(function (propertyName) {
				var definition = normalizeTree(descriptor.props[propertyName] || {});
				if (definition.mode === "write" ||
						definition.kind === "path" && definition.mode !== "read") {
					return;
				}
				properties[propertyName] = Object.assign({}, definition, {
					kind: "binding",
					type: String(definition.type || "unknown")
				});
				if (definition["default"] !== undefined) {
					insert[propertyName] = {
						mode: "literal",
						value: definition["default"]
					};
				}
			});
			var implementationFile = frontendPortableImplementationFile(descriptor);
			out.push({
				id: "flow.block." + blockId,
				name: descriptor.localName || titleFromCamel(blockId.split(".").pop()),
				localName: descriptor.localName || blockId.split(".").pop(),
				namespace: descriptor.namespace || blockId.split(".").slice(0, -1).join("."),
				label: descriptor.label || titleFromCamel(descriptor.localName || blockId.split(".").pop()),
				category: "Flow / " + titleFromCamel(descriptor.namespace || blockId.split(".")[0] || "Blocks"),
				kind: "frontendActionBlockDefinition",
				tag: insert.tag,
				targetKinds: ["frontendEventBlock"],
				acceptedPositions: ["inside"],
				traits: ["ui.action"],
				slots: {},
				description: descriptor.description || "",
				icon: descriptor.icon || "mdi:puzzle-plus-outline",
				insert: insert,
				defaults: insert,
				properties: Object.assign({
					id: { label: "Id", type: "string" },
					target: { label: "Result target", type: "string" }
				}, properties),
				implementation: {
					block: blockId,
					file: implementationFile
				},
				implementations: {
					frontend: {
						runtime: String(frontend.runtime || "browser"),
						kind: "flow-svelte-authoring",
						block: blockId,
						file: implementationFile
					}
				},
				provider: descriptor.provider || descriptor.origin || "project",
				visibility: descriptor.visibility || "public",
				file: implementationFile,
				sourcePath: implementationFile,
				targets: targets,
				effects: descriptor.effects || [],
				resultSchema: frontendPortableResultSchema(descriptor.outputs || descriptor.output || {})
			});
		});
		return out;
	}

	function frontendPortableBlockTag(blockId) {
		return String(blockId || "").split(/[^A-Za-z0-9]+/).filter(function (part) {
			return !!part;
		}).map(function (part) {
			return part.charAt(0).toUpperCase() + part.substring(1);
		}).join("") || "FlowBlock";
	}

	function frontendPortableImplementationFile(descriptor) {
		var frontend = descriptor && descriptor.implementations && descriptor.implementations.frontend || {};
		if (!descriptor || !descriptor.file || !frontend.file) {
			return "";
		}
		try {
			return String(new File(new File(String(descriptor.file)).getParentFile(), String(frontend.file))
				.getCanonicalPath());
		} catch (e) {
			return "";
		}
	}

	function frontendPortableResultSchema(outputs) {
		outputs = normalizeTree(outputs || {});
		var names = Object.keys(outputs);
		if (names.length === 1 && names[0] === "out") {
			return normalizeTree(outputs.out || {});
		}
		var properties = {};
		names.forEach(function (name) {
			properties[name] = normalizeTree(outputs[name] || {});
		});
		return {
			type: "object",
			properties: properties
		};
	}

	function addFrontendProviderCatalog(parent, name, projectProvider, provider, blocks, path, settings, request) {
		var writable = provider === projectProvider;
		var definition = {
			provider: provider,
			count: blocks.length,
			sourceWritable: writable
		};
		var info = sourceObjectInfo(definition, frontendCatalogProviderPropertyDefinitions(), ["provider", "count", "sourceWritable"]);
		var providerNode = virtualNode("provider_" + safeVirtualName("provider", provider), "folder", "frontendBlockProvider",
			path, provider, compact(definition), compact(info), writable ? "mdi:folder-account-outline" : "mdi:package-variant-closed");
		parent.children.push(providerNode);
		var namespaces = {};
		blocks.forEach(function (block) {
			var namespace = frontendCatalogNamespace(block);
			if (!namespaces[namespace]) {
				namespaces[namespace] = [];
			}
			namespaces[namespace].push(block);
		});
		Object.keys(namespaces).sort(function (a, b) {
			if (a === "project") {
				return -1;
			}
			if (b === "project") {
				return 1;
			}
			return a.localeCompare(b);
		}).forEach(function (namespace) {
			addFrontendNamespaceCatalog(providerNode, name, namespace, namespaces[namespace],
				path + "." + safeVirtualName("namespace", namespace), settings, writable, request);
		});
	}

	function addFrontendNamespaceCatalog(parent, name, namespace, blocks, path, settings, writable, request) {
		var definition = {
			namespace: namespace === "_root" ? "" : namespace,
			count: blocks.length,
			sourceWritable: writable === true
		};
		var info = sourceObjectInfo(definition, frontendCatalogNamespacePropertyDefinitions(), ["namespace", "count", "sourceWritable"]);
		var label = namespace === "_root" ? "(root)" : namespace;
		var namespaceNode = virtualNode("namespace_" + safeVirtualName("namespace", namespace), "folder", "frontendBlockNamespace",
			path, label, compact(definition), compact(info), writable ? "mdi:folder-pound-outline" : "mdi:folder-outline");
		parent.children.push(namespaceNode);
		addFrontendBlocksFolder(namespaceNode, name, blocks.filter(frontendStructureBlock), path + ".structureBlocks",
			"structureBlocks", "frontendStructureBlocks", "Structure blocks", "mdi:shape-outline", settings, writable, request);
		addFrontendBlocksFolder(namespaceNode, name, blocks.filter(frontendActionBlock), path + ".actionBlocks",
			"actionBlocks", "frontendActionBlocks", "Action blocks", "mdi:gesture-tap", settings, writable, request);
		addFrontendBlocksFolder(namespaceNode, name, blocks.filter(frontendUiBlock), path + ".uiBlocks",
			"uiBlocks", "frontendBlocks", "UI blocks", "mdi:widgets-outline", settings, writable, request);
	}

	function frontendStructureBlock(block) {
		var kind = String(block && block.kind || "");
		return kind.indexOf("frontend") === 0
			&& kind.endsWith("Definition")
			&& kind !== "frontendUiBlockDefinition"
			&& !frontendActionBlock(block);
	}

	function frontendActionBlock(block) {
		var kind = String(block && block.kind || "");
		return kind === "frontendActionBlockDefinition"
			|| kind === "frontendClientActionDefinition"
			|| kind === "frontendBackendCallDefinition"
			|| kind === "frontendSharedActionDefinition"
			|| kind === "frontendClientActionSourceDefinition";
	}

	function frontendUiBlock(block) {
		return String(block && block.kind || "") === "frontendUiBlockDefinition"
			|| !frontendStructureBlock(block) && !frontendActionBlock(block);
	}

	function addFrontendBlocksFolder(parent, name, blocks, path, nodeName, nodeType, summary, icon, settings, showWhenEmpty, request) {
		if (!blocks.length && !showWhenEmpty) {
			return;
		}
		var folderDefinition = {
			count: blocks.length,
			sourceWritable: showWhenEmpty === true
		};
		var folder = virtualNode(nodeName, "folder", nodeType, path,
			summary, compact(folderDefinition),
			compact(sourceObjectInfo(folderDefinition, frontendCatalogProviderPropertyDefinitions(), ["count", "sourceWritable"])), icon);
		parent.children.push(folder);
		blocks.slice().sort(function (a, b) {
			var left = a.localName || a.label || a.name || a.id || "";
			var right = b.localName || b.label || b.name || b.id || "";
			return String(left).localeCompare(String(right));
		}).forEach(function (block) {
			var blockSource = sourceDefinitionForFile(block.file || block.sourcePath || "", "frontend-block");
			var blockInfo = sourceObjectInfo(blockSource,
				frontendBlockPropertyDefinitions(),
				["id", "namespace", "localName", "name", "label", "kind", "tag", "category", "description", "runtime",
					"target", "provider", "sourceRelativePath", "sourceWritable"]);
			blockInfo.frontendBlock = true;
			blockInfo.frontendBuilder = name;
			if (!blockSource.sourceWritable) {
				blockInfo.readOnlyReference = true;
			}
			if (blockSource.sourceWritable && isFlowSvelteFrontendBlock(block)) {
				blockInfo.frontendInsertSourcePath = blockSource.sourcePath;
				blockInfo.frontendInsertMutationPath = "nodes";
			}
			["icon", "iconify", "iconUrl", "iconSvg", "iconFile", "iconFile16", "iconFile32"].forEach(function (key) {
				if (block[key] !== undefined && block[key] !== null && String(block[key]) !== "") {
					blockInfo[key] = String(block[key]);
				}
			});
			var blockDefinition = compact(block);
			["sourcePath", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"].forEach(function (key) {
				if (blockSource[key] !== undefined) {
					blockDefinition[key] = blockSource[key];
				}
			});
			var blockPath = path + "." + safeVirtualName("block", block.id || block.name);
			var blockNode = virtualNode("block_" + (block.id || block.name), "frontendBlock", block.id || block.name,
				blockPath, block.label || block.name || block.id,
				blockDefinition, compact(blockInfo), null);
			folder.children.push(blockNode);
			addFrontendBlockDetails(blockNode, block, blockPath, settings, request);
		});
	}

	function frontendCatalogProviderPropertyDefinitions() {
		return {
			provider: propertyDefinition("Provider", "Information", "Project or referenced library providing these frontend catalog entries.", { readOnly: true }),
			count: propertyDefinition("Count", "Information", "Number of catalog entries in this provider.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this provider is the current project.", { readOnly: true })
		};
	}

	function frontendCatalogNamespacePropertyDefinitions() {
		return {
			namespace: propertyDefinition("Namespace", "Information", "Frontend catalog namespace.", { readOnly: true }),
			count: propertyDefinition("Count", "Information", "Number of catalog entries in this namespace.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this namespace belongs to the current project.", { readOnly: true })
		};
	}

	function frontendBlockPropertyDefinitions() {
		return {
			id: propertyDefinition("Id", "Base properties", "Reusable UI block id.", { readOnly: true }),
			namespace: propertyDefinition("Namespace", "Base properties", "Path-derived frontend block namespace.", { readOnly: true }),
			localName: propertyDefinition("Local name", "Base properties", "Frontend block local name inside its namespace.", { readOnly: true }),
			label: propertyDefinition("Label", "Base properties", "Visible palette label.", { readOnly: true }),
			name: propertyDefinition("Name", "Base properties", "Reusable UI block name.", { readOnly: true }),
			kind: propertyDefinition("Kind", "Base properties", "Frontend object kind inserted by this block.", { readOnly: true }),
			tag: propertyDefinition("Tag", "Base properties", "Svelte component tag inserted by this block.", { readOnly: true }),
			target: propertyDefinition("Target", "Base properties", "Frontend target runtime.", { readOnly: true }),
			provider: propertyDefinition("Provider", "Information", "Library providing this UI block.", { readOnly: true }),
			category: propertyDefinition("Category", "Information", "Palette category.", { readOnly: true }),
			description: propertyDefinition("Description", "Documentation", "Short UI block documentation.", { readOnly: true }),
			longDescription: propertyDefinition("Long description", "Documentation", "Detailed UI block documentation.", { readOnly: true }),
			runtime: propertyDefinition("Runtime", "Implementation", "Frontend UI block runtime kind.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "UI block descriptor source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this descriptor can be edited from this project.", { readOnly: true })
		};
	}

	function addFrontendBlockDetails(parent, block, path, settings, request) {
		addFrontendBlockProperties(parent, block, path);
		addFrontendBlockSnippets(parent, block, path);
		if (!addFrontendFlowSvelteBlockTree(parent, block, path, settings, request)) {
			addFrontendBlockImplementation(parent, block, path, settings);
		}
	}

	function addFrontendBlockProperties(parent, block, path) {
		var props = normalizeTree(block && (block.properties || block.props) || {});
		var keys = Object.keys(props);
		var propsSource = sourceDefinitionForFile(block.file || block.sourcePath || "", "frontend-properties");
		propsSource.sourceMutationPath = "props";
		var folderInfo = sourceObjectInfo(propsSource, blockPropertiesFolderDefinitions(), ["count", "sourceRelativePath", "sourceWritable"]);
		var folder = virtualNode("properties", "folder", "frontendBlockProperties",
			path + ".properties", "Properties", compact({ count: keys.length }), compact(folderInfo), "mdi:form-textbox");
		parent.children.push(folder);
		keys.forEach(function (key) {
			var propDefinition = normalizeTree(props[key] || {});
			propDefinition.name = key;
			var propSource = sourceDefinitionForFile(block.file || block.sourcePath || "", "frontend-property");
			propSource.sourceMutationPath = "props." + key;
			var propInfo = sourceObjectInfo(propSource,
				blockPropertyDefinitionDefinitions(),
				["name", "label", "kind", "type", "mode", "description", "default", "items", "component",
					"sourceRelativePath", "sourceOrigin", "sourceWritable"]);
			folder.children.push(virtualNode("property_" + safeVirtualName("property", key), "frontendBlockProperty", key,
				path + ".properties." + safeVirtualName("property", key),
				propertyDefinitionSummary(key, propDefinition), compact(propDefinition), compact(propInfo),
				propertyDefinitionIcon(propDefinition)));
		});
	}

	function addFrontendBlockSnippets(parent, block, path) {
		var snippets = normalizeTree(block && block.snippets || {});
		var keys = Object.keys(snippets);
		if (!keys.length) {
			return;
		}
		var folder = virtualNode("snippets", "folder", "frontendBlockSnippets",
			path + ".snippets", "Snippets", compact({ count: keys.length }), null, "mdi:code-braces");
		parent.children.push(folder);
		keys.forEach(function (key) {
			var definition = normalizeTree(snippets[key] || {});
			definition.name = key;
			folder.children.push(virtualNode("snippet_" + safeVirtualName("snippet", key), "frontendBlockSnippet", key,
				path + ".snippets." + safeVirtualName("snippet", key),
				key, compact(definition), null, "mdi:code-braces"));
		});
	}

	function isFlowSvelteFrontendBlock(block) {
		var sourcePath = String(block && (block.file || block.sourcePath) || "");
		return String(block && block.runtime || "") === "flow-svelte" || sourcePath.endsWith(".flow.svelte");
	}

	function flowSvelteLiteSlotSpec(name) {
		var specs = {
			structure: { label: "Structure", kind: "frontendStructure", type: "structure", accepts: ["ui.block", "ui.directive"] },
			events: { label: "Events", kind: "frontendEvents", type: "events", accepts: ["ui.event"] },
			actions: { label: "Actions", kind: "frontendSlot", type: "actions", accepts: ["ui.action"] },
			variables: { label: "Variables", kind: "frontendActionVariables", type: "variables", accepts: ["ui.action.variable"] },
			"default": { label: "Each", kind: "frontendSlot", type: "default", accepts: ["ui.block", "ui.directive"] },
			then: { label: "Then", kind: "frontendSlot", type: "then", accepts: ["ui.block", "ui.directive"] },
			"else": { label: "Else", kind: "frontendSlot", type: "else", accepts: ["ui.block", "ui.directive"] },
			pending: { label: "Pending", kind: "frontendSlot", type: "pending", accepts: ["ui.block", "ui.directive"] },
			"catch": { label: "Catch", kind: "frontendSlot", type: "catch", accepts: ["ui.block", "ui.directive"] },
			columns: { label: "Columns", kind: "frontendColumns", type: "columns", accepts: ["ui.table.column"] },
			data: { label: "Data", kind: "frontendDataBindings", type: "data", accepts: ["ui.data.binding"] }
		};
		return specs[name] || { label: titleFromCamel(name), kind: "frontendSlot", type: name, accepts: ["ui.block"] };
	}

	function flowSvelteLiteSlotName(tag) {
		var slots = {
			Structure: "structure",
			Children: "children",
			Events: "events",
			Actions: "actions",
			Variables: "variables",
			Default: "default",
			Then: "then",
			Else: "else",
			Pending: "pending",
			Catch: "catch",
			Columns: "columns",
			Data: "data"
		};
		return slots[String(tag || "")] || "";
	}

	function flowSvelteLiteTagKind(tag, props) {
		tag = String(tag || "");
		var explicit = String(props && props.kind || "");
		if (explicit) {
			return explicit;
		}
		if (tag === "JSON") {
			return "json";
		}
		if (tag === "ForEach") {
			return "each";
		}
		if (/^On[A-Z]/.test(tag)) {
			return lowerFirst(tag);
		}
		return lowerFirst(tag);
	}

	function flowSvelteLiteTreeKind(kind) {
		if (kind === "if" || kind === "each" || kind === "await") {
			return "frontendDirectiveBlock";
		}
		if (/^on[A-Z]/.test(kind)) {
			return "frontendEventBlock";
		}
		if (flowSvelteLiteActionKind(kind)) {
			return "frontendActionBlock";
		}
		if (kind === "variable") {
			return "frontendActionVariable";
		}
		if (kind === "column" || kind === "dataBinding") {
			return "frontendDataBlock";
		}
		return kind;
	}

	function flowSvelteLiteActionKind(kind) {
		return [
			"callSequence", "portableBlock", "runAxiom",
			"fullSyncGet", "fullSyncView", "fullSyncPost", "fullSyncPutAttachment", "fullSyncGetAttachment", "fullSyncSync", "fullSyncReset",
			"setValue", "updateList", "updateNumber", "navigate", "goBack"
		].indexOf(String(kind || "")) !== -1;
	}

	function flowSvelteLiteTraits(kind) {
		if (kind === "if" || kind === "each" || kind === "await") {
			return ["ui.directive", "ui.container"];
		}
		if (/^on[A-Z]/.test(kind)) {
			return ["ui.event", "ui.container"];
		}
		if (flowSvelteLiteActionKind(kind)) {
			return ["ui.action"];
		}
		if (kind === "variable") {
			return ["ui.action.variable"];
		}
		if (kind === "column") {
			return ["ui.table.column"];
		}
		if (kind === "dataBinding") {
			return ["ui.data.binding"];
		}
		if (kind === "button") {
			return ["ui.block", "ui.interactive", "ui.events.owner"];
		}
		return ["ui.block"];
	}

	function flowSvelteLiteValueLabel(value) {
		if (value === undefined || value === null) {
			return "";
		}
		if (typeof value !== "object") {
			return String(value);
		}
		if (value.mode === "literal") {
			return value.value !== null && typeof value.value !== "object" ? String(value.value) : "";
		}
		if (value.mode === "expression") {
			return String(value.expression || "");
		}
		if (value.mode === "source" && value.source) {
			var source = value.source;
			var base = source.name || source.actionId || source.scopeId || source.value || source.category || "source";
			var path = (value.path || []).map(function (segment) {
				return segment && segment.kind === "index" ? "[" + segment.index + "]" : "." + String(segment && segment.name || "");
			}).join("");
			return "@" + String(source.category || "source") + "." + String(base) + path;
		}
		return "";
	}

	function flowSvelteLiteLabel(kind, tag, props) {
		if (kind === "text") {
			return flowSvelteLiteValueLabel(props.text) || "Text";
		}
		if (kind === "button") {
			return flowSvelteLiteValueLabel(props.label) || "Button";
		}
		if (kind === "callSequence") {
			return String(props.requestable || "CallSequence");
		}
		if (kind === "setValue") {
			return String(props.target || props.id || "Set value");
		}
		if (kind === "variable") {
			return String(props.name || "Variable");
		}
		if (kind === "column") {
			return String(props.label || "Column");
		}
		if (kind === "if") {
			return "If";
		}
		return String(props.label || props.title || props.id || titleFromCamel(tag || kind));
	}

	function flowSvelteLiteSlot(name, parentPath, children, sourcePath) {
		var spec = flowSvelteLiteSlotSpec(name);
		var path = parentPath + ".slots." + name + ".children";
		return {
			id: name,
			kind: spec.kind,
			type: spec.type,
			label: spec.label,
			sourcePath: sourcePath,
			sourceMutationPath: path,
			sourceWritable: true,
			props: { count: children.length },
			traits: ["ui.container"],
			slots: {
				[name]: frontendSlot(spec.label, spec.accepts, path, true)
			},
			children: children
		};
	}

	function flowSvelteLiteSlotDefinition(name, path) {
		var spec = flowSvelteLiteSlotSpec(name);
		return frontendSlot(spec.label, spec.accepts, path, true);
	}

	function flowSvelteLiteDefaultSlotNames(kind) {
		if (kind === "button") {
			return ["events"];
		}
		if (/^on[A-Z]/.test(kind)) {
			return ["actions"];
		}
		if (kind === "callSequence" || /^fullSync(?:Get|View|Sync)$/.test(kind)) {
			return ["variables"];
		}
		if (kind === "if") {
			return ["then", "else"];
		}
		if (kind === "each") {
			return ["default", "else"];
		}
		if (kind === "await") {
			return ["pending", "then", "catch"];
		}
		if (kind === "table") {
			return ["columns", "data"];
		}
		return [];
	}

	function flowSvelteLiteParseAttributes(raw) {
		var props = {};
		var text = String(raw || "");
		var i = 0;
		while (i < text.length) {
			while (i < text.length && /\s/.test(text.charAt(i))) i++;
			var nameStart = i;
			while (i < text.length && /[A-Za-z0-9_:-]/.test(text.charAt(i))) i++;
			var name = text.substring(nameStart, i);
			if (!name || !/^[A-Za-z_]/.test(name)) {
				i++;
				continue;
			}
			while (i < text.length && /\s/.test(text.charAt(i))) i++;
			if (text.charAt(i) !== "=") {
				props[name] = true;
				continue;
			}
			i++;
			while (i < text.length && /\s/.test(text.charAt(i))) i++;
			var start = i;
			var quote = text.charAt(i);
			if (quote === "\"" || quote === "'") {
				i++;
				start = i;
				while (i < text.length && text.charAt(i) !== quote) {
					if (text.charAt(i) === "\\") i++;
					i++;
				}
				props[name] = text.substring(start, i);
				i++;
				continue;
			}
			if (text.charAt(i) === "{") {
				var end = flowSvelteLiteBalancedEnd(text, i);
				var expression = text.substring(i + 1, end < 0 ? text.length : end);
				props[name] = flowSvelteLiteExpressionValue(expression);
				i = end < 0 ? text.length : end + 1;
				continue;
			}
			while (i < text.length && !/\s/.test(text.charAt(i))) i++;
			props[name] = text.substring(start, i);
		}
		return props;
	}

	function flowSvelteLiteBalancedEnd(text, start) {
		var depth = 0;
		var quote = "";
		for (var i = start; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\") i++;
				else if (ch === quote) quote = "";
				continue;
			}
			if (ch === "\"" || ch === "'") quote = ch;
			else if (ch === "{") depth++;
			else if (ch === "}" && --depth === 0) return i;
		}
		return -1;
	}

	function flowSvelteLiteExpressionValue(expression) {
		var value = String(expression || "").trim();
		if (value === "true") return true;
		if (value === "false") return false;
		if (value === "null") return null;
		if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
		if (value.charAt(0) === "{" || value.charAt(0) === "[") {
			try {
				return JSON.parse(value);
			} catch (e) {
				try {
					var json = value
						.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
						.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, function (_, content) {
							return JSON.stringify(content.replace(/\\'/g, "'") );
						});
					return JSON.parse(json);
				} catch (ignored) {}
			}
		}
		return { __flowSvelteExpression: value };
	}

	function flowSvelteLiteNormalizeAttributeModes(props, definitions) {
		Object.keys(props || {}).forEach(function (name) {
			var raw = props[name];
			var definition = definitions && definitions[name] || {};
			var binding = definition.kind === "binding" || definition.type === "binding";
			var expression = raw && typeof raw === "object" && typeof raw.__flowSvelteExpression === "string";
			if (expression) {
				props[name] = binding
					? { mode: "expression", expression: raw.__flowSvelteExpression }
					: name === "marker" ? raw : raw.__flowSvelteExpression;
				return;
			}
			if (!binding || raw === "" || raw === null || raw === undefined || flowSvelteLiteIsBinding(raw) || flowSvelteLiteIsBindingReference(raw)) return;
			if (raw && typeof raw === "object" && (raw.mode === "action" || raw.mode === "context")) return;
			props[name] = { mode: "literal", value: raw };
		});
	}

	function flowSvelteLitePropertyDefinitions(kind) {
		var binding = { label: "Source", kind: "binding", type: "object" };
		var legacyBinding = { label: "Source", kind: "binding", type: "object", hidden: true };
		if (kind === "text") {
			return {
				text: { label: "Text", kind: "binding", type: "binding" },
				source: legacyBinding
			};
		}
		if (kind === "image") {
			return {
				src: { label: "Source URL", kind: "binding", type: "binding" },
				source: legacyBinding
			};
		}
		if (kind === "button") {
			return {
				label: { label: "Label", kind: "binding", type: "binding" },
				source: legacyBinding
			};
		}
		if (kind === "table" || kind === "json" || kind === "each") {
			return { source: binding };
		}
		if (kind === "if") return { test: { label: "Condition", kind: "binding", type: "object" } };
		if (kind === "setValue") return { value: { label: "Value", kind: "binding", type: "object" } };
		if (kind === "variable") return {
			name: { label: "Name", kind: "text", type: "string" },
			value: { label: "Value", kind: "binding", type: "object" }
		};
		if (kind === "callSequence") return {
			id: { label: "Id", kind: "text", type: "string" },
			target: { label: "Result target", kind: "text", type: "string" },
			requestable: { label: "Requestable", kind: "requestable", type: "requestable" },
			marker: { label: "Marker", kind: "text", type: "string" }
		};
		return {};
	}

	function flowSvelteLiteBindingPath(path) {
		if (!path || Object.prototype.toString.call(path) !== "[object Array]") return false;
		return path.every(function (step) {
			return step && typeof step === "object" &&
				((step.kind === "property" && typeof step.name === "string" && step.name !== "") ||
				 (step.kind === "index" && typeof step.index === "number"));
		});
	}

	function flowSvelteLiteIsBinding(value) {
		if (!value || typeof value !== "object" || value.splice) return false;
		if (value.mode === "literal") return Object.prototype.hasOwnProperty.call(value, "value");
		if (value.mode === "expression") return typeof value.expression === "string";
		if (value.mode !== "source" || !value.source || typeof value.source !== "object" || !flowSvelteLiteBindingPath(value.path)) return false;
		var source = value.source;
		if (source.category === "requestable" || source.category === "action") return typeof source.actionId === "string" && source.actionId !== "";
		if (source.category === "fullsync") return typeof source.actionId === "string" && source.actionId !== "" && typeof source.operation === "string" && source.operation !== "";
		if (source.category === "local") return typeof source.name === "string" && source.name !== ""
			&& typeof source.scopeId === "string" && source.scopeId !== "";
		if (source.category === "iteration") return typeof source.scopeId === "string" && source.scopeId !== "" && (source.value === "item" || source.value === "index");
		if (source.category === "event") return source.value === "event";
		return source.category === "route" && source.value === "route";
	}

	function flowSvelteLiteIsBindingReference(value) {
		return typeof value === "string" && /^@[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[\d+\]))*$/.test(value.trim());
	}

	function flowSvelteLiteBindingSuggestion(value) {
		if (!value || value.mode !== "action" || typeof value.actionId !== "string") return null;
		var path = typeof value.path === "string" && value.path !== "" ? value.path.split(".").map(function (name) {
			return { kind: "property", name: name };
		}) : [];
		return { mode: "source", source: { category: "requestable", actionId: value.actionId }, path: path };
	}

	function flowSvelteLiteBindingReferenceSuggestion(value) {
		if (!value || typeof value !== "object") return null;
		var root = value.mode === "action" ? value.actionId : value.mode === "context" ? value.context : "";
		if (typeof root !== "string" || !root) return null;
		var suffix = typeof value.path === "string" && value.path ? "." + value.path : "";
		return "@" + root + suffix;
	}

	function editDistance(left, right) {
		left = String(left || "").toLowerCase();
		right = String(right || "").toLowerCase();
		var previous = [];
		for (var j = 0; j <= right.length; j++) {
			previous[j] = j;
		}
		for (var i = 1; i <= left.length; i++) {
			var current = [i];
			for (j = 1; j <= right.length; j++) {
				current[j] = Math.min(
					current[j - 1] + 1,
					previous[j] + 1,
					previous[j - 1] + (left.charAt(i - 1) === right.charAt(j - 1) ? 0 : 1)
				);
			}
			previous = current;
		}
		return previous[right.length];
	}

	function nearestNames(name, validNames) {
		return (validNames || []).map(function (candidate) {
			return { name: candidate, distance: editDistance(name, candidate) };
		}).sort(function (left, right) {
			return left.distance - right.distance || left.name.localeCompare(right.name);
		});
	}

	function flowSvelteCallVariables(node) {
		var variables = [];
		(node && node.children || []).forEach(function (child) {
			if (String(child && child.kind || "") !== "frontendActionVariables" &&
					String(child && child.type || "") !== "variables" && String(child && child.id || "") !== "variables") {
				return;
			}
			(child.children || []).forEach(function (variable) {
				var kind = String(variable && variable.props && variable.props.kind || "");
				if (kind === "variable" || String(variable && variable.type || "") === "Variable" ||
						String(variable && variable.tag || "") === "Variable") {
					variables.push(variable);
				}
			});
		});
		return variables;
	}

	function flowSvelteUnknownCallVariableDiagnostic(variable, requestable, validNames) {
		var name = String(variable && variable.props && variable.props.name || "");
		var ranked = nearestNames(name, validNames);
		var nearest = ranked.slice(0, 3).map(function (entry) { return entry.name; });
		var correction = "";
		if (validNames.length === 1) {
			correction = validNames[0];
		} else if (ranked.length && ranked[0].distance <= Math.max(1, Math.floor(Math.max(name.length, ranked[0].name.length) / 3)) &&
				(!ranked[1] || ranked[0].distance < ranked[1].distance)) {
			correction = ranked[0].name;
		}
		var variablePath = String(variable && variable.sourceMutationPath || "");
		var namePath = variablePath + ".props.name";
		var accepted = validNames.length ? validNames.join(", ") : "none";
		var diagnostic = {
			level: "error",
			severity: "error",
			code: "FRONTEND_CALLSEQUENCE_VARIABLE_UNKNOWN",
			message: "Unknown CallSequence variable " + JSON.stringify(name) + " for " + requestable + ". Accepted inputs: " + accepted + ".",
			path: namePath,
			requestable: requestable,
			variable: name,
			validVariables: validNames,
			nearestValidNames: nearest
		};
		if (correction) {
			diagnostic.suggestedName = correction;
			diagnostic.fix = { op: "replace", path: namePath, value: correction };
			diagnostic.next = "Replace <Variable name=" + JSON.stringify(name) + "> with <Variable name=" +
				JSON.stringify(correction) + "> and rerun frontend code-check.";
		} else if (!validNames.length) {
			diagnostic.fix = { op: "remove", path: variablePath };
			diagnostic.next = "Remove <Variable name=" + JSON.stringify(name) + "> and rerun frontend code-check.";
		} else {
			diagnostic.next = "Rename <Variable name=" + JSON.stringify(name) + "> to one of: " + nearest.join(", ") +
				"; then rerun frontend code-check.";
		}
		return diagnostic;
	}

	function flowSvelteCallContractDiagnostics(root, request) {
		var diagnostics = [];
		function visit(node) {
			var kind = String(node && node.props && node.props.kind || "");
			if (kind === "callSequence" && typeof node.props.requestable === "string" && node.props.requestable.trim()) {
				var requestable = node.props.requestable.trim();
				var contract = null;
				try {
					contract = requestableInputContract(requestable, request || {});
				} catch (_unavailableContract) {
				}
				var schema = contract && contract.schema ? contract.schema : contract;
				if (schema && schema.properties && typeof schema.properties === "object" &&
						Object.prototype.toString.call(schema.properties) !== "[object Array]") {
					var validNames = Object.keys(schema.properties).sort();
					flowSvelteCallVariables(node).forEach(function (variable) {
						var name = String(variable && variable.props && variable.props.name || "");
						if (name && !Object.prototype.hasOwnProperty.call(schema.properties, name)) {
							diagnostics.push(flowSvelteUnknownCallVariableDiagnostic(variable, requestable, validNames));
						}
					});
				}
			}
			(node && node.children || []).forEach(visit);
		}
		visit(root);
		return diagnostics;
	}

	function mergeFrontendDiagnostics(existing, additions) {
		var out = (existing || []).slice(0);
		(additions || []).forEach(function (diagnostic) {
			var duplicate = out.some(function (item) {
				return item && diagnostic && item.code === diagnostic.code && item.path === diagnostic.path;
			});
			if (!duplicate) {
				out.push(diagnostic);
			}
		});
		return out;
	}

	function flowSvelteLiteBindingDiagnostics(root) {
		var diagnostics = [];
		var actionIds = {};
		function collectActions(node) {
			var kind = String(node && node.props && node.props.kind || "");
			if (kind === "callSequence" || kind === "setValue" || /^fullSync(?:Get|View|Sync|Reset)$/.test(kind)) {
				var id = String(node.props.target || node.props.id || node.id || "");
				if (id) actionIds[id] = true;
				if (node.props.id) actionIds[String(node.props.id)] = true;
			}
			(node && node.children || []).forEach(collectActions);
		}
		collectActions(root);
		function referenceVisible(value, scopes) {
			if (!flowSvelteLiteIsBindingReference(value)) return false;
			var firstMatch = String(value).substring(1).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
			var first = firstMatch ? firstMatch[0] : "";
			if (first === "event" || actionIds[first]) return true;
			return (scopes || []).some(function (scope) {
				return first === scope.id || first === scope.item || first === scope.index;
			});
		}
		function visit(node, scopes) {
			var definitions = node && node.propertyDefinitions || {};
			Object.keys(definitions).forEach(function (name) {
				var definition = definitions[name] || {};
				var value = node.props && node.props[name];
				if ((definition.kind === "binding" || definition.type === "binding") && value !== undefined && value !== "" &&
						!flowSvelteLiteIsBinding(value) && !referenceVisible(value, scopes)) {
					var intuitive = flowSvelteLiteIsBindingReference(value);
					var diagnostic = {
						level: "error",
						severity: "error",
						code: intuitive ? "FRONTEND_BINDING_REFERENCE_UNKNOWN" : "FRONTEND_BINDING_INVALID",
						message: intuitive
							? "Binding reference " + String(value) + " cannot be resolved from the actions or lexical scopes visible here."
							: "Property " + name + " on " + String(node.id || node.tag || "node") + " requires an intuitive @reference or structured FlowValueBinding.",
						path: String(node.sourceMutationPath || "") + ".props." + name
					};
					var suggestion = flowSvelteLiteBindingSuggestion(value);
					if (suggestion) diagnostic.suggestedBinding = suggestion;
					var referenceSuggestion = flowSvelteLiteBindingReferenceSuggestion(value);
					if (referenceSuggestion) diagnostic.suggestedReference = referenceSuggestion;
					diagnostics.push(diagnostic);
				}
			});
			var kind = String(node && node.props && node.props.kind || "");
			if (kind === "callSequence" && node.props.marker && typeof node.props.marker === "object" &&
					typeof node.props.marker.__flowSvelteExpression === "string") {
				var marker = String(node.props.id || node.id || "callSequence");
				diagnostics.push({
					severity: "error",
					code: "FRONTEND_CALLSEQUENCE_MARKER_STATIC_REQUIRED",
					message: "CallSequence marker is a stable source identity and cannot be a browser expression.",
					path: String(node.sourceMutationPath || "") + ".props.marker",
					suggestedValue: marker,
					fix: { op: "replace", path: String(node.sourceMutationPath || "") + ".props.marker", value: marker }
				});
			}
			var actionTraits = node.traits || [];
			if (actionTraits.indexOf("ui.action") !== -1 || actionTraits.indexOf("ui.action.variable") !== -1) {
				Object.keys(node.props || {}).forEach(function (property) {
					var value = node.props[property];
					if (property === "marker" || !value || typeof value !== "object" || value.mode !== "expression") return;
					var expression = String(value.expression || "").trim();
					var suggestedReference = /^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[\d+\]))*$/.test(expression)
						? "@" + expression : "";
					var propertyPath = String(node.sourceMutationPath || "") + ".props." + property;
					var actionDiagnostic = {
						severity: "error",
						code: "FRONTEND_ACTION_EXPRESSION_NOT_PORTABLE",
						message: "Client action property " + property + " does not execute free browser expressions. Use a literal, a schema-backed source, or a dual-target Flow block.",
						path: propertyPath
					};
					if (suggestedReference) {
						actionDiagnostic.suggestedReference = suggestedReference;
						actionDiagnostic.fix = { op: "replace", path: propertyPath, value: suggestedReference };
					}
					diagnostics.push(actionDiagnostic);
				});
			}
			var nextScopes = scopes || [];
			if (node && node.props && node.props.kind === "each") {
				nextScopes = nextScopes.concat({
					id: String(node.id || ""),
					item: String(node.props.context || "item"),
					index: String(node.props.index || "index")
				});
			}
			(node && node.children || []).forEach(function (child) { visit(child, nextScopes); });
		}
		visit(root, []);
		return diagnostics;
	}

	function flowSvelteLiteParseElements(source) {
		source = String(source || "")
			.replace(/<script\b[\s\S]*?<\/script>/g, "")
			.replace(/<style\b[\s\S]*?<\/style>/g, "");
		var root = { tag: "__root", attrs: {}, children: [] };
		var stack = [root];
		var re = /<\/?([A-Za-z][A-Za-z0-9_]*)\b([^>]*?)(\/?)>/g;
		var match;
		while ((match = re.exec(source)) !== null) {
			var full = match[0];
			var tag = match[1];
			var closing = full.indexOf("</") === 0;
			if (closing) {
				for (var i = stack.length - 1; i > 0; i--) {
					if (stack[i].tag === tag) {
						stack.length = i;
						break;
					}
				}
				continue;
			}
			var node = {
				tag: tag,
				attrs: flowSvelteLiteParseAttributes(match[2]),
				children: []
			};
			stack[stack.length - 1].children.push(node);
			if (full.charAt(full.length - 2) !== "/") {
				stack.push(node);
			}
		}
		return root.children;
	}

	function flowSvelteLiteBuildChildren(elements, arrayPath, sourcePath) {
		var out = [];
		(elements || []).forEach(function (element) {
			var node = flowSvelteLiteBuildNode(element, arrayPath + "[" + out.length + "]", sourcePath);
			if (node) {
				out.push(node);
			}
		});
		return out;
	}

	function flowSvelteLiteBuildNode(element, path, sourcePath) {
		var slotName = flowSvelteLiteSlotName(element.tag);
		if (slotName) {
			return flowSvelteLiteSlot(slotName, path, flowSvelteLiteBuildChildren(element.children, path + ".children", sourcePath), sourcePath);
		}
		var props = normalizeTree(element.attrs || {});
		var kind = flowSvelteLiteTagKind(element.tag, props);
		var propertyDefinitions = flowSvelteLitePropertyDefinitions(kind);
		flowSvelteLiteNormalizeAttributeModes(props, propertyDefinitions);
		var direct = [];
		var slots = {};
		(element.children || []).forEach(function (child) {
			var childSlot = flowSvelteLiteSlotName(child.tag);
			if (childSlot) {
				slots[childSlot] = flowSvelteLiteBuildChildren(child.children, path + ".slots." + childSlot + ".children", sourcePath);
			} else {
				direct.push(child);
			}
		});
		if (/^on[A-Z]/.test(kind) && direct.length && !slots.actions) {
			slots.actions = flowSvelteLiteBuildChildren(direct, path + ".slots.actions.children", sourcePath);
		}
		if (kind === "callSequence" && direct.length && !slots.variables) {
			slots.variables = flowSvelteLiteBuildChildren(direct, path + ".slots.variables.children", sourcePath);
		}
		if (kind === "table" && direct.length && !slots.columns) {
			slots.columns = flowSvelteLiteBuildChildren(direct, path + ".slots.columns.children", sourcePath);
		}
		flowSvelteLiteDefaultSlotNames(kind).forEach(function (name) {
			if (!slots[name]) {
				slots[name] = [];
			}
		});
		var slotChildren = [];
		var slotDefinitions = {};
		Object.keys(slots).forEach(function (name) {
			slotChildren.push(flowSvelteLiteSlot(name, path, slots[name], sourcePath));
			slotDefinitions[name] = flowSvelteLiteSlotDefinition(name, path + ".slots." + name + ".children");
		});
		var sourceExplicitId = props.id !== undefined && props.id !== null && String(props.id) !== "";
		var id = String(props.id || props.name || kind || "node");
		props.kind = kind;
		if (props.id === undefined && !(/^on[A-Z]/.test(kind) || kind === "variable" || kind === "column" || kind === "dataBinding")) {
			props.id = id;
		}
		return {
			id: id,
			kind: flowSvelteLiteTreeKind(kind),
			sourceExplicitId: sourceExplicitId,
			type: String(element.tag || kind),
			tag: String(element.tag || ""),
			label: flowSvelteLiteLabel(kind, element.tag, props),
			sourcePath: sourcePath,
			sourceMutationPath: path,
			sourceWritable: true,
			props: props,
			propertyDefinitions: propertyDefinitions,
			traits: flowSvelteLiteTraits(kind),
			slots: slotDefinitions,
			children: slotChildren
		};
	}

	function flowSvelteLiteComponentRoot(sourcePath, source) {
		if (String(source || "").indexOf("<FlowComponent") < 0) {
			return null;
		}
		var elements = flowSvelteLiteParseElements(source);
		var rootElement = null;
		(elements || []).forEach(function (element) {
			if (!rootElement && element.tag === "FlowComponent") {
				rootElement = element;
			}
		});
		if (!rootElement) {
			return null;
		}
		var props = normalizeTree(rootElement.attrs || {});
		var id = String(props.id || "component");
		var label = String(props.label || props.title || id);
		var rootPath = "frontAst";
		var structure = null;
		(rootElement.children || []).forEach(function (child) {
			if (!structure && flowSvelteLiteSlotName(child.tag) === "structure") {
				structure = flowSvelteLiteSlot("structure", rootPath,
					flowSvelteLiteBuildChildren(child.children, rootPath + ".slots.structure.children", sourcePath), sourcePath);
			}
		});
		if (!structure) {
			structure = flowSvelteLiteSlot("structure", rootPath, [], sourcePath);
		}
		props.id = id;
		props.label = label;
		return {
			id: id,
			kind: "frontendComponent",
			type: "component",
			tag: "FlowComponent",
			label: label,
			sourcePath: sourcePath,
			sourceMutationPath: rootPath,
			sourceWritable: true,
			props: props,
			traits: ["definition.uiBlock", "ui.container"],
			slots: {
				structure: flowSvelteLiteSlotDefinition("structure", rootPath + ".slots.structure.children")
			},
			children: [structure]
		};
	}

	function addFrontendFlowSvelteBlockTree(parent, block, path, settings, request) {
		if (!isFlowSvelteFrontendBlock(block)) {
			return false;
		}
		var sourcePath = String(block && (block.file || block.sourcePath) || "");
		if (!sourcePath) {
			return true;
		}
		var sourceFile = new File(sourcePath);
		if (!sourceFile.isFile()) {
			return true;
		}
		try {
			var sourceRequest = Object.assign({}, request || {}, {
				sourceTree: true,
				includeBindings: false
			});
			var document = frontendModelDocument(sourceRequest, sourceFile, settings);
			var roots = document && document.tree && document.tree.children || [];
			var frontAstRoot = roots.length ? roots[0] : null;
			if (!frontAstRoot) {
				return false;
			}
			addFrontendAuthoringNode(parent, frontAstRoot,
				path + ".nodes." + safeVirtualName("node", frontAstRoot.id || "component"), sourceFile);
		} catch (e) {
			var source = sourceDefinitionForFile(sourcePath, "flow-svelte");
			source.error = String(e && e.message || e);
			parent.children.push(virtualNode("implementationError", "error", "flow-svelte",
				path + ".implementationError", "Invalid flow.svelte",
				compact(source), compact(sourceObjectInfo(source, sourcePropertyDefinitions(),
					["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "error"])), "mdi:alert-outline"));
		}
		return true;
	}

	function addFrontendBlockImplementation(parent, block, path, settings) {
		var sourcePath = block.file || block.sourcePath || "";
		var source = sourceDefinitionForFile(sourcePath, block.runtime || "svelte");
		var implementation = normalizeTree(block.implementation || {});
		Object.keys(implementation).forEach(function (key) {
			if (source[key] === undefined) {
				source[key] = implementation[key];
			}
		});
		if (source.sourceWritable) {
			source.sourceMutationPath = source.sourceMutationPath || "widgets";
			source.frontendInsertSourcePath = source.sourcePath;
			source.frontendInsertMutationPath = "widgets";
		}
		var sourceInfo = sourceObjectInfo(source, sourcePropertyDefinitions(),
			["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly",
				"frontendInsertSourcePath", "frontendInsertMutationPath"]);
		var implementationNode = virtualNode("implementation", "frontendBlockImplementation", block.runtime || "svelte",
			path + ".implementation", "Implementation",
			compact(source), compact(sourceInfo), "mdi:file-code-outline");
		parent.children.push(implementationNode);
	}

	function frontendItemInfo(file, mutationPath, definitions, order) {
		var allDefinitions = frontendSourceTargetPropertyDefinitions(definitions);
		var info = sourceObjectInfo(frontendSourceInfo(file, "frontend-model", mutationPath), allDefinitions, order);
		info.frontendModelPath = mutationPath || "";
		return info;
	}

	function frontendContainerInfo(file, mutationPath, insertMutationPath, definitions, order) {
		var info = frontendItemInfo(file, mutationPath, definitions, order);
		if (file) {
			info.frontendInsertSourcePath = String(file.getAbsolutePath());
			info.frontendInsertMutationPath = insertMutationPath || mutationPath || "";
		}
		return info;
	}

	function frontendSourceTargetPropertyDefinitions(definitions) {
		var out = {};
		Object.keys(definitions || {}).forEach(function (key) {
			out[key] = definitions[key];
		});
		out.frontendInsertSourcePath = propertyDefinition("Insert source path", "Information",
			"Internal source file used when a child UI block is inserted from the palette.",
			{ readOnly: true, hidden: true });
		out.frontendInsertMutationPath = propertyDefinition("Insert mutation path", "Information",
			"Internal mutation path used when a child UI block is inserted from the palette.",
			{ readOnly: true, hidden: true });
		out.traits = propertyDefinition("Traits", "Authoring", "Low-code authoring traits exposed by this node.",
			{ readOnly: true, hidden: true });
		out.slots = propertyDefinition("Slots", "Authoring", "Low-code authoring child slots exposed by this node.",
			{ readOnly: true, hidden: true });
		return out;
	}

	function frontendArray(value) {
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.slice();
		}
		if (typeof value === "string" && value) {
			return [value];
		}
		return [];
	}

	function frontendSlot(label, accepts, mutationPath, writable) {
		var slot = {
			label: label,
			accepts: frontendArray(accepts),
			sourceMutationPath: String(mutationPath || "")
		};
		if (writable !== undefined && writable !== null) {
			slot.sourceWritable = writable !== false;
		}
		return slot;
	}

	function frontendActionParametersPath(node) {
		var path = String(node && node.sourceMutationPath || "");
		return path ? path + ".parameters" : "";
	}

	function frontendAuthoringTraits(node) {
		var traits = frontendArray(node && node.traits);
		if (traits.length) {
			return traits;
		}
		var kind = String(node && node.kind || "");
		var type = String(node && node.type || "");
		if (kind === "frontendDirectiveBlock" || type === "if" || type === "each" || type === "await") {
			return ["ui.directive", "ui.container"];
		}
		if (kind === "frontendDirectiveBranch" || type === "else" || type === "elseIf") {
			return ["ui.directive.branch", "ui.container"];
		}
		if (kind === "frontendEventBlock") {
			return ["ui.event", "ui.container"];
		}
		if (kind === "frontendEvents" || type === "events" || kind === "frontendDataBindings" || type === "data") {
			return ["ui.container"];
		}
		if (kind === "frontendActionBlock") {
			return ["ui.action"];
		}
		if (kind === "frontendActionVariables" || type === "variables" || kind === "frontendColumns" || type === "columns") {
			return ["ui.container"];
		}
		if (kind === "frontendActionVariable") {
			return ["ui.action.variable"];
		}
		if (kind === "frontendDataBlock") {
			return ["ui.data.binding", "ui.table.column"];
		}
		if (kind === "frontendRoutes" || kind === "frontendRouteRoot" || kind === "frontendRouteGroup"
			|| kind === "frontendRouteSegment" || kind === "frontendRouteChildren") {
			return ["route.container"];
		}
		if (kind === "frontendStructure" || kind === "frontendSlot" || kind === "frontendWidgetRoot") {
			return ["ui.container"];
		}
		if (kind === "frontendWidget" || node && node.sourceMutationPath) {
			return ["ui.block"];
		}
		return [];
	}

	function frontendAuthoringSlots(node) {
		var explicit = node && node.slots;
		if (explicit && typeof explicit === "object") {
			return normalizeTree(explicit);
		}
		var slots = {};
		var kind = String(node && node.kind || "");
		var type = String(node && node.type || "");
		var path = String(node && node.sourceMutationPath || "");
		var writable = node && node.sourceWritable;
		if (kind === "frontendRoutes" || kind === "frontendRouteRoot" || kind === "frontendRouteGroup"
			|| kind === "frontendRouteSegment" || kind === "frontendRouteChildren") {
			slots.routes = frontendSlot("Routes", ["definition.routePage", "definition.routeLayout", "definition.routeFolder"], "", writable);
		}
		if (kind === "frontendStructure" || kind === "frontendSlot" || kind === "frontendWidgetRoot"
			|| kind === "frontendPage" || kind === "frontendRouteLayout" || kind === "frontendComponent") {
			slots.structure = frontendSlot("Structure", ["ui.block", "ui.directive"], frontendNodeInsertMutationPath(node), writable);
		}
		if (String(type).toLowerCase() === "button" || String(kind).toLowerCase() === "button") {
			slots.events = frontendSlot("Events", ["ui.event"], path ? path + ".events" : "", writable);
		}
		if (kind === "frontendEvents") {
			slots.events = frontendSlot("Events", ["ui.event"], path, writable);
		}
		if (kind === "frontendEventBlock") {
			slots.actions = frontendSlot("Actions", ["ui.action"], path ? path + ".actions" : "", writable);
		}
		if (kind === "frontendDirectiveBranch" || type === "else" || type === "elseIf") {
			slots.structure = frontendSlot("Structure", ["ui.block", "ui.directive"], path ? path + ".children" : "", writable);
		}
		if (kind === "frontendActionBlock") {
			slots.variables = frontendSlot("Variables", ["ui.action.variable"], frontendActionParametersPath(node), writable);
		}
		if (kind === "frontendActionVariables") {
			slots.variables = frontendSlot("Variables", ["ui.action.variable"], path, writable);
		}
		if (kind === "frontendDataBindings") {
			slots.data = frontendSlot("Data", ["ui.data.binding"], path, writable);
		}
		if (kind === "frontendColumns") {
			slots.columns = frontendSlot("Columns", ["ui.table.column"], path, writable);
		}
		if (kind === "frontendDirectiveBlock" || type === "if" || type === "each" || type === "await") {
			if (type === "each") {
				slots.default = frontendSlot("Each", ["ui.block", "ui.directive"], path ? path + ".children" : "", writable);
			} else if (type === "await") {
				slots.pending = frontendSlot("Pending", ["ui.block", "ui.directive"], path ? path + ".pending" : "", writable);
				slots.then = frontendSlot("Then", ["ui.block", "ui.directive"], path ? path + ".then" : "", writable);
				slots.catch = frontendSlot("Catch", ["ui.block", "ui.directive"], path ? path + ".catch" : "", writable);
			} else {
				slots.then = frontendSlot("Then", ["ui.block", "ui.directive"], path ? path + ".then" : "", writable);
				slots.else = frontendSlot("Else", ["ui.block", "ui.directive"], path ? path + ".else" : "", writable);
				slots.branches = frontendSlot("Branches", ["ui.directive.branch"], path ? path + ".branches" : "", writable);
			}
		}
		return slots;
	}

	function addFrontendAuthoringTree(builder, tree, path, modelFile) {
		(tree.children || []).forEach(function (node, index) {
			addFrontendAuthoringNode(builder, node, path + "." + frontendAuthoringPathSegment(node, index), modelFile);
		});
	}

	function addFrontendAuthoringCatalogMirror(catalog, tree, path, modelFile) {
		var mirrored = 0;
		(tree.children || []).forEach(function (node, index) {
			if (String(node && node.kind || "") !== "frontendLibrary" && String(node && node.type || "") !== "library") {
				return;
			}
			addFrontendAuthoringNode(catalog, node, path + "." + frontendAuthoringPathSegment(node, index), modelFile);
			mirrored++;
		});
		if (mirrored) {
			var definition = {};
			try {
				definition = JSON.parse(String(catalog.definition || "{}"));
			} catch (e) {
				definition = {};
			}
			definition.authoringMirror = true;
			definition.authoringLibraryCount = mirrored;
			catalog.definition = compact(definition);
		}
	}

	function normalizeFrontendFlowSvelteRootNode(node, sourceFile) {
		if (!node || !sourceFile || !sourceFile.isFile() || String(node.kind || "") !== "frontendComponent") {
			return node;
		}
		var mutationPath = String(node.sourceMutationPath || "");
		var insertPath = String(node.frontendInsertMutationPath || "") || frontendSlotMutationPath(node, ["structure"]);
		if (mutationPath.indexOf("frontAst") === 0 || insertPath.indexOf("frontAst") === 0) {
			return node;
		}
		if (!String(sourceFile.getName()).endsWith(".flow.svelte")) {
			return node;
		}
		try {
			var root = flowSvelteLiteComponentRoot(String(sourceFile.getAbsolutePath()),
				String(FileUtils.readFileToString(sourceFile, "UTF-8")));
			if (!root) {
				return node;
			}
			node.label = root.label || node.label;
			node.sourceMutationPath = root.sourceMutationPath || "frontAst";
			node.frontendInsertSourcePath = String(sourceFile.getAbsolutePath());
			node.frontendInsertMutationPath = frontendSlotMutationPath(root, ["structure"]) || "frontAst.slots.structure.children";
			node.slots = Object.assign({}, node.slots || {}, root.slots || {});
			node.traits = node.traits || root.traits;
			node.props = Object.assign({}, node.props || {});
			if (root.props && root.props.label !== undefined && node.props.label === undefined) {
				node.props.label = root.props.label;
			}
		} catch (e) {
		}
		return node;
	}

	function normalizeFrontendComponentInstanceNode(node) {
		if (!node || !node.sourceMutationPath) {
			return node;
		}
		var tag = String(node.tag || node.type || "");
		var props = node.props || {};
		var traits = frontendArray(node.traits);
		if (traits.indexOf("ui.directive") === -1 && /^[A-Z]/.test(tag) &&
				props.id !== undefined && String(node.label || "") === tag) {
			node.label = String(props.id);
		}
		return node;
	}

	function normalizeFrontendRouteSourceNode(node, sourceFile) {
		if (!node || !sourceFile || !sourceFile.isFile() || !String(sourceFile.getName()).endsWith(".flow.svelte")) {
			return node;
		}
		var kind = String(node.kind || "");
		if ((kind === "frontendPage" || kind === "frontendRouteLayout") && !node.sourceMutationPath) {
			node.sourceMutationPath = "frontAst";
		}
		return node;
	}

	function frontendAuthoringPathSegment(node, index) {
		node = node || {};
		var stableId = node.props && node.props.id;
		if (node.sourceExplicitId === false) {
			stableId = null;
		} else if (stableId === undefined || stableId === null || String(stableId) === "") {
			stableId = node.id;
		}
		if (stableId !== undefined && stableId !== null && String(stableId) !== "") {
			return safeVirtualName("node", stableId);
		}
		return safeVirtualName("node", node.type || node.kind || "node") + "_" + index;
	}

	function frontendProjectedChildren(node, path) {
		var children = node && node.children || [];
		if (children.length !== 1) {
			return {
				children: children,
				path: path
			};
		}
		var slot = children[0] || {};
		var kind = String(slot.kind || "");
		if (kind !== "frontendSlot" && kind !== "frontendSnippetBlock") {
			return {
				children: children,
				path: path
			};
		}
		return {
			children: slot.children || [],
			path: path + "." + frontendAuthoringPathSegment(slot, 0)
		};
	}

	function addFrontendAuthoringNode(parent, node, path, modelFile) {
		node = node || {};
		var sourceFile = frontendNodeSourceFile(node, modelFile);
		normalizeFrontendFlowSvelteRootNode(node, sourceFile);
		normalizeFrontendComponentInstanceNode(node);
		normalizeFrontendRouteSourceNode(node, sourceFile);
		var mutationPath = String(node.sourceMutationPath || "");
		var insertMutationPath = frontendNodeInsertMutationPath(node);
		var definitions = frontendAuthoringPropertyDefinitions(node);
		var order = frontendAuthoringPropertyOrder(node);
		var info = insertMutationPath
			? frontendContainerInfo(sourceFile, mutationPath, insertMutationPath, definitions, order)
			: frontendItemInfo(sourceFile, mutationPath, definitions, order);
		applyFrontendAuthoringSourcePath(info, node);
		applyFrontendAuthoringInsertTarget(info, node);
		var definition = frontendAuthoringDefinition(node);
		var traits = frontendAuthoringTraits(node);
		var slots = frontendAuthoringSlots(node);
		if (traits.length) {
			info.traits = traits;
			definition.traits = traits;
		}
		if (Object.keys(slots).length) {
			info.slots = slots;
			definition.slots = slots;
		}
		var virtualKind = frontendAuthoringVirtualKind(node);
		var virtualType = String(node.type || node.kind || "frontendNode");
		var summary = String(node.label || node.name || node.id || virtualType || "Node");
		var pathName = String(path || "").split(".").pop();
		var virtual = virtualNode("authoring_" + safeVirtualName("node", pathName), virtualKind, virtualType,
			path, summary, compact(definition), compact(info), frontendAuthoringIcon(node));
		parent.children.push(virtual);
		var projected = frontendProjectedChildren(node, path);
		projected.children.forEach(function (child, index) {
			addFrontendAuthoringNode(virtual, child, projected.path + "." + frontendAuthoringPathSegment(child, index), sourceFile || modelFile);
		});
	}

	function applyFrontendAuthoringSourcePath(info, node) {
		if (!info || !node || !node.sourcePath) {
			return info;
		}
		info.sourcePath = String(node.sourcePath);
		if (node.sourceRelativePath) {
			info.sourceRelativePath = String(node.sourceRelativePath);
		}
		if (node.sourcePropertyMutationPaths && typeof node.sourcePropertyMutationPaths === "object") {
			info.sourcePropertyMutationPaths = normalizeTree(node.sourcePropertyMutationPaths);
		}
		return info;
	}

	function applyFrontendAuthoringInsertTarget(info, node) {
		if (!info || !node) {
			return info;
		}
		var sourcePath = String(node.frontendInsertSourcePath || "");
		var mutationPath = String(node.frontendInsertMutationPath || "");
		if (sourcePath) {
			info.frontendInsertSourcePath = sourcePath;
		}
		if (mutationPath) {
			info.frontendInsertMutationPath = mutationPath;
		}
		return info;
	}

	function frontendNodeSourceFile(node, fallback) {
		var sourcePath = String(node && node.sourcePath || "");
		if (!sourcePath) {
			return fallback || null;
		}
		var file = new File(sourcePath);
		return file.isFile() ? file : fallback || null;
	}

	function frontendNodeInsertMutationPath(node) {
		var kind = String(node && node.kind || "");
		var type = String(node && node.type || "");
		var explicitInsert = String(node && node.frontendInsertMutationPath || "");
		if (explicitInsert) {
			return explicitInsert;
		}
		var frontAstSlot = frontendFrontAstInsertMutationPath(node, kind, type);
		if (frontAstSlot) {
			return frontAstSlot;
		}
		if (kind === "frontendPage" || kind === "frontendRouteLayout" || kind === "frontendComponent") {
			return "widgets";
		}
		if (kind === "frontendStructure") {
			return String(node && node.sourceMutationPath || "widgets");
		}
		if (kind === "frontendEvents" || kind === "frontendDataBindings") {
			return String(node && node.sourceMutationPath || "");
		}
		if (kind === "frontendEventBlock") {
			var eventPath = String(node && node.sourceMutationPath || "");
			return eventPath ? eventPath + ".actions" : "";
		}
		if (kind === "frontendDirectiveBlock") {
			var directivePath = String(node && node.sourceMutationPath || "");
			return directivePath ? directivePath + ".then" : "";
		}
		if (kind === "frontendWidget") {
			var widgetPath = String(node && node.sourceMutationPath || "");
			return widgetPath ? widgetPath + ".events" : "";
		}
			if (kind === "frontendColumns" || kind === "frontendActionVariables") {
				return String(node && node.sourceMutationPath || "");
			}
			if (kind === "frontendActionBlock") {
				var actionPath = String(node && node.sourceMutationPath || "");
				return actionPath ? actionPath + ".parameters" : "";
			}
			if (kind === "frontendWidgetRoot") {
				return "widgets";
			}
		if (type === "page" || type === "layout" || type.indexOf("component") !== -1) {
			return "widgets";
		}
		return "";
	}

	function frontendFrontAstInsertMutationPath(node, kind, type) {
		var path = String(node && node.sourceMutationPath || "");
		if (path.indexOf("frontAst") !== 0) {
			return "";
		}
		if (kind === "frontendPage" || kind === "frontendRouteLayout" || kind === "frontendComponent") {
			return frontendSlotMutationPath(node, ["structure"]) || path;
		}
		if (kind === "frontendStructure" || kind === "frontendSlot") {
			return path;
		}
		if (String(type).toLowerCase() === "button" || String(kind).toLowerCase() === "button") {
			return frontendSlotMutationPath(node, ["events"]);
		}
		if (kind === "frontendEvents" || kind === "frontendDataBindings"
				|| kind === "frontendColumns" || kind === "frontendActionVariables") {
			return path;
		}
		if (kind === "frontendEventBlock") {
			return frontendSlotMutationPath(node, ["actions"]);
		}
		if (kind === "frontendActionBlock") {
			return frontendSlotMutationPath(node, ["variables"]);
		}
		if (kind === "frontendDirectiveBlock" || type === "if" || type === "each" || type === "await") {
			if (type === "each") {
				return frontendSlotMutationPath(node, ["default", "then", "structure"]);
			}
			if (type === "await") {
				return frontendSlotMutationPath(node, ["then", "pending", "catch", "structure"]);
			}
			return frontendSlotMutationPath(node, ["then", "structure"]);
		}
		return "";
	}

	function frontendSlotMutationPath(node, names) {
		var slots = node && node.slots;
		if (!slots || typeof slots !== "object") {
			return "";
		}
		for (var i = 0; i < names.length; i++) {
			var slot = slots[names[i]];
			var path = String(slot && slot.sourceMutationPath || "");
			if (path) {
				return path;
			}
		}
		return "";
	}

	function frontendAuthoringVirtualKind(node) {
		var kind = String(node && node.kind || "");
		if (kind === "frontendStructure") {
			return kind;
		}
		if (kind.indexOf("frontend") === 0) {
			return kind;
		}
		if (node && node.sourceMutationPath) {
			return "frontendWidget";
		}
		return "frontendWidget";
	}

	function frontendAuthoringDefinition(node) {
		var out = {};
		var internal = {
			category: true,
			descriptorId: true,
			icon: true,
			kind: true,
			label: true,
			sourceExplicitId: true,
			tag: true,
			type: true
		};
		Object.keys(node || {}).forEach(function (key) {
			if (key !== "children" && key !== "propertyDefinitions" && key !== "props" && key !== "traits" &&
					key !== "slots" && key !== "sourcePath" && key !== "sourceMutationPath" &&
					!internal[key] && key.indexOf("frontendInsert") !== 0 && key.indexOf("sourcePropertyMutation") !== 0) {
				out[key] = node[key];
			}
		});
		var props = node && node.props || {};
		Object.keys(props).forEach(function (key) {
			if (key !== "kind" && key !== "tag" && out[key] === undefined) {
				out[key] = props[key];
			}
		});
		return out;
	}

	function frontendAuthoringPropertyDefinitions(node) {
		var extra = node && node.propertyDefinitions || {};
		var visualNode = String(node && node.kind || "") === "frontendWidget";
		var definitions = {
			id: propertyDefinition("Id", "Information", "Generated low-code object id.", { readOnly: true, hidden: visualNode }),
			kind: propertyDefinition("Kind", "Information", "Low-code object kind.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative source path.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this source can be edited.", { readOnly: true }),
			traits: propertyDefinition("Traits", "Authoring", "Low-code authoring traits exposed by this node.", { readOnly: true, hidden: true }),
			slots: propertyDefinition("Slots", "Authoring", "Low-code authoring child slots exposed by this node.", { readOnly: true, hidden: true }),
			sourcePropertyMutationPaths: propertyDefinition("Property mutation paths", "Information", "Internal per-property source mutation paths.", { readOnly: true, hidden: true })
		};
		var known = {
			type: propertyDefinition("Type", "Information", "Source or AST node type.", { readOnly: true, hidden: true }),
			tag: propertyDefinition("Tag", "Information", "Svelte component or HTML tag.", { readOnly: true, hidden: true }),
			role: propertyDefinition("Role", "Routing", "Route file or library role.", { readOnly: true }),
			segment: propertyDefinition("Segment", "Routing", "SvelteKit route segment directory.", { readOnly: true }),
			pathless: propertyDefinition("Pathless", "Routing", "Whether this route segment contributes to the URL path.", { readOnly: true }),
			param: propertyDefinition("Parameter", "Routing", "SvelteKit parameter name.", { readOnly: true }),
			matcher: propertyDefinition("Matcher", "Routing", "SvelteKit parameter matcher.", { readOnly: true }),
			route: propertyDefinition("Route", "Routing", "Declared route path.", { kind: "text", type: "string" }),
			title: propertyDefinition("Title", "Base properties", "Visible title.", { kind: "text", type: "string" }),
			text: propertyDefinition("Text", "Base properties", "Text rendered by the component.", { kind: "text", type: "string" }),
			label: propertyDefinition("Label", "Base properties", "Visible label.", { kind: "text", type: "string" }),
			directive: propertyDefinition("Directive", "Logic", "Frontend directive kind.", { readOnly: true }),
			event: propertyDefinition("Event", "Event", "Frontend event name.", { readOnly: true }),
			clientAction: propertyDefinition("Client action", "Information", "Internal event action link.", { kind: "text", type: "string", readOnly: true, hidden: true }),
			backendCall: propertyDefinition("Backend call", "Information", "Internal backend call link.", { kind: "text", type: "string", readOnly: true, hidden: true }),
			requestable: propertyDefinition("Requestable", "Action", "Convertigo requestable called by this action.", { kind: "requestable", type: "requestable" }),
			parameters: propertyDefinition("Parameters", "Action", "Request parameters.", { kind: "literal", type: "object" }),
			name: propertyDefinition("Name", "Variable", "Variable name.", { kind: "text", type: "string", readOnly: true }),
			path: propertyDefinition("Path", "Data", "Data path.", { kind: "path", type: "string" }),
			source: propertyDefinition("Source", "Data", "Data source path.", { kind: "path", type: "string" }),
			value: propertyDefinition("Value", "Data", "Data value or binding path.", { kind: "path", type: "string" }),
			condition: propertyDefinition("Condition", "Logic", "Frontend condition expression.", { kind: "expression", type: "string" }),
			expression: propertyDefinition("Expression", "Logic", "Svelte expression.", { kind: "expression", type: "string" }),
			test: propertyDefinition("Test", "Logic", "Svelte condition expression.", { kind: "expression", type: "string" }),
			context: propertyDefinition("Context", "Logic", "Svelte each context.", { kind: "text", type: "string" }),
			index: propertyDefinition("Index", "Logic", "Svelte each index.", { kind: "text", type: "string" }),
			inferred: propertyDefinition("Inferred", "Information", "Whether this node is derived from another source object.", { kind: "boolean", type: "boolean", readOnly: true }),
			readOnly: propertyDefinition("Read only", "Information", "Whether this node is informative and cannot be edited directly.", { kind: "boolean", type: "boolean", readOnly: true })
		};
		Object.keys(extra || {}).forEach(function (key) {
			definitions[key] = frontendPropertyDefinition(key, extra[key]);
		});
		var props = node && node.props || {};
		Object.keys(props).forEach(function (key) {
			if (!frontendAuthoringPropertyVisible(node, key)) {
				return;
			}
			if (!definitions[key]) {
				definitions[key] = known[key] || frontendPropertyDefinition(key, { type: typeof props[key] === "boolean" ? "boolean" : "string" });
				if (!known[key]) {
					definitions[key].inferredFromSource = true;
				}
			}
		});
		return definitions;
	}

	function frontendAuthoringPropertyVisible(node, key) {
		key = String(key || "");
		if (key !== "requestable" && key !== "parameters") {
			return true;
		}
		var kind = String(node && node.kind || "");
		var type = String(node && node.type || "");
		var props = node && node.props || {};
		var semanticKind = String(props.kind || "");
		if (key === "requestable") {
			return kind === "frontendActionBlock" || type === "CallSequence" || semanticKind === "callSequence";
		}
		return kind === "frontendBackendCall" || type === "backendCall";
	}

	function frontendAuthoringPropertyOrder(node) {
		var preferred = ["id", "kind", "type", "tag", "title", "label", "text", "route", "segment", "param", "matcher",
			"directive", "event", "clientAction", "backendCall", "requestable", "parameters", "source", "value",
			"path", "name", "condition", "expression", "test", "context", "index",
			"inferred", "readOnly", "sourceRelativePath", "sourceWritable"];
		var order = [];
		var props = node && node.props || {};
		preferred.forEach(function (key) {
			if (!frontendAuthoringPropertyVisible(node, key)) {
				return;
			}
			if (key === "id" || key === "kind" || key === "sourceRelativePath" || key === "sourceWritable"
					|| props[key] !== undefined || node && node[key] !== undefined) {
				order.push(key);
			}
		});
		Object.keys(props).forEach(function (key) {
			if (!frontendAuthoringPropertyVisible(node, key)) {
				return;
			}
			if (order.indexOf(key) === -1) {
				order.push(key);
			}
		});
		return order;
	}

	function frontendAuthoringIcon(node) {
		var kind = String(node && node.kind || "");
		var type = String(node && node.type || "");
		if (node && node.icon) {
			return node.icon;
		}
		if (kind === "frontendRoutes") {
			return "mdi:routes";
		}
		if (kind === "frontendRouteGroup") {
			return "mdi:folder-pound-outline";
		}
		if (kind === "frontendRouteSegment") {
			return type === "param" || type === "optionalParam" || type === "restParam" ? "mdi:folder-key-outline" : "mdi:folder-outline";
		}
		if (kind === "frontendRouteLayout") {
			return "mdi:page-layout-header-footer";
		}
		if (kind === "frontendPage") {
			return "mdi:file-outline";
		}
		if (kind === "frontendStructure") {
			return "mdi:format-list-bulleted-square";
		}
		if (kind === "frontendSlot" || kind === "frontendSnippetBlock") {
			return "mdi:code-braces";
		}
		if (kind === "frontendEvents") {
			return "mdi:gesture-tap";
		}
		if (kind === "frontendEventBlock") {
			return "mdi:flash-outline";
		}
		if (kind === "frontendActionBlock") {
			return "mdi:play-box-outline";
		}
		if (kind === "frontendActionVariables") {
			return "mdi:variable-box";
		}
		if (kind === "frontendActionVariable") {
			return "mdi:variable";
		}
		if (kind === "frontendColumns") {
			return "mdi:table-column";
		}
		if (kind === "frontendDataBindings") {
			return "mdi:database-arrow-right-outline";
		}
		if (kind === "frontendDataBlock") {
			return "mdi:table-row";
		}
		if (kind === "frontendDirectiveBlock") {
			return type === "each" ? "mdi:repeat" : type === "await" ? "mdi:timer-sand" : "mdi:source-branch";
		}
		if (kind === "frontendDirectiveBlocks") {
			return "mdi:source-branch";
		}
		if (kind === "frontendLibrary") {
			return "mdi:library-outline";
		}
		if (kind === "frontendSharedComponents") {
			return "mdi:view-module-outline";
		}
		if (kind === "frontendSharedActions") {
			return "mdi:gesture-tap";
		}
		if (kind === "frontendComponent") {
			return "mdi:view-dashboard-outline";
		}
		if (kind === "frontendSharedAction") {
			return "mdi:language-javascript";
		}
		if (kind === "if") {
			return "mdi:source-branch";
		}
		if (kind === "each") {
			return "mdi:repeat";
		}
		if (kind === "await") {
			return "mdi:timer-sand";
		}
		if (kind === "element") {
			return "mdi:xml";
		}
		if (kind === "textNode") {
			return "mdi:text";
		}
		return widgetIcon(kind);
	}

	function addFrontendModelTree(builder, model, path, modelFile) {
		var app = model.app || {};
		var componentTargets = frontendComponentTargets(model.components || [], modelFile);
		var appNode = virtualNode("app", "frontendApp", app.id || "app", path + ".app",
			app.title || app.id || "App", compact(app),
			compact(frontendItemInfo(modelFile, "app", frontendAppPropertyDefinitions(),
				["id", "title", "defaultLayout", "sourceRelativePath", "sourceWritable"])), "mdi:application-outline");
		builder.children.push(appNode);
		addFrontendNavigation(appNode, app.navigation || [], path + ".app.navigation", modelFile);
		addFrontendPages(appNode, app.pages || [], path + ".app.pages", modelFile, componentTargets);
		addFrontendLayouts(builder, model.layouts || [], path + ".layouts", modelFile);
		addFrontendComponents(builder, model.components || [], path + ".components", modelFile);
		addFrontendClientActions(builder, model.clientActions || [], path + ".clientActions", modelFile);
		addFrontendBackendCalls(builder, model.backendCalls || [], path + ".backendCalls", modelFile);
		addFrontendStyling(builder, model.styling || {}, path + ".styling", modelFile);
	}

	function frontendAppPropertyDefinitions() {
		return {
			id: propertyDefinition("Id", "Base properties", "Application id.", { readOnly: true }),
			title: propertyDefinition("Title", "Base properties", "Visible application title.", { readOnly: true }),
			defaultLayout: propertyDefinition("Default layout", "Layout", "Default layout id.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative model source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this model can be edited.", { readOnly: true })
		};
	}

	function addFrontendNavigation(parent, navigation, path, modelFile) {
		navigation = navigation || [];
		var folder = virtualNode("navigation", "folder", "frontendNavigation", path,
			"Navigation", compact({ count: navigation.length }),
			compact(frontendContainerInfo(modelFile, "app.navigation", "app.navigation", null, null)), "mdi:menu");
		parent.children.push(folder);
		navigation.forEach(function (item, index) {
			var summary = String(item.label || item.route || "item");
			folder.children.push(virtualNode("nav_" + index, "frontendNavigationItem", "navigationItem",
				path + "[" + index + "]", summary, compact(item),
				compact(frontendItemInfo(modelFile, "app.navigation[" + index + "]", null, null)), "mdi:link-variant"));
		});
	}

	function addFrontendPages(parent, pages, path, modelFile, componentTargets) {
		pages = pages || [];
		var folder = virtualNode("pages", "folder", "frontendPages", path,
			"Pages", compact({ count: pages.length }),
			compact(frontendContainerInfo(modelFile, "app.pages", "app.pages", null, null)), "mdi:file-document-multiple-outline");
		parent.children.push(folder);
		pages.forEach(function (page, index) {
			var pagePath = path + "[" + index + "]";
			var pageInfo = frontendItemInfo(modelFile, "app.pages[" + index + "]", frontendPagePropertyDefinitions(),
				["id", "title", "route", "layout", "sourceRelativePath", "sourceWritable"]);
			applyFrontendInsertTarget(pageInfo, firstFrontendComponentTarget(page.components || [], componentTargets));
			var pageNode = virtualNode("page_" + (page.id || index), "frontendPage", page.id || "page",
				pagePath, page.title || page.id || "Page", compact(page),
				compact(pageInfo), "mdi:file-outline");
			folder.children.push(pageNode);
			addFrontendRegions(pageNode, page.regions || {}, pagePath + ".regions", modelFile, componentTargets);
			addFrontendComponentRefs(pageNode, page.components || [], pagePath + ".components", modelFile, componentTargets);
		});
	}

	function frontendPagePropertyDefinitions() {
		return {
			id: propertyDefinition("Id", "Base properties", "Page id.", { readOnly: true }),
			title: propertyDefinition("Title", "Base properties", "Page title.", { readOnly: true }),
			route: propertyDefinition("Route", "Routing", "Page route.", { readOnly: true }),
			layout: propertyDefinition("Layout", "Layout", "Layout id used by this page.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative model source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this model can be edited.", { readOnly: true })
		};
	}

	function addFrontendRegions(parent, regions, path, modelFile, componentTargets) {
		Object.keys(regions || {}).sort().forEach(function (name) {
			var refs = regions[name] || [];
			var regionInfo = frontendItemInfo(modelFile, "regions." + name, null, null);
			applyFrontendInsertTarget(regionInfo, firstFrontendComponentTarget(refs, componentTargets));
			var regionNode = virtualNode("region_" + name, "frontendRegion", name, path + "." + name,
				name, compact({ id: name, components: refs }),
				compact(regionInfo), "mdi:page-layout-body");
			parent.children.push(regionNode);
			addFrontendComponentRefs(regionNode, refs, path + "." + name, modelFile, componentTargets);
		});
	}

	function addFrontendComponentRefs(parent, refs, path, modelFile, componentTargets) {
		(refs || []).forEach(function (ref, index) {
			var target = frontendComponentTarget(ref, componentTargets);
			var componentInfo = target
				? frontendItemInfo(target.file, target.mutationPath, null, null)
				: frontendItemInfo(modelFile, "", null, null);
			applyFrontendInsertTarget(componentInfo, target);
			var componentNode = virtualNode("componentRef_" + ref, "frontendComponentRef", ref,
				path + "[" + index + "]", String(ref), compact({ component: ref }),
				compact(componentInfo), "mdi:link-variant");
			parent.children.push(componentNode);
		});
	}

	function addFrontendLayouts(parent, layouts, path, modelFile) {
		layouts = layouts || [];
		var folder = virtualNode("layouts", "folder", "frontendLayouts", path,
			"Layouts", compact({ count: layouts.length }),
			compact(frontendContainerInfo(modelFile, "layouts", "layouts", null, null)), "mdi:page-layout-header-footer");
		parent.children.push(folder);
		layouts.forEach(function (layout, index) {
			var layoutInfo = frontendContainerInfo(modelFile, "layouts[" + index + "]", "layouts[" + index + "].regions", null, null);
			var layoutNode = virtualNode("layout_" + (layout.id || index), "frontendLayout", layout.id || "layout",
				path + "[" + index + "]", layout.title || layout.id || "Layout", compact(layout),
				compact(layoutInfo), "mdi:page-layout-outline");
			folder.children.push(layoutNode);
			(layout.regions || []).forEach(function (region, regionIndex) {
				layoutNode.children.push(virtualNode("region_" + (region.id || regionIndex), "frontendLayoutRegion", region.id || "region",
					path + "[" + index + "].regions[" + regionIndex + "]", region.id || "region", compact(region),
					compact(frontendItemInfo(modelFile, "layouts[" + index + "].regions[" + regionIndex + "]", null, null)), "mdi:page-layout-body"));
			});
		});
	}

	function addFrontendComponents(parent, components, path, modelFile) {
		components = components || [];
		var folder = virtualNode("components", "folder", "frontendComponents", path,
			"UI block sources", compact({ count: components.length }),
			compact(frontendContainerInfo(modelFile, "components", "components", null, null)), "mdi:view-module-outline");
		parent.children.push(folder);
		components.forEach(function (component, index) {
			var componentFile = component.__sourceFile ? new File(String(component.__sourceFile)) : modelFile;
			var componentDefinition = compact(component);
			delete componentDefinition.__sourceFile;
			var componentNode = virtualNode("component_" + (component.id || index), "frontendComponent", component.id || "component",
				path + "[" + index + "]", component.id || "Component", componentDefinition,
				compact(frontendItemInfo(componentFile, "components[" + index + "]", frontendComponentPropertyDefinitions(),
					["id", "sourceRelativePath", "sourceWritable"])), "mdi:view-dashboard-outline");
			folder.children.push(componentNode);
			addFrontendComponentChildren(componentNode, component, path + "[" + index + "]",
				"components[" + index + "].widgets", componentFile);
		});
	}

	function addFrontendComponentChildren(parent, component, path, mutationPath, componentFile) {
		var nodes = component && component.nodes || [];
		if (nodes.length) {
			nodes.forEach(function (node, index) {
				addFrontendAuthoringNode(parent, node, path + ".nodes." + safeVirtualName("node", node.id || index), componentFile);
			});
			return;
		}
		addFrontendWidgets(parent, component && component.widgets || [], path + ".widgets", mutationPath, componentFile);
	}

	function frontendComponentTargets(components, modelFile) {
		var targets = {};
		(components || []).forEach(function (component, index) {
			var id = String(component.id || lowerFirst(component.name || "") || index);
			targets[id] = {
				file: component.__sourceFile ? new File(String(component.__sourceFile)) : modelFile,
				mutationPath: "components[" + index + "].widgets",
				component: component
			};
		});
		return targets;
	}

	function frontendComponentTarget(ref, targets) {
		return targets && targets[String(ref || "")] || null;
	}

	function firstFrontendComponentTarget(refs, targets) {
		for (var i = 0; i < (refs || []).length; i++) {
			var target = frontendComponentTarget(refs[i], targets);
			if (target) {
				return target;
			}
		}
		return null;
	}

	function applyFrontendInsertTarget(info, target) {
		if (!info || !target) {
			return info;
		}
		info.frontendInsertSourcePath = String(target.file.getAbsolutePath());
		info.frontendInsertMutationPath = target.mutationPath;
		return info;
	}

	function frontendComponentPropertyDefinitions() {
		return {
			id: propertyDefinition("Id", "Base properties", "Reusable UI block id.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative model source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this model can be edited.", { readOnly: true })
		};
	}

	function addFrontendWidgets(parent, widgets, path, mutationPath, modelFile) {
		(widgets || []).forEach(function (widget, index) {
			var props = widget.props || {};
			var label = widget.label || widget.text || props.label || props.text || widget.kind || widget.id || "Widget";
			var itemFile = widget.sourcePath ? new File(String(widget.sourcePath)) : modelFile;
			var itemMutationPath = widget.sourceMutationPath || (mutationPath ? mutationPath + "[" + index + "]" : "");
			parent.children.push(virtualNode("widget_" + (widget.id || index), "frontendWidget", widget.kind || "widget",
				path + "[" + index + "]", String(label), compact(widget),
				compact(frontendItemInfo(itemFile, itemMutationPath, frontendWidgetPropertyDefinitions(widget.propertyDefinitions),
					["id", "kind", "text", "label", "clientAction", "source", "columns", "sourceRelativePath", "sourceWritable"])), widget.icon || widgetIcon(widget.kind)));
		});
	}

	function frontendWidgetPropertyDefinitions(extra) {
		var definitions = {
			id: propertyDefinition("Id", "Base properties", "Widget id.", { readOnly: true }),
			kind: propertyDefinition("Kind", "Base properties", "Widget kind.", { readOnly: true }),
			text: propertyDefinition("Text", "Base properties", "Text rendered by the widget.", { kind: "text", type: "string" }),
			label: propertyDefinition("Label", "Base properties", "Visible label.", { kind: "text", type: "string" }),
			clientAction: propertyDefinition("Client action", "Information", "Internal event action link.", { kind: "text", type: "string", readOnly: true, hidden: true }),
			source: propertyDefinition("Source", "Data", "Backend result source path.", { kind: "path", type: "string" }),
			columns: propertyDefinition("Columns", "Data", "Table column descriptors.", {
				kind: "array",
				type: "array",
				items: {
					kind: "literal",
					type: "object"
				}
			}),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project-relative model source.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this model can be edited.", { readOnly: true })
		};
		Object.keys(extra || {}).forEach(function (key) {
			definitions[key] = frontendPropertyDefinition(key, extra[key]);
		});
		return definitions;
	}

	function frontendPropertyDefinition(key, value) {
		value = value && typeof value === "object" ? value : {};
		var internalActionLink = key === "clientAction" || key === "backendCall";
		var definition = propertyDefinition(
			value.label || key,
			internalActionLink ? "Information" : value.category || "Base properties",
			value.description || "",
			{
				kind: value.kind || value.editor || value.type || "text",
				type: value.type || "string",
				items: value.items,
				bindingSources: value.bindingSources,
				defaultValue: value["default"],
				readOnly: internalActionLink || value.readOnly === true,
				hidden: internalActionLink || value.hidden === true
			}
		);
		if (value.inferredFromSource === true) {
			definition.inferredFromSource = true;
		}
		if (value.catalogProperty === true) {
			definition.catalogProperty = true;
		}
		return resolvedPropertyDefinition(definition);
	}

	function widgetIcon(kind) {
		kind = String(kind || "");
		if (kind === "button") {
			return "mdi:gesture-tap-button";
		}
		if (kind === "table") {
			return "mdi:table";
		}
		if (kind === "json") {
			return "mdi:code-json";
		}
		if (kind === "status") {
			return "mdi:information-outline";
		}
		return "mdi:text-box-outline";
	}

	function addFrontendClientActions(parent, actions, path, modelFile) {
		actions = actions || [];
		var folder = virtualNode("clientActions", "folder", "frontendClientActions", path,
			"Client actions", compact({ count: actions.length }),
			compact(frontendContainerInfo(modelFile, "clientActions", "clientActions", null, null)), "mdi:gesture-tap");
		parent.children.push(folder);
		(actions || []).forEach(function (action, index) {
			folder.children.push(virtualNode("clientAction_" + (action.id || index), "frontendClientAction", action.kind || "clientAction",
				path + "[" + index + "]", action.id || "Client action", compact(action),
				compact(frontendItemInfo(modelFile, "clientActions[" + index + "]", null, null)), "mdi:gesture-tap"));
		});
	}

	function addFrontendBackendCalls(parent, calls, path, modelFile) {
		calls = calls || [];
		var folder = virtualNode("backendCalls", "folder", "frontendBackendCalls", path,
			"Backend calls", compact({ count: calls.length }),
			compact(frontendContainerInfo(modelFile, "backendCalls", "backendCalls", null, null)), "mdi:server-network");
		parent.children.push(folder);
		(calls || []).forEach(function (call, index) {
			folder.children.push(virtualNode("backendCall_" + (call.id || index), "frontendBackendCall", call.requestable || "requestable",
				path + "[" + index + "]", call.id || call.requestable || "Backend call", compact(call),
				compact(frontendItemInfo(modelFile, "backendCalls[" + index + "]", null, null)), "mdi:server-network"));
		});
	}

	function addFrontendStyling(parent, styling, path, modelFile) {
		var folder = virtualNode("styling", "frontendStyling", styling.engine || "styling", path,
			"Styling", compact(styling), compact(frontendItemInfo(modelFile, "styling", null, null)), "mdi:palette-outline");
		parent.children.push(folder);
		addObjectFields(folder, styling.tokens || {}, path + ".tokens");
	}

	function normalizeSlotDefinition(slot) {
		if (typeof slot === "string") {
			return { name: slot, label: slot, aliases: [], inline: false };
		}
		slot = slot || {};
		var out = {
			name: String(slot.name || "nodes"),
			label: String(slot.label || slot.name || "nodes"),
			aliases: slot.aliases || [],
			inline: slot.inline === true
		};
		["scope", "input", "local", "current", "error", "description"].forEach(function (key) {
			if (slot[key] !== undefined && slot[key] !== null && String(slot[key]) !== "") {
				out[key] = slot[key];
			}
		});
		return out;
	}

	function slotDefinitions(catalog) {
		var slots = catalog && catalog.slots;
		if (slots && Object.prototype.toString.call(slots) === "[object Array]") {
			return slots.map(normalizeSlotDefinition);
		}
		var children = catalog && catalog.children;
		if (children && Object.prototype.toString.call(children) === "[object Array]") {
			return children.map(normalizeSlotDefinition);
		}
		return ["nodes", "do", "then", "else", "catch", "finally"].map(normalizeSlotDefinition);
	}

	function activeSlots(node, catalog) {
		var active = [];
		slotDefinitions(catalog).forEach(function (definition) {
			var names = [definition.name].concat(definition.aliases || []);
			for (var i = 0; i < names.length; i++) {
				var name = String(names[i]);
				var nodes = node && node[name];
				if (nodes && Object.prototype.toString.call(nodes) === "[object Array]" && nodes.length > 0) {
					active.push({
						name: name,
						label: definition.label,
						inline: definition.inline,
						scope: definition.scope || "",
						input: definition.input || "",
						local: definition.local || "",
						current: definition.current || "",
						error: definition.error || "",
						nodes: nodes
					});
					break;
				}
			}
		});
		return active;
	}

	function nodeSummary(block, catalog, node, id, blockName) {
		var label = id;
		try {
			if (block && typeof block.displayName === "function") {
				label = block.displayName(node) || id;
			} else if (catalog && typeof catalog.displayName === "function") {
				label = catalog.displayName(node) || id;
			}
		} catch (e) {
			label = id;
		}
		return "[" + blockName + "] " + summaryText(
			label && typeof label === "object" ? JSON.stringify(normalizeTree(label)) : label);
	}

	function addNodeSlots(parent, node, nodePath, catalog, blocks, analysisById, sourceInfo, sourceNodePath) {
		activeSlots(node, catalog).forEach(function (slot) {
			var path = nodePath + "." + slot.name;
			var slotSourcePath = sourceNodePath ? sourceNodePath + "." + slot.name : "";
			if (slot.inline) {
				addNodeList(parent, slot.nodes, path, blocks, analysisById, sourceInfo, slotSourcePath);
			} else {
				var slotMeta = normalizeTree(slot);
				delete slotMeta.nodes;
				var slotInfo = sourceInfo ? sourceInfoForPath(sourceInfo, slotSourcePath) : {};
				Object.keys(slotMeta).forEach(function (key) {
					slotInfo[key] = slotMeta[key];
				});
				var folder = virtualNode(slot.name, "slot", slot.name, path, slot.label, compact(slot.nodes), compact(slotInfo), "mdi:call-split");
				parent.children.push(folder);
				addNodeList(folder, slot.nodes, path, blocks, analysisById, sourceInfo, slotSourcePath);
			}
		});
	}

	function sourceInfoForPath(sourceInfo, mutationPath) {
		if (!sourceInfo) {
			return null;
		}
		var info = normalizeTree(sourceInfo);
		if (mutationPath !== undefined && mutationPath !== null && String(mutationPath) !== "") {
			info.sourceMutationPath = String(mutationPath);
		}
		return info;
	}

	function mergeSourceInfo(info, sourceInfo, mutationPath) {
		info = info || {};
		var source = sourceInfoForPath(sourceInfo, mutationPath);
		if (source) {
			Object.keys(source).forEach(function (key) {
				info[key] = source[key];
			});
		}
		return info;
	}

	function addNodeList(parent, nodes, path, blocks, analysisById, sourceInfo, sourceBasePath) {
		(nodes || []).forEach(function (node, index) {
			var id = String(node && (node.id || node.uid || node.name) || "node" + index);
			var blockType = String(blockName(node) || "unknown");
			var block = blocks && blocks[blockType];
			var catalog = blockDescriptor(block);
			resolveBlockIcon(block, catalog);
			var nodeAnalysis = analysisById && analysisById[id];
			var nodePath = path + "[" + index + "]";
			var sourceNodePath = sourceBasePath ? sourceBasePath + "[" + index + "]" : "";
			var shallow = {};
			Object.keys(node || {}).forEach(function (key) {
				if (key.indexOf("__") !== 0 && ["nodes", "do", "then", "else", "catch", "finally"].indexOf(key) === -1) {
					shallow[key] = node[key];
				}
				});
				var nodeInformation = mergeSourceInfo(nodeInfo(nodeAnalysis, catalog), sourceInfo, sourceNodePath);
				var nodeObject = virtualNode("node_" + id + "_" + index, "node", blockType, nodePath,
					nodeSummary(block, catalog, node, id, blockType), compact(shallow), compact(nodeInformation));
				parent.children.push(nodeObject);
				if (node.__graphBlock && node.nodes) {
					var graphSource = sourceDefinitionForFile(node.__graphBlock.file, "flow");
					graphSource.sourceWritable = false;
					graphSource.writable = false;
					graphSource.readOnly = true;
					graphSource.readOnlyReference = true;
					var implementationNode = virtualNode("implementation", "blockImplementation", "flow",
						nodePath + ".implementation", "Implementation",
						compact(graphSource), compact(sourceObjectInfo(graphSource, sourcePropertyDefinitions(),
							["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"])), "mdi:source-branch");
					nodeObject.children.push(implementationNode);
					addNodeList(implementationNode, node.nodes, nodePath + ".implementation.nodes", blocks, analysisById, graphSource, "nodes");
				}
				var slotNode = node;
				if (node.__graphBlock && node.nodes) {
					slotNode = normalizeTree(node);
					delete slotNode.nodes;
				}
				addNodeSlots(nodeObject, slotNode, nodePath, catalog, blocks, analysisById, sourceInfo, sourceNodePath);
			});
	}

	function addNodes(out, nodes, path, blocks, analysisById) {
		if (!nodes || Object.prototype.toString.call(nodes) !== "[object Array]") {
			return;
		}
		var folder = virtualNode("flow", "folder", "flow", path, "Flow", compact(nodes), null, "mdi:sitemap-outline");
		out.push(folder);
		addNodeList(folder, nodes, path, blocks, analysisById);
	}

	function addHelpers(out, helpers, path, blocks, analysisById, sourcePath) {
		if (!helpers || Object.prototype.toString.call(helpers) !== "[object Array]" || helpers.length === 0) {
			return;
		}
		var folder = virtualNode("helpers", "folder", "helpers", path, "Helpers",
			compact({ count: helpers.length }), null, "mdi:function-variant");
		out.push(folder);
		helpers.forEach(function (helper, index) {
			helper = normalizeTree(helper || {});
			var helperPath = path + "[" + index + "]";
			var params = helper.params || Object.keys(helper.props || {});
			var helperInfo = sourceObjectInfo(helper, helperPropertyDefinitions(), ["name", "params"]);
			var helperNode = virtualNode("helper_" + helper.name, "helper", helper.name, helperPath,
				helper.name + "(" + params.join(", ") + ")", compact({
					name: helper.name,
					params: params,
					props: helper.props || {}
				}), compact(helperInfo), "mdi:function-variant");
			folder.children.push(helperNode);
			var implementationSource = {
				implementation: "flow-helper",
				implementationKind: "flow-helper",
				sourcePath: String(sourcePath || ""),
				sourceMutationPath: helperPath + ".nodes",
				sourceWritable: true,
				writable: true,
				readOnly: false,
				flowImplementation: true
			};
			var implementationNode = virtualNode("implementation", "blockImplementation", "flow",
				helperPath + ".implementation", "Implementation",
				compact(implementationSource), compact(sourceObjectInfo(implementationSource, sourcePropertyDefinitions(),
					["implementationKind", "sourcePath", "sourceMutationPath", "sourceWritable"])), "mdi:source-branch");
			helperNode.children.push(implementationNode);
			addNodeList(implementationNode, helper.nodes || [], helperPath + ".nodes", blocks, analysisById,
				implementationSource, helperPath + ".nodes");
		});
	}

	function sourceDefinitionForFile(file, implementation) {
		var text = String(file || "");
		var definition = {
			implementation: implementation,
			implementationKind: implementation,
			file: text,
			sourcePath: text,
			sourceOrigin: "",
			sourceRelativePath: "",
			sourceWritable: false,
			writable: false,
			readOnly: true
		};
		if (text) {
			var sourceFile = new File(text);
			var projectRelative = projectDir() ? resourceRelativePath(projectDir(), sourceFile) : "";
			var engineRelative = resourceRelativePath(new File(engineDir(), "../.."), sourceFile);
			if (projectRelative) {
				definition.path = projectRelative;
				definition.origin = "project";
				definition.sourceOrigin = "project";
				definition.sourceRelativePath = projectRelative;
				definition.sourceWritable = true;
				definition.writable = true;
				definition.readOnly = false;
			} else if (engineRelative) {
				definition.path = engineRelative;
				definition.origin = "engine";
				definition.sourceOrigin = "engine";
				definition.sourceRelativePath = engineRelative;
			}
		}
		return definition;
	}

	function propertyDefinition(label, category, description, options) {
		options = options || {};
		var definition = {
			label: label,
			category: category || "Base properties",
			description: description || "",
			readOnly: options.readOnly === true
		};
		if (options.kind) {
			definition.kind = options.kind;
		}
		if (options.type) {
			definition.type = options.type;
		}
		if (options.items !== undefined) {
			definition.items = options.items;
		}
		if (options.bindingSources !== undefined) {
			definition.bindingSources = normalizeTree(options.bindingSources);
		}
		if (options.defaultValue !== undefined) {
			definition.default = options.defaultValue;
		}
		if (options.hidden === true) {
			definition.hidden = true;
		}
		if (options.expert === true) {
			definition.expert = true;
		}
		if (options.editorClass) {
			definition.editorClass = String(options.editorClass);
		}
		if (options.editorResource) {
			definition.editorResource = String(options.editorResource);
		}
		return definition;
	}

	function sourceObjectInfo(sourceInfo, propertyDefinitions, propertyOrder) {
		var info = normalizeTree(sourceInfo || {});
		if (propertyDefinitions) {
			info.propertyDefinitions = propertyDefinitions;
		}
		if (propertyOrder) {
			info.propertyOrder = propertyOrder;
		}
		return info;
	}

	function sourcePropertyDefinitions() {
		return {
			implementation: propertyDefinition("Implementation", "Information", "Internal implementation kind.", { readOnly: true, hidden: true }),
			file: propertyDefinition("File", "Information", "Internal source file.", { readOnly: true, hidden: true }),
			path: propertyDefinition("Path", "Information", "Internal relative source path.", { readOnly: true, hidden: true }),
			origin: propertyDefinition("Origin", "Information", "Internal source origin.", { readOnly: true, hidden: true }),
			writable: propertyDefinition("Writable", "Information", "Internal writable flag.", { readOnly: true, hidden: true }),
			sourcePath: propertyDefinition("Source path", "Information", "Internal absolute source path.", { readOnly: true, hidden: true }),
			sourceMutationPath: propertyDefinition("Mutation path", "Information", "Internal mutation path.", { readOnly: true, hidden: true }),
			sourceBlockName: propertyDefinition("Block", "Information", "Internal source block name.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project or engine relative source path.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Origin", "Information", "Source origin: project, core engine or library.", { readOnly: true }),
			implementationKind: propertyDefinition("Implementation", "Information", "Implementation source kind.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this source can be edited from the current project.", { readOnly: true }),
			flowImplementation: propertyDefinition("Flow implementation", "Information", "Whether this source is a Flow implementation.", { readOnly: true, hidden: true }),
			readOnlyReference: propertyDefinition("Read-only reference", "Information", "Whether this source is shown as a read-only reference.", { readOnly: true, hidden: true }),
			readOnly: propertyDefinition("Read only", "Information", "Whether this virtual object is read-only.", { readOnly: true })
		};
	}

	function helperPropertyDefinitions() {
		return {
			name: propertyDefinition("Name", "Base properties", "Private helper function name.", { kind: "text", type: "string" }),
			params: propertyDefinition("Parameters", "Base properties", "Helper parameter names as a JSON array.", { kind: "literal", type: "array" }),
			props: propertyDefinition("Properties", "Information", "Generated helper property contract.", { readOnly: true }),
			__flowScriptLine: propertyDefinition("Line", "Information", "Original FlowScript line.", { readOnly: true, hidden: true })
		};
	}

	function catalogGroupPropertyDefinitions() {
		return {
			provider: propertyDefinition("Provider", "Information", "Project or library providing the catalog entries.", { readOnly: true }),
			origin: propertyDefinition("Origin", "Information", "Catalog origin.", { readOnly: true }),
			count: propertyDefinition("Count", "Information", "Number of blocks in this group.", { readOnly: true })
		};
	}

	function libraryPropertyDefinitions() {
		return {
			name: propertyDefinition("Name", "Information", "Library name used by ctx.lib(name).", { readOnly: true }),
			provider: propertyDefinition("Provider", "Information", "Project providing this library.", { readOnly: true }),
			origin: propertyDefinition("Origin", "Information", "Library origin.", { readOnly: true }),
			description: propertyDefinition("Description", "Information", "Library documentation.", { readOnly: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project or engine relative source path.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Source origin", "Information", "Source origin: project or core engine.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this library can be edited from the current project.", { readOnly: true })
		};
	}

	function blockPropertyDefinitions() {
		return {
			version: propertyDefinition("Version", "Information", "Descriptor version.", { readOnly: true, hidden: true }),
			blockId: propertyDefinition("Block id", "Information", "Full runtime block id computed from provider namespace and block name.", { readOnly: true }),
			name: propertyDefinition("Name", "Information", "Local block name computed from the descriptor file name.", { readOnly: true }),
			localName: propertyDefinition("Local name", "Information", "Local block name computed from the descriptor file name.", { readOnly: true, hidden: true }),
			namespace: propertyDefinition("Namespace", "Information", "Namespace computed from the descriptor path.", { readOnly: true }),
			provider: propertyDefinition("Provider", "Information", "Project providing this block.", { readOnly: true }),
			file: propertyDefinition("File", "Information", "Internal descriptor file.", { readOnly: true, hidden: true }),
			origin: propertyDefinition("Origin", "Information", "Catalog origin.", { readOnly: true, hidden: true }),
			__flowFile: propertyDefinition("Source file", "Information", "Internal descriptor file.", { readOnly: true, hidden: true }),
			__flowOrigin: propertyDefinition("Source origin", "Information", "Internal source origin.", { readOnly: true, hidden: true }),
			implementationFile: propertyDefinition("Implementation file", "Information", "Internal implementation file.", { readOnly: true, hidden: true }),
			runtime: propertyDefinition("Runtime", "Information", "Internal runtime kind.", { readOnly: true, hidden: true }),
			iconify: propertyDefinition("Iconify", "Information", "Resolved Iconify id.", { readOnly: true, hidden: true }),
			iconUrl: propertyDefinition("Icon URL", "Information", "Resolved remote icon URL.", { readOnly: true, hidden: true }),
			iconSvg: propertyDefinition("Icon SVG", "Information", "Resolved SVG icon file.", { readOnly: true, hidden: true }),
			iconFile: propertyDefinition("Icon file", "Information", "Resolved icon file.", { readOnly: true, hidden: true }),
			iconFile16: propertyDefinition("Icon 16", "Information", "Resolved 16x16 icon file.", { readOnly: true, hidden: true }),
			iconFile32: propertyDefinition("Icon 32", "Information", "Resolved 32x32 icon file.", { readOnly: true, hidden: true }),
			implementation: propertyDefinition("Implementation", "Information", "Runtime and source file. Edit the Implementation child instead.", { readOnly: true }),
			hooks: propertyDefinition("Hooks", "Information", "Dynamic display/analyze source. Edit the Hooks child instead.", { readOnly: true }),
			description: propertyDefinition("Description", "Base properties", "Short block description.", { kind: "text", type: "string" }),
			longDescription: propertyDefinition("Long description", "Base properties", "Detailed block documentation.", { kind: "markdown", type: "string" }),
			icon: propertyDefinition("Icon", "Base properties", "Icon id, relative icon file, or URL.", { kind: "icon", type: "string" }),
			uses: propertyDefinition("Libraries", "Base properties", "JavaScript libraries explicitly used by this block implementation.", { kind: "array", type: "array", items: { kind: "text", type: "string", trim: true, unique: true }, defaultValue: [] }),
			display: propertyDefinition("Display template", "Information", "Legacy static display fallback. Prefer the Hooks displayName function.", { readOnly: true, hidden: true }),
			visibility: propertyDefinition("Visibility", "Base properties", "Palette visibility: public, internal or private.", { kind: "text", type: "string", defaultValue: "public" }),
			private: propertyDefinition("Private", "Expert", "Hide this block from projects referencing this library.", { kind: "boolean", type: "boolean", defaultValue: false }),
			tags: propertyDefinition("Tags", "Base properties", "Searchable labels used for filtering and documentation.", { kind: "array", type: "array", items: { kind: "text", type: "string", trim: true, unique: true }, defaultValue: [] }),
			kind: propertyDefinition("Kind", "Information", "Legacy field migrated to tags.", { readOnly: true, hidden: true }),
			package: propertyDefinition("Package", "Information", "Legacy field replaced by provider.", { readOnly: true, hidden: true }),
			props: propertyDefinition("Properties", "Information", "Block property contract. Edit the Properties child instead.", { readOnly: true, hidden: true }),
			slots: propertyDefinition("Slots", "Properties", "Child node slots accepted by this block.", { kind: "literal", type: "array" }),
			defaults: propertyDefinition("Defaults", "Properties", "Default node values applied when the block is dropped from the palette.", { kind: "literal", type: "object" })
		};
	}

	function blockPropertiesFolderDefinitions() {
		return {
			count: propertyDefinition("Count", "Information", "Number of properties declared by this block.", { readOnly: true })
		};
	}

	function blockPropertyDefinitionDefinitions() {
		return {
			name: propertyDefinition("Name", "Information", "Property name computed from the descriptor key.", { readOnly: true }),
			label: propertyDefinition("Label", "Base properties", "Human-readable property label.", { kind: "text", type: "string" }),
			kind: propertyDefinition("Kind", "Base properties", "Flow property editor kind.", { kind: "text", type: "string" }),
			type: propertyDefinition("Value type", "Base properties", "JSON value type handled by this property.", { kind: "text", type: "string" }),
			mode: propertyDefinition("Mode", "Base properties", "Property usage mode such as read or write.", { kind: "text", type: "string" }),
			description: propertyDefinition("Description", "Base properties", "Property documentation.", { kind: "markdown", type: "string" }),
			default: propertyDefinition("Default", "Base properties", "Default property value.", { kind: "literal" }),
			items: propertyDefinition("Items", "Expert", "Array item descriptor.", { kind: "literal", type: "object" }),
			component: propertyDefinition("Component", "Expert", "Optional custom editor component.", { kind: "text", type: "string" })
		};
	}

	function typePropertyDefinitions() {
		return {
			version: propertyDefinition("Version", "Information", "Descriptor version.", { readOnly: true, hidden: true }),
			name: propertyDefinition("Name", "Information", "Type name. It is owned by the descriptor file name.", { readOnly: true }),
			file: propertyDefinition("File", "Information", "Internal type descriptor file.", { readOnly: true, hidden: true }),
			__flowFile: propertyDefinition("Source file", "Information", "Internal type descriptor file.", { readOnly: true, hidden: true }),
			__flowOrigin: propertyDefinition("Source origin", "Information", "Internal source origin.", { readOnly: true, hidden: true }),
			sourcePath: propertyDefinition("Source path", "Information", "Internal absolute source path.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Project or engine relative source path.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Origin", "Information", "Source origin: project, core engine or library.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this type can be edited from the current project.", { readOnly: true }),
			origin: propertyDefinition("Origin", "Information", "Catalog origin.", { readOnly: true, hidden: true }),
			iconify: propertyDefinition("Iconify", "Information", "Resolved Iconify id.", { readOnly: true, hidden: true }),
			iconUrl: propertyDefinition("Icon URL", "Information", "Resolved remote icon URL.", { readOnly: true, hidden: true }),
			iconSvg: propertyDefinition("Icon SVG", "Information", "Resolved SVG icon file.", { readOnly: true, hidden: true }),
			iconFile: propertyDefinition("Icon file", "Information", "Resolved icon file.", { readOnly: true, hidden: true }),
			iconFile16: propertyDefinition("Icon 16", "Information", "Resolved 16x16 icon file.", { readOnly: true, hidden: true }),
			iconFile32: propertyDefinition("Icon 32", "Information", "Resolved 32x32 icon file.", { readOnly: true, hidden: true }),
			label: propertyDefinition("Label", "Base properties", "Human-readable type label.", { kind: "text", type: "string" }),
			description: propertyDefinition("Description", "Base properties", "Type documentation.", { kind: "markdown", type: "string" }),
			icon: propertyDefinition("Icon", "Base properties", "Icon id, relative icon file, or URL.", { kind: "icon", type: "string" }),
			type: propertyDefinition("Value type", "Base properties", "JSON value type handled by this property type.", { kind: "text", type: "string" }),
			editor: propertyDefinition("Editor", "Editor", "Editor descriptor. Edit the Editor child/source for implementation code.", { readOnly: true, hidden: true }),
			validator: propertyDefinition("Validator", "Editor", "Validator descriptor.", { readOnly: true, hidden: true }),
			reader: propertyDefinition("Reader", "Editor", "Reader descriptor.", { readOnly: true, hidden: true }),
			writer: propertyDefinition("Writer", "Editor", "Writer descriptor.", { readOnly: true, hidden: true }),
			uses: propertyDefinition("Usages", "Information", "Blocks using this type.", { readOnly: true })
		};
	}

	function typeResourcePropertyDefinitions() {
		return {
			type: propertyDefinition("Type", "Information", "Owner property type.", { readOnly: true }),
			role: propertyDefinition("Role", "Information", "Resource role.", { readOnly: true }),
			file: propertyDefinition("File", "Information", "Internal source file.", { readOnly: true, hidden: true }),
			sourcePath: propertyDefinition("Source path", "Information", "Internal absolute source path.", { readOnly: true, hidden: true }),
			sourceRelativePath: propertyDefinition("Relative path", "Information", "Resource source file. Open the tree item to edit the source.", { readOnly: true }),
			sourceOrigin: propertyDefinition("Origin", "Information", "Source origin: project, core engine or library.", { readOnly: true }),
			sourceWritable: propertyDefinition("Writable", "Information", "Whether this resource can be edited from the current project.", { readOnly: true }),
			iconify: propertyDefinition("Iconify", "Information", "Resolved Iconify id.", { readOnly: true, hidden: true }),
			iconUrl: propertyDefinition("Icon URL", "Information", "Resolved remote icon URL.", { readOnly: true, hidden: true }),
			iconSvg: propertyDefinition("Icon SVG", "Information", "Resolved SVG icon file.", { readOnly: true, hidden: true }),
			iconFile: propertyDefinition("Icon file", "Information", "Resolved icon file.", { readOnly: true, hidden: true }),
			iconFile16: propertyDefinition("Icon 16", "Information", "Resolved 16x16 icon file.", { readOnly: true, hidden: true }),
			iconFile32: propertyDefinition("Icon 32", "Information", "Resolved 32x32 icon file.", { readOnly: true, hidden: true }),
			label: propertyDefinition("Label", "Base properties", "Resource label.", { kind: "text", type: "string" }),
			kind: propertyDefinition("Kind", "Base properties", "Resource kind.", { kind: "text", type: "string" }),
			component: propertyDefinition("Component", "Base properties", "Web component or editor component name.", { kind: "text", type: "string" }),
			icon: propertyDefinition("Icon", "Base properties", "Icon id, relative icon file, or URL.", { kind: "icon", type: "string" }),
			function: propertyDefinition("Function", "Expert", "Runtime function exported by this resource.", { kind: "text", type: "string" })
		};
	}

	function addImplementationNodes(parent, nodes, path, blocks, stack, sourceInfo, sourceBasePath) {
		var implementationNodes = expandFragmentNodes(blocks, nodes || [], stack || [], {
			expandGraphBlocks: false
		});
		addNodeList(parent, implementationNodes, path, blocks, {}, sourceInfo, sourceBasePath || "nodes");
	}

	function addBlockImplementation(parent, block, descriptor, path, blocks) {
		if (!descriptor || !descriptor.file) {
			return;
		}
		if (block && block.__graphDefinition) {
			var flowSource = sourceDefinitionForFile(block.__flowImplementationFile || descriptor.implementationFile || descriptor.file, "flow");
			flowSource.sourceBlockName = descriptor.blockId || block.name || descriptor.name || "";
			flowSource.sourceMutationPath = "nodes";
			flowSource.flowImplementation = true;
			var flowSourceInfo = sourceObjectInfo(flowSource, sourcePropertyDefinitions(),
				["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
			var flowNode = virtualNode("implementation", "blockImplementation", "flow",
				path + ".implementation", "Implementation",
				compact(flowSource), compact(flowSourceInfo), "mdi:source-branch");
			parent.children.push(flowNode);
			addImplementationNodes(flowNode, block.__graphDefinition.nodes || [],
				path + ".implementation.nodes", blocks, ["block:" + block.name], flowSource, "nodes");
			return;
		}
		var jsFile = block && block.__flowImplementationFile ? block.__flowImplementationFile : descriptor.implementationFile || descriptor.file;
		var frontendFile = frontendImplementationFile(block, descriptor);
		var targets = normalizeTree(block && block.__blockDefinition || descriptor).targets || [];
		if (frontendFile && targets.length === 1 && String(targets[0]) === "frontend") {
			addJavascriptImplementationNode(parent, frontendFile, path + ".implementation", "implementation", "Implementation");
			return;
		}
		addJavascriptImplementationNode(parent, jsFile,
			frontendFile ? path + ".backendImplementation" : path + ".implementation",
			frontendFile ? "backendImplementation" : "implementation",
			frontendFile ? "Backend implementation" : "Implementation");
		if (frontendFile) {
			addJavascriptImplementationNode(parent, frontendFile,
				path + ".frontendImplementation", "frontendImplementation", "Frontend implementation");
		}
	}

	function frontendImplementationFile(block, descriptor) {
		var definition = normalizeTree(block && block.__blockDefinition || {});
		var implementations = definition.implementations || descriptor.implementations || {};
		var frontend = implementations.frontend || {};
		if (!frontend.file || !descriptor.file) {
			return "";
		}
		try {
			var descriptorFile = new File(String(descriptor.file)).getCanonicalFile();
			var frontendFile = new File(descriptorFile.getParentFile(), String(frontend.file)).getCanonicalFile();
			return frontendFile.isFile() ? String(frontendFile.getAbsolutePath()) : "";
		} catch (e) {
			return "";
		}
	}

	function addJavascriptImplementationNode(parent, file, path, id, label) {
		var jsSource = sourceDefinitionForFile(file, "javascript");
		var jsSourceInfo = sourceObjectInfo(jsSource, sourcePropertyDefinitions(),
			["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
		parent.children.push(virtualNode(id, "blockImplementation", "javascript",
			path, label,
			compact(jsSource), compact(jsSourceInfo), "mdi:language-javascript"));
	}

	function addBlockHooks(parent, block, path) {
		if (!block || !block.__flowHooksFile) {
			return;
		}
		var hooksSource = sourceDefinitionForFile(block.__flowHooksFile, "javascript-hooks");
		var hooksSourceInfo = sourceObjectInfo(hooksSource, sourcePropertyDefinitions(),
			["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
		parent.children.push(virtualNode("hooks", "blockHooks", "javascript",
			path + ".hooks", "Hooks", compact(hooksSource), compact(hooksSourceInfo), "mdi:script-text-outline"));
	}

	function librarySourceInfo(library) {
		var source = sourceDefinitionForFile(library.file || "", "javascript-library");
		Object.keys(library).forEach(function (key) {
			if (source[key] === undefined) {
				source[key] = library[key];
			}
		});
		return sourceObjectInfo(source, libraryPropertyDefinitions(),
			["name", "provider", "origin", "description", "sourceRelativePath", "sourceOrigin", "sourceWritable"]);
	}

	function libraryForName(libraries, name) {
		name = String(name || "");
		for (var i = 0; i < libraries.length; i++) {
			if (libraries[i].name === name) {
				return libraries[i];
			}
		}
		return null;
	}

	function addBlockUses(parent, descriptor, path) {
		var uses = normalizeGraphBlockUses(descriptor || {});
		if (uses.length === 0) {
			return;
		}
		var libraries = listFlowLibraries();
		var folder = virtualNode("uses", "folder", "uses", path + ".uses",
			"Uses (" + uses.length + ")", compact({ count: uses.length, uses: uses }), null, "mdi:library-outline");
		parent.children.push(folder);
		uses.forEach(function (name, index) {
			var library = libraryForName(libraries, name);
			var definition = library || {
				name: name,
				provider: "",
				origin: "missing",
				file: "",
				description: "Missing Flow JavaScript library."
			};
			var summary = library ? name + " [" + library.provider + "]" : name + " [missing]";
			folder.children.push(virtualNode("library_" + name, "libraryUse", name,
				path + ".uses[" + index + "]", summary, compact(definition),
				compact(librarySourceInfo(definition)), library ? "mdi:script-text-outline" : "mdi:alert-outline"));
		});
	}

	function propertyDefinitionIcon(definition) {
		var kind = String(definition && (definition.kind || definition.type) || "");
		if (kind === "expression") {
			return "mdi:function-variant";
		}
		if (kind === "path") {
			return "mdi:map-marker-path";
		}
		if (kind === "template") {
			return "mdi:code-braces";
		}
		if (kind === "boolean") {
			return "mdi:toggle-switch-outline";
		}
		if (kind === "array") {
			return "mdi:format-list-bulleted";
		}
		if (kind === "object" || kind === "literal") {
			return "mdi:code-json";
		}
		return "mdi:form-textbox";
	}

	function propertyDefinitionSummary(name, definition) {
		definition = definition || {};
		var kind = String(definition.kind || definition.type || "value");
		var type = String(definition.type || "");
		var suffix = type && type !== kind ? kind + ":" + type : kind;
		return name + " [" + suffix + "]";
	}

	function addBlockProperties(parent, descriptor, path) {
		var props = normalizeTree(descriptor && descriptor.props || {});
		var keys = Object.keys(props);
		var propsSource = sourceDefinitionForFile(descriptor.file, "properties");
		propsSource.sourceMutationPath = "props";
		var folderInfo = sourceObjectInfo(propsSource, blockPropertiesFolderDefinitions(), ["count"]);
		var folder = virtualNode("properties", "folder", "blockProperties",
			path + ".properties", "Properties", compact({ count: keys.length }), compact(folderInfo), "mdi:form-textbox");
		parent.children.push(folder);
		keys.forEach(function (key) {
			var propDefinition = normalizeTree(props[key] || {});
			propDefinition.name = key;
			var propSource = sourceDefinitionForFile(descriptor.file, "property");
			propSource.sourceMutationPath = "props." + key;
			var propInfo = sourceObjectInfo(propSource, blockPropertyDefinitionDefinitions(),
				["name", "label", "kind", "type", "mode", "description", "default", "items", "component",
					"sourceRelativePath", "sourceOrigin", "sourceWritable"]);
			folder.children.push(virtualNode("property_" + safeVirtualName("property", key), "blockProperty", key,
				path + ".properties." + safeVirtualName("property", key),
				propertyDefinitionSummary(key, propDefinition), compact(propDefinition), compact(propInfo),
				propertyDefinitionIcon(propDefinition)));
		});
	}

	function addCatalogLibraries(catalog) {
		var libraries = listFlowLibraries();
		var folder = virtualNode("libraries", "folder", "libraries", "catalog.libraries",
			"Libraries", compact({ count: libraries.length }), null, "mdi:library-outline");
		catalog.children.push(folder);
		var groups = {};
		libraries.forEach(function (library) {
			var provider = String(library.provider || library.origin || "unknown");
			if (!groups[provider]) {
				var groupPath = "catalog.libraries." + safeVirtualName("provider", provider);
				groups[provider] = virtualNode("provider_" + provider, "folder", library.origin || "unknown",
					groupPath, provider, compact({ provider: provider, origin: library.origin || "", count: 0 }),
					compact(sourceObjectInfo({ provider: provider, origin: library.origin || "", count: 0 },
						catalogGroupPropertyDefinitions(), ["provider", "origin", "count"])),
					library.origin === "core" ? "mdi:package-variant-closed" : "mdi:folder-account-outline");
				folder.children.push(groups[provider]);
			}
			var group = groups[provider];
			var definition = JSON.parse(group.definition || "{}");
			definition.count = Number(definition.count || 0) + 1;
			group.definition = compact(definition);
			group.children.push(virtualNode("library_" + library.name, "library", library.name,
				group.path + "." + safeVirtualName("library", library.name),
				library.name, compact(library), compact(librarySourceInfo(library)), "mdi:script-text-outline"));
		});
	}

	function addCatalog(out, blocks, options) {
		var catalog = virtualNode("catalog", "folder", "catalog", "catalog", "Catalog", compact({}), null, "mdi:bookshelf");
		var catalogDefinitionValue = catalogDefinition(blocks, options || {});
		var blocksFolder = virtualNode("blocks", "folder", "blocks", "catalog.blocks", "Blocks", compact({}), null, "mdi:puzzle-outline");
		catalog.children.push(blocksFolder);
		var iconByOrigin = {
			core: "mdi:package-variant-closed",
			project: "mdi:folder-account-outline"
		};
		catalogDefinitionValue.groups.forEach(function (group) {
			var groupKey = safeVirtualName("provider", group.provider || group.origin || "unknown");
			var groupPath = "catalog.blocks." + groupKey;
			var groupDefinition = compact({ provider: group.provider || "", origin: group.origin, count: group.blocks.length });
			var groupInfo = sourceObjectInfo({}, catalogGroupPropertyDefinitions(), ["provider", "origin", "count"]);
			var groupNode = virtualNode("provider_" + groupKey, "folder", group.origin, groupPath,
				group.name, groupDefinition, compact(groupInfo),
				iconByOrigin[group.origin] || "mdi:source-repository");
			blocksFolder.children.push(groupNode);
			var namespaceFolders = {};
			group.blocks.forEach(function (block) {
				var namespace = String(block.namespace || "");
				var namespaceKey = namespace || "_root";
				var parentNode = groupNode;
				var parentPath = groupPath;
				if (namespace) {
					if (!namespaceFolders[namespaceKey]) {
						var namespacePath = groupPath + "." + safeVirtualName("namespace", namespaceKey);
						namespaceFolders[namespaceKey] = virtualNode("namespace_" + namespaceKey, "folder", "namespace",
							namespacePath, namespace, compact({ namespace: namespace, count: 0 }), null, "mdi:folder-pound-outline");
						groupNode.children.push(namespaceFolders[namespaceKey]);
					}
					parentNode = namespaceFolders[namespaceKey];
					parentPath = parentNode.path;
					var nsDefinition = JSON.parse(parentNode.definition || "{}");
					nsDefinition.count = Number(nsDefinition.count || 0) + 1;
					parentNode.definition = compact(nsDefinition);
				}
				var blockId = block.blockId || block.name;
				var blockPath = parentPath + "." + safeVirtualName("block", blockId);
				var blockSource = sourceDefinitionForFile(block.file, block.implementation || "");
				var loadedBlock = blocks[blockId] || {};
				var blockDefinition = normalizeTree(loadedBlock.__blockDefinition || block);
				blockDefinition.blockId = blockId;
				blockDefinition.name = block.name || block.localName || blockId;
				blockDefinition.localName = block.localName || block.name || blockId;
				blockDefinition.namespace = block.namespace || "";
				blockDefinition.provider = block.provider || "";
				blockDefinition.visibility = block.visibility || blockDefinition.visibility || "public";
				blockDefinition.file = block.file || blockDefinition.file || "";
				var blockInfo = sourceObjectInfo(blockSource, blockPropertyDefinitions(),
					["name", "provider", "namespace", "blockId", "description", "longDescription", "icon", "tags", "uses", "visibility", "private", "slots", "implementation", "hooks"]);
				var blockNode = virtualNode("block_" + blockId, "block", blockId,
					blockPath, block.name || blockId, compact(blockDefinition), compact(blockInfo),
					block.icon || block.iconify || "mdi:puzzle-outline");
				parentNode.children.push(blockNode);
				addBlockProperties(blockNode, blockDefinition, blockPath);
				addBlockImplementation(blockNode, blocks[blockId], block, blockPath, blocks);
				addBlockHooks(blockNode, blocks[blockId], blockPath);
				addBlockUses(blockNode, blockDefinition, blockPath);
			});
		});
		addCatalogLibraries(catalog);
		var typesFolder = virtualNode("types", "folder", "types", "catalog.types", "Types", compact({}), null, "mdi:shape-outline");
		catalog.children.push(typesFolder);
		catalogDefinitionValue.types.forEach(function (type) {
			var typePath = "catalog.types." + type.name;
			var summary = (type.label || type.name) + (type.uses && type.uses.length ? " (" + type.uses.length + " uses)" : "");
			var typeSource = sourceDefinitionForFile(type.file, "type");
			var typeInfo = sourceObjectInfo(typeSource, typePropertyDefinitions(),
				["name", "sourceRelativePath", "sourceOrigin", "sourceWritable", "label", "description", "icon", "type", "uses"]);
			var typeNode = virtualNode("type_" + type.name, "type", type.name,
				typePath, summary, compact(type), compact(typeInfo), type.icon || "mdi:form-textbox");
			typesFolder.children.push(typeNode);
			["documentation", "editor", "validator", "reader", "writer"].forEach(function (resourceName) {
				var resource = type[resourceName];
				if (!resource || typeof resource !== "object") {
					return;
				}
				if (resource.file && type.file && resource.file === type.file) {
					return;
				}
				var resourceInfo = sourceObjectInfo(sourceDefinitionForFile(resource.file || "", resourceName),
					typeResourcePropertyDefinitions(),
					["type", "role", "sourceRelativePath", "sourceOrigin", "sourceWritable", "label", "kind", "component", "function"]);
				typeNode.children.push(virtualNode(resourceName, "typeResource", resourceName,
					typePath + "." + resourceName,
					(resource.label || resourceName) + (resource.component ? " [" + resource.component + "]" : ""),
					compact(Object.assign({ type: type.name, role: resourceName }, resource)),
					compact(resourceInfo), resource.icon || "mdi:file-code-outline"));
			});
			if (!type.uses || type.uses.length === 0) {
				return;
			}
			var usesFolder = virtualNode("uses", "folder", "uses", typePath + ".uses",
				"Usages (" + type.uses.length + ")", "", null, "mdi:source-branch");
			typeNode.children.push(usesFolder);
			type.uses.forEach(function (use, index) {
				usesFolder.children.push(virtualNode("type_use_" + use.block + "_" + use.property, "typeUse", type.name,
					typePath + ".uses[" + index + "]",
					use.block + "." + use.property, compact(use), null, "mdi:source-branch"));
			});
		});
		out.push(catalog);
	}

	function addFragments(out, blocks) {
		var fragments = listProjectFragments().fragments;
		if (fragments.length === 0) {
			return;
		}
		var folder = virtualNode("fragments", "folder", "fragments", "fragments",
			"Fragments", compact(fragments), null, "mdi:folder-sync-outline");
		fragments.forEach(function (fragment) {
			var fragmentPath = "fragments." + fragment.name;
			var fragmentNode = virtualNode("fragment_" + fragment.name, "fragment", fragment.name,
				fragmentPath, fragment.name, compact(fragment), null, "mdi:folder-sync-outline");
			folder.children.push(fragmentNode);
			try {
				var loaded = readFragment(fragment.name);
				var implementationNode = virtualNode("implementation", "fragmentImplementation", "flow",
					fragmentPath + ".implementation", "Implementation",
					compact(sourceDefinitionForFile(loaded.file, "flow")), null, "mdi:source-branch");
				fragmentNode.children.push(implementationNode);
				addImplementationNodes(implementationNode, loaded.definition.nodes || [],
					fragmentPath + ".implementation.nodes", blocks, ["fragment:" + fragment.name]);
			} catch (e) {
				fragmentNode.children.push(virtualNode("error", "error", "fragment",
					fragmentPath + ".error", String(e.message || e), compact({ error: String(e.message || e) }), null, "mdi:alert-outline"));
			}
		});
		out.push(folder);
	}

	function inspectTreeProps(definition) {
		var raw = definition && definition.props && typeof definition.props === "object" ? definition.props : {};
		var out = {};
		function add(key, value) {
			if (key === "id" || key === "kind") {
				return;
			}
			if (value === undefined || value === null || typeof value === "object") {
				return;
			}
			out[key] = value;
		}
		Object.keys(raw).sort().forEach(function (key) {
			add(key, raw[key]);
		});
		[
			"text", "label", "source", "value", "path", "test", "condition", "requestable",
			"clientAction", "backendCall", "context", "index", "key", "variant", "padding",
			"radius", "fullWidth", "maxWidth", "align", "gap", "href", "src", "alt", "title",
			"route"
		].forEach(function (key) {
			if (out[key] === undefined && definition && definition[key] !== undefined) {
				add(key, definition[key]);
			}
		});
		return out;
	}

	function inspectTreeSlots(definition) {
		var slots = definition && definition.slots && typeof definition.slots === "object" ? definition.slots : {};
		return Object.keys(slots).sort().map(function (key) {
			var slot = slots[key] || {};
			var out = {
				name: key,
				label: slot.label || key
			};
			if (slot.accepts && slot.accepts.length) {
				out.accepts = slot.accepts.slice(0, 8);
			}
			return out;
		});
	}

	function compactInspectPropertyDefinition(property) {
		property = property || {};
		var out = {};
		["label", "kind", "type", "required", "description", "catalogProperty"].forEach(function (key) {
			if (property[key] !== undefined) {
				out[key] = property[key];
			}
		});
		if (property.bindingSources && property.bindingSources.length) {
			out.bindingSourceCount = property.bindingSources.length;
		}
		return out;
	}

	function inspectTreePropertyDefinitions(definitions) {
		var out = {};
		Object.keys(definitions || {}).sort().forEach(function (name) {
			if (definitions[name] && definitions[name].hidden === true) {
				return;
			}
			out[name] = compactInspectPropertyDefinition(definitions[name]);
		});
		return out;
	}

	function inspectTreeBindings(node, definition, requestedProperty, requestedSourceId) {
		var info = null;
		try {
			info = node && node.info ? JSON.parse(node.info) : null;
		} catch (e) {
		}
		var definitions = info && info.propertyDefinitions || {};
		var bindings = {};
		Object.keys(definitions).sort().forEach(function (name) {
			var property = definitions[name] || {};
			if (property.hidden === true) {
				return;
			}
			if (property.kind !== "binding" && property.type !== "binding") {
				return;
			}
			if (requestedProperty && name !== requestedProperty) {
				return;
			}
			if (!requestedProperty) {
				bindings[name] = {
					current: definition && definition[name] !== undefined ? definition[name] : null,
					sourceCount: (property.bindingSources || []).length
				};
				return;
			}
			var sources = (property.bindingSources || []).filter(function (candidate) {
				if (!requestedSourceId) return true;
				return String(candidate.id || candidate.source && (candidate.source.actionId || candidate.source.scopeId) || "") === requestedSourceId;
			}).map(function (candidate) {
				var out = {
					category: candidate.category || candidate.source && candidate.source.category || "",
					id: candidate.id || candidate.source && (candidate.source.actionId || candidate.source.scopeId) || "",
					label: candidate.label || candidate.id || "",
					binding: candidate.binding || null,
					mutation: candidate.mutation || null
				};
				if (candidate.bindings && candidate.bindings.length) {
					out.bindings = candidate.bindings.slice(0, 40).map(function (entry) {
						return {
							path: entry.path || "",
							type: entry.type || "unknown",
							binding: entry.binding || null,
							mutation: entry.mutation || null
						};
					});
				}
				return out;
			});
			bindings[name] = {
				current: definition && definition[name] !== undefined ? definition[name] : null,
				sources: sources
			};
		});
		return bindings;
	}

	function compactTreeNode(node, depth, maxDepth, includeDefinition, includeInspect, requestedProperty, requestedSourceId, includeInternalMutation) {
		var out = {
			name: node.name,
			kind: node.kind,
			type: node.type,
			path: node.path,
			summary: node.summary
		};
		var parsedDefinition = null;
		var parsedInfo = null;
		if (node.definition) {
			try {
				parsedDefinition = JSON.parse(node.definition);
				if (parsedDefinition && typeof parsedDefinition === "object" && Object.prototype.toString.call(parsedDefinition) !== "[object Array]") {
					if (parsedDefinition.id !== undefined) {
						out.nodeId = parsedDefinition.id;
					}
					if (parsedDefinition.block !== undefined) {
						out.block = parsedDefinition.block;
					}
				}
			} catch (e) {
			}
			if (includeInspect === true && parsedDefinition) {
				try {
					parsedInfo = node.info ? JSON.parse(node.info) : null;
				} catch (e0) {
				}
				if (parsedInfo && parsedInfo.propertyDefinitions) {
					out.propertyDefinitions = inspectTreePropertyDefinitions(parsedInfo.propertyDefinitions);
				}
				var props = inspectTreeProps(parsedDefinition);
				if (Object.keys(props).length) {
					out.props = props;
				}
				var slots = inspectTreeSlots(parsedDefinition);
				if (slots.length) {
					out.slots = slots;
				}
				var bindings = inspectTreeBindings(node, parsedDefinition, requestedProperty, requestedSourceId);
				if (Object.keys(bindings).length) {
					out.bindings = bindings;
				}
			}
			if (includeDefinition === true) {
				out.definition = node.definition;
			}
			if (includeInternalMutation === true) {
				if (!parsedInfo) {
					try { parsedInfo = node.info ? JSON.parse(node.info) : null; } catch (e1) {}
				}
				if (parsedInfo) {
					out.sourceMutationPath = parsedInfo.frontendModelPath || parsedInfo.sourceMutationPath || "";
					out.sourcePropertyMutationPaths = parsedInfo.sourcePropertyMutationPaths || {};
				}
			}
		}
		var children = node.children || [];
		out.childCount = children.length;
		if (children.length && depth < maxDepth) {
			out.children = children.map(function (child) {
					return compactTreeNode(child, depth + 1, maxDepth, includeDefinition, includeInspect, requestedProperty, requestedSourceId, includeInternalMutation);
			});
		}
		return out;
	}

	function compactTreeResponse(tree, request) {
		request = request || {};
		var detail = String(request.detail || request.mode || "full");
		if (detail === "full") {
			return tree;
		}
		var includeInspect = detail === "inspect";
		var requestedProperty = String(request.property || request.bindingProperty || "");
		var requestedSourceId = String(request.sourceId || "");
		var maxDepthLimit = request.internalDeep === true ? 64 : 20;
		var maxDepth = intOption(request.maxDepth, detail === "summary" ? 2 : includeInspect ? 6 : 4, 0, maxDepthLimit);
		var includeDefinition = request.includeDefinition === true || String(request.includeDefinition || "") === "true";
		var includeInternalMutation = request.internalDeep === true;
		var out = {
			ok: tree.ok,
			target: tree.target,
			detail: detail,
			childCount: (tree.children || []).length,
			children: (tree.children || []).map(function (child) {
				return compactTreeNode(child, 0, maxDepth, includeDefinition, includeInspect, requestedProperty, requestedSourceId, includeInternalMutation);
			})
		};
		if (requestedProperty) {
			out.property = requestedProperty;
			if (requestedSourceId) out.sourceId = requestedSourceId;
		} else if (includeInspect) {
			out.next = "For exact binding candidates, repeat with the same focusPath, maxDepth:0 and property:<bindable property name>.";
		}
		["surface", "builder", "focusPath", "rootPath", "diagnostics", "error", "warning", "warnings", "next"].forEach(function (key) {
			if (tree[key] !== undefined) {
				out[key] = tree[key];
			}
		});
		if (tree.source && request.includeSource === true) {
			out.source = tree.source;
		}
		if (tree.analysis && request.includeAnalysis === true) {
			out.analysis = tree.analysis;
		}
		return out;
	}

	function describeTreeRequest(request, blocks) {
		request = request || {};
		var target = String(request.target || "flow");
		var children = [];
		if (target === "flow") {
			var definition = request.definition !== undefined && request.definition !== null
				? canonicalFlowDefinition(normalizeTree(request.definition))
				: parseSource(sourceForFlowRequest(request, blocks));
			var activeBlocks = blocksWithFlowHelpers ? blocksWithFlowHelpers(blocks, definition) : blocks;
			definition = expandFlowDefinition(activeBlocks, definition);
			var analysisById = {};
			if (request.includeAnalysis === true || request.includeProperties === true || request.includeSchema === true) {
				var analysisRequest = Object.assign({}, request, {
					allowRequestableSchema: false
				});
				analysisRequest.flowSource = sourceFromDefinition(definition);
				analysisById = analysisByNodeId(analyzeFlowDefinition(activeBlocks, definition, analysisRequest));
			}
			addContracts(children, definition.contracts, "contracts");
			addBindings(children, definition.bindings, "bindings");
			var flowMeta = definition.flow || definition._flow || {};
			addFlowSchema(children, definition.inputs || definition.input || flowMeta.inputs || flowMeta.input,
				"inputs", "inputs", "Inputs");
			addFlowSchema(children, definition.outputs || definition.output || flowMeta.outputs || flowMeta.output,
				"outputs", "outputs", "Outputs");
			addHelpers(children, definition.helpers || [], "helpers", activeBlocks, analysisById,
				request.sourceFile || request.sourcePath || "");
			addNodes(children, definition.nodes || [], "nodes", activeBlocks, analysisById);
		} else if (target === "engine") {
			var engine = request.definition !== undefined && request.definition !== null
				? normalizeTree(request.definition)
				: parseYamlSource(request.engineSource, "version: 1\n");
			addEngineMetadata(children, engine, "engine");
			addBindings(children, engine.bindings, "bindings");
			addConfig(children, engine.config, "config", engine.configVisibility, request);
			addFrontendModels(children, engine.config, "frontends", request, blocks);
			if (request.includeFlowCatalog !== false) {
				addFragments(children, blocks);
				addCatalog(children, blocks, {
					includePrivate: request.includePrivate !== false
				});
			}
		} else {
			raise("UNKNOWN_TREE_TARGET", "Unknown Flow tree target: " + target);
		}
		return compactTreeResponse({
			ok: true,
			target: target,
			children: children
		}, request);
	}

	function authoringEngineDefinition(request) {
		request = request || {};
		if (request.definition !== undefined && request.definition !== null) {
			return normalizeTree(request.definition);
		}
		if (env.projectEngineDefinitionForRequest) {
			try {
				return normalizeTree(env.projectEngineDefinitionForRequest(request) || {});
			} catch (e) {
			}
		}
		return parseYamlSource(request.engineSource, "version: 1\n");
	}

	function authoringEngineTree(request, blocks) {
		request = request || {};
		return describeTreeRequest(Object.assign({}, request, {
			target: "engine",
			detail: "full",
			definition: authoringEngineDefinition(request)
		}), blocks);
	}

	function authoringSourceTreeRequest(request) {
		request = request || {};
		var sourcePath = String(request.sourceFile || request.sourcePath || "");
		var rootPath = String(request.authoringRootPath || request.rootPath || "frontAst");
		var document = request.document || {};
		var documentTree = request.documentTree || request.tree || document.tree || {};
		var routeRoots = rootPath.indexOf(".routes.") >= 0
			? request.pageNodes || document.pageNodes || documentTree.pageNodes || []
			: [];
		var roots = routeRoots.length ? routeRoots : documentTree.children || [];
		var routeProjection = rootPath.indexOf(".routes.") >= 0;
		var root = !routeProjection && roots.length === 1 ? roots[0] : null;
		if (routeProjection) {
			var candidates = [];
			var normalizedSourcePath = sourcePath.replace(/\\/g, "/");
			(function collect(nodes) {
				(nodes || []).forEach(function (node) {
					var kind = String(node && node.kind || "");
					var nodeSourcePath = String(node && node.sourcePath || "").replace(/\\/g, "/");
					var score = 0;
					if (kind === "frontendPage" || kind === "frontendRouteLayout") {
						score += 100;
					}
					if (nodeSourcePath && nodeSourcePath === normalizedSourcePath) {
						score += 50;
					}
					if (String(node && node.sourceMutationPath || "") === "frontAst") {
						score += 25;
					}
					if (score >= 100) {
						candidates.push({ node: node, score: score });
					}
					collect(node && node.children);
				});
			})(roots);
			candidates.sort(function (left, right) {
				return right.score - left.score;
			});
			root = candidates.length ? candidates[0].node : null;
		}
		if (!root) {
			return {
				ok: false,
				target: "authoringSource",
				sourcePath: sourcePath,
				rootPath: rootPath,
				children: [],
				error: {
					code: "AUTHORING_SOURCE_ROOT_NOT_FOUND",
					message: "The Flow Svelte authoring document must expose exactly one source root."
				}
			};
		}
		var sourceFile = sourcePath ? new File(sourcePath) : null;
		var projected = { children: [] };
		root = normalizeTree(root);
		if (root.kind === "frontendComponent" && root.type === "flow-svelte-ui-block"
				&& root.children && root.children.length === 1
				&& root.children[0].kind === "frontendComponent"
				&& String(root.children[0].sourceMutationPath || "") === "frontAst") {
			root.children = root.children[0].children || [];
		}
		addFrontendAuthoringNode(projected, root, rootPath, sourceFile);
		return {
			ok: true,
			target: "authoringSource",
			sourcePath: sourcePath,
			rootPath: rootPath,
			children: projected.children
		};
	}

	function authoringBuilderName(request, engine) {
		var builder = String(request && request.builder || "");
		if (builder) {
			return builder;
		}
		var entries = frontbuilderSettings(engine && engine.config || {});
		return entries.length === 1 ? entries[0].name : "";
	}

	function findAuthoringBuilderNode(tree, builder) {
		var frontendsMatch = findTreeNode(tree, "frontends");
		var frontends = frontendsMatch && frontendsMatch.node ? frontendsMatch.node : frontendsMatch;
		if (!frontends) {
			return null;
		}
		if (!builder) {
			return frontends;
		}
		var children = frontends.children || [];
		for (var i = 0; i < children.length; i++) {
			if (children[i].kind === "frontendBuilder" && children[i].type === builder) {
				return children[i];
			}
		}
		return null;
	}

	function authoringTreeRequest(request, blocks) {
		request = request || {};
		var engine = authoringEngineDefinition(request);
		var tree = authoringEngineTree(Object.assign({}, request, { definition: engine }), blocks);
		var surface = String(request.surface || "frontend");
		var builder = authoringBuilderName(request, engine);
		var focus = surface === "frontend" ? findAuthoringBuilderNode(tree, builder) : null;
		var children = focus ? [focus] : tree.children || [];
		var focusPath = String(request.focusPath || request.rootPath || request.path || "");
		if (focusPath) {
			var scopedRoot = { children: children };
			var focused = findTreeNode(scopedRoot, focusPath) || findTreeNode(tree, focusPath);
			if (!focused || !focused.node) {
				return compactTreeResponse({
					ok: false,
					target: "authoring",
					surface: surface,
					builder: builder,
					focusPath: focusPath,
					children: [],
					error: {
						code: "AUTHORING_TREE_FOCUS_NOT_FOUND",
						message: "No authoring tree node matches focusPath: " + focusPath
					},
					next: "Call frontend-svelte-tree without focusPath to discover valid paths, then retry with one returned path."
				}, request);
			}
			children = [focused.node];
		}
		return compactTreeResponse({
			ok: true,
			target: "authoring",
			surface: surface,
			builder: builder,
			focusPath: focusPath,
			diagnostics: focus && focus.diagnostics || [],
			children: children
		}, request);
	}

	function authoringDescriptors(request, engine, blocks) {
		request = request || {};
		var surface = String(request.surface || "frontend");
		if (surface !== "frontend") {
			return [];
		}
		var builder = authoringBuilderName(request, engine);
		var entries = frontbuilderSettings(engine && engine.config || {});
		var descriptors = [];
		if (!entries.length) {
			descriptors = descriptors.concat(frontendCreateDescriptorsForSettings(builder || "svelte", {
				target: "svelte5"
			}) || []);
		} else {
			entries.forEach(function (entry) {
				if (builder && entry.name !== builder) {
					return;
				}
				descriptors = descriptors.concat(frontendBlocksForSettings(entry.name, entry.settings) || []);
				descriptors = descriptors.concat(frontendCreateDescriptorsForSettings(entry.name, entry.settings) || []);
			});
		}
		descriptors = descriptors.concat(frontendPortableBlockDescriptors(blocks));
		var seen = {};
		return descriptors.filter(function (descriptor) {
			var id = String(descriptor && descriptor.id || "");
			if (!id || seen[id]) {
				return false;
			}
			seen[id] = true;
			return true;
		});
	}

	function findTreeNode(root, path) {
		if (!root || !path) {
			return null;
		}
		var found = null;
		function nodeMatches(node) {
			return node && (node.path === path || node.sourceMutationPath === path);
		}
		function visit(node, parent) {
			if (!node || found) {
				return;
			}
			if (nodeMatches(node)) {
				found = {
					node: node,
					parent: parent || null
				};
				return;
			}
			(node.children || []).forEach(function (child) {
				visit(child, node);
			});
		}
		if (nodeMatches(root)) {
			return { node: root, parent: null };
		}
		(root.children || []).forEach(function (child) {
			visit(child, root);
		});
		return found;
	}

	function nodeJson(node, key) {
		var value = node && node[key];
		if (!value) {
			return {};
		}
		if (typeof value === "object") {
			return normalizeTree(value);
		}
		var text = String(value);
		try {
			return normalizeTree(JSON.parse(text));
		} catch (e) {
			return {};
		}
	}

	function nodeValue(node, key) {
		var info = nodeJson(node, "info");
		if (info[key] !== undefined) {
			return info[key];
		}
		var definition = nodeJson(node, "definition");
		return definition[key];
	}

	function nodeFlag(node, key) {
		var value = nodeValue(node, key);
		return value === true || String(value) === "true";
	}

	function nodeObjectValue(node, key) {
		var value = nodeValue(node, key);
		if (!value) {
			return {};
		}
		if (typeof value === "object") {
			return normalizeTree(value);
		}
		try {
			return normalizeTree(JSON.parse(String(value)));
		} catch (e) {
			return {};
		}
	}

	function inheritedWritable(value, fallback) {
		if (value === undefined || value === null || value === "") {
			return fallback;
		}
		return value === true || String(value) === "true";
	}

	function authoringDerivedSlots(focus) {
		var slots = {};
		var kind = String(focus.kind || "");
		var type = String(focus.type || "");
		var writable = focus.sourceWritable;
		function add(id, label, accepts, mutationPath) {
			slots[id] = {
				id: id,
				label: label,
				accepts: frontendArray(accepts),
				sourceMutationPath: String(mutationPath || ""),
				sourceWritable: writable
			};
		}
		if (kind === "frontendBuilder") {
			add("catalog", "Catalog", ["definition.page", "definition.layout", "definition.routePage",
				"definition.routeLayout", "definition.routeFolder", "definition.uiBlock"], "");
		}
		if (kind === "frontendRoutes" || kind === "frontendRouteRoot" || kind === "frontendRouteGroup"
			|| kind === "frontendRouteSegment" || kind === "frontendRouteChildren") {
			add("routes", "Routes", ["definition.routePage", "definition.routeLayout", "definition.routeFolder"], "");
		}
		if (kind === "folder" && type === "frontends") {
			add("builders", "Frontends", ["definition.frontendBuilder"], "");
		}
		if (type === "frontendBlockProvider" || type === "frontendBlockNamespace") {
			add("definitions", "Definitions", ["definition.uiBlock"], "");
		}
		if (type === "frontendBlocks") {
			add("uiBlocks", "UI blocks", ["definition.uiBlock"], "");
		}
		if (kind === "folder" && type === "frontendBlockProperties") {
			add("properties", "Properties", ["definition.property"], focus.sourceMutationPath || "props");
		}
		if (type === "frontendActionBlocks") {
			add("actionBlocks", "Action blocks", ["definition.clientAction", "definition.backendCall"], "");
		}
		if (type === "frontendStructureBlocks") {
			add("structureBlocks", "Structure blocks", ["definition.page", "definition.layout",
				"definition.layoutRegion", "definition.navigationItem"], "");
		}
		return slots;
	}

	function normalizedAuthoringSlots(node, focus) {
		var raw = nodeObjectValue(node, "slots");
		var slots = {};
		Object.keys(raw || {}).forEach(function (key) {
			var slot = raw[key] && typeof raw[key] === "object" ? normalizeTree(raw[key]) : {};
			slot.id = slot.id || key;
			slot.label = slot.label || key;
			slot.accepts = frontendArray(slot.accepts);
			slot.sourceMutationPath = String(slot.sourceMutationPath || "");
			slot.sourceWritable = inheritedWritable(slot.sourceWritable, focus.sourceWritable);
			slots[key] = slot;
		});
		if (Object.keys(slots).length) {
			return slots;
		}
		return authoringDerivedSlots(focus);
	}

	function authoringNodeSummary(node) {
		if (!node) {
			return null;
		}
		var summary = {
			path: node.path || "",
			name: node.name || "",
			kind: node.kind || "",
			type: node.type || "",
			summary: node.summary || "",
			readOnly: nodeFlag(node, "readOnly"),
			readOnlyReference: nodeFlag(node, "readOnlyReference"),
			inferred: nodeFlag(node, "inferred"),
			sourceWritable: nodeValue(node, "sourceWritable") === undefined ? null : nodeFlag(node, "sourceWritable"),
			sourcePath: String(nodeValue(node, "sourcePath") || ""),
			insertSourcePath: String(nodeValue(node, "frontendInsertSourcePath") || ""),
			sourceMutationPath: String(nodeValue(node, "sourceMutationPath") || ""),
			insertMutationPath: String(nodeValue(node, "frontendInsertMutationPath") || ""),
			traits: frontendArray(nodeValue(node, "traits"))
		};
		summary.slots = normalizedAuthoringSlots(node, summary);
		return summary;
	}

	function arrayContains(array, value) {
		if (!array || !array.length) {
			return true;
		}
		for (var i = 0; i < array.length; i++) {
			if (String(array[i]) === String(value)) {
				return true;
			}
		}
		return false;
	}

	function arraysIntersect(left, right) {
		left = frontendArray(left);
		right = frontendArray(right);
		if (!left.length || !right.length) {
			return false;
		}
		var values = {};
		left.forEach(function (value) {
			values[String(value)] = true;
		});
		for (var i = 0; i < right.length; i++) {
			if (values[String(right[i])]) {
				return true;
			}
		}
		return false;
	}

	function descriptorTargetMatch(descriptor, focus) {
		var targets = descriptor && descriptor.targetKinds || [];
		if (!targets || !targets.length) {
			return true;
		}
		var accepted = {};
		accepted[String(focus.kind || "")] = true;
		accepted[String(focus.type || "")] = true;
		if (focus.kind === "engine" || focus.type === "engine") {
			accepted.flowEngine = true;
		}
		for (var i = 0; i < targets.length; i++) {
			if (accepted[String(targets[i])]) {
				return true;
			}
		}
		return false;
	}

	function descriptorSlotMatch(descriptor, focus, target) {
		var traits = frontendArray(descriptor && descriptor.traits);
		var accepts = frontendArray(target && target.accepts);
		if (traits.length && accepts.length) {
			return arraysIntersect(traits, accepts);
		}
		return descriptorTargetMatch(descriptor, focus);
	}

	function descriptorPositionMatch(descriptor, position) {
		var accepted = descriptor && descriptor.acceptedPositions || [];
		position = position || "inside";
		if ((position === "before" || position === "after") && arrayContains(accepted, "inside")) {
			return true;
		}
		return arrayContains(accepted, position);
	}

	function descriptorMatchesQuery(descriptor, query) {
		query = String(query || "").trim().toLowerCase();
		if (!query) {
			return true;
		}
		var text = [
			descriptor.id,
			descriptor.name,
			descriptor.localName,
			descriptor.label,
			descriptor.category,
			descriptor.description,
			descriptor.kind
		].join(" ").toLowerCase();
		if (text.indexOf(query) !== -1) {
			return true;
		}
		var tokens = query.split(/\s+/).filter(function (token) {
			return token.length > 1;
		});
		if (!tokens.length) {
			return true;
		}
		return tokens.some(function (token) {
			return text.indexOf(token) !== -1;
		});
	}

	function descriptorMutationTargetIssue(descriptor, focus, position, target) {
		var insert = descriptor && descriptor.insert || {};
		var writable = target && target.sourceWritable !== undefined && target.sourceWritable !== null
			? target.sourceWritable
			: focus.sourceWritable;
		if (insert.__engineMutationPath || insert.__frontendMutationPath) {
			return null;
		}
		if (insert.__frontendCreateSource) {
			return writable === false ? "noWritableSource" : null;
		}
		if (focus.readOnlyReference || target && target.readOnlyReference) {
			return "readOnlyReference";
		}
		if (writable === false) {
			return "noWritableSource";
		}
		if (target && target.sourceMutationPath) {
			return null;
		}
		if (position === "before" || position === "after") {
			return focus.sourceMutationPath ? null : "noMutationPath";
		}
		return (focus.insertMutationPath || focus.sourceMutationPath) ? null : "noMutationPath";
	}

	function descriptorMutationTargetPossible(descriptor, focus, position, target) {
		return descriptorMutationTargetIssue(descriptor, focus, position, target) === null;
	}

	function cloneAuthoringInsert(insert) {
		return normalizeTree(insert || {});
	}

	function descriptorPropertyContract(properties) {
		var out = {};
		Object.keys(properties || {}).sort().forEach(function (name) {
			var definition = properties[name] || {};
			var kind = String(definition.kind || definition.type || "text");
			var item = {
				kind: kind,
				type: String(definition.type || kind || "unknown"),
				intents: kind === "binding" || String(definition.type || "") === "binding"
					? ["literal", "expression", "source"]
					: ["literal"]
			};
			if (definition.default !== undefined) {
				item.default = normalizeTree(definition.default);
			}
			if (Object.prototype.toString.call(definition["enum"]) === "[object Array]" && definition["enum"].length <= 16) {
				item["enum"] = normalizeTree(definition["enum"]);
			}
			if (definition.required === true) {
				item.required = true;
			}
			out[name] = item;
		});
		return out;
	}

	function descriptorItem(descriptor, target) {
		var out = {};
		["id", "name", "localName", "label", "category", "kind", "icon", "description", "provider", "namespace",
			"iconify", "iconUrl", "iconSvg", "iconFile", "iconFile16", "iconFile32",
			"sourceBacked", "descriptorKind", "sourceWritable"].forEach(function (key) {
			if (descriptor[key] !== undefined && descriptor[key] !== null && descriptor[key] !== "") {
				out[key] = descriptor[key];
			}
		});
		if (out.icon && !out.iconFile && !out.iconFile16 && !out.iconFile32) {
			var resolvedIcon = virtualIcon(out.icon);
			["iconify", "iconUrl", "iconSvg", "iconFile", "iconFile16", "iconFile32"].forEach(function (key) {
				if (resolvedIcon[key] !== undefined && resolvedIcon[key] !== null && String(resolvedIcon[key]) !== "") {
					out[key] = resolvedIcon[key];
				}
			});
		}
		out.traits = frontendArray(descriptor.traits);
		out.slots = descriptor.slots || {};
		out.targetKinds = descriptor.targetKinds || [];
		out.acceptedPositions = descriptor.acceptedPositions || [];
		var properties = descriptorPropertyContract(descriptor.properties);
		if (Object.keys(properties).length) {
			out.properties = properties;
		}
		if (target) {
			out.targetSlot = {
				id: target.id,
				label: target.label,
				accepts: target.accepts || [],
				sourceMutationPath: target.sourceMutationPath || "",
				sourcePath: target.sourcePath || "",
				position: target.position || "inside",
				mode: target.mode || "inside"
			};
			if (target.index !== undefined && target.index !== null) {
				out.targetSlot.index = target.index;
			}
		}
		if (descriptor.insert) {
			out.insert = cloneAuthoringInsert(descriptor.insert);
			if (target && target.sourcePath && out.insert.__frontendCreateSource) {
				out.insert.__frontendCreateSource.targetSourcePath = target.sourcePath;
			}
		}
		return out;
	}

	function indexedMutationPath(path) {
		path = String(path || "");
		var match = /^(.*)\[(\d+)\]$/.exec(path);
		return match ? { path: match[1], index: Number(match[2]) } : null;
	}

	function siblingInsertionAccepts(focus) {
		var traits = frontendArray(focus && focus.traits);
		if (traits.indexOf("ui.event") !== -1) {
			return ["ui.event"];
		}
		if (traits.indexOf("ui.action") !== -1) {
			return ["ui.action"];
		}
		if (traits.indexOf("ui.action.variable") !== -1) {
			return ["ui.action.variable"];
		}
		if (traits.indexOf("ui.table.column") !== -1) {
			return ["ui.table.column"];
		}
		if (traits.indexOf("ui.data.binding") !== -1) {
			return ["ui.data.binding"];
		}
		if (traits.indexOf("ui.directive.branch") !== -1) {
			return ["ui.directive.branch"];
		}
		if (traits.indexOf("ui.block") !== -1 || traits.indexOf("ui.directive") !== -1) {
			return ["ui.block", "ui.directive"];
		}
		return traits.length ? traits : ["ui.block", "ui.directive"];
	}

	function siblingInsertionTarget(focus, position, mode) {
		if (position !== "before" && position !== "after") {
			return null;
		}
		var indexed = indexedMutationPath(focus && focus.sourceMutationPath);
		if (!indexed) {
			return null;
		}
		return {
			id: "siblings",
			label: "Siblings",
			accepts: siblingInsertionAccepts(focus),
			sourceMutationPath: indexed.path,
			sourcePath: focus.sourcePath || "",
			sourceWritable: focus.sourceWritable,
			readOnlyReference: focus.readOnlyReference === true,
			position: position,
			mode: mode || "sibling",
			index: position === "before" ? indexed.index : indexed.index + 1
		};
	}

	function authoringPaletteTargets(focus, position, mode) {
		position = position || "inside";
		var siblingTarget = siblingInsertionTarget(focus, position, mode);
		if (siblingTarget) {
			return [siblingTarget];
		}
		var targets = [];
		var slots = focus && focus.slots || {};
		Object.keys(slots).forEach(function (key) {
			var slot = slots[key] || {};
			var accepts = frontendArray(slot.accepts);
			if (!accepts.length) {
				return;
			}
			var mutationPath = String(slot.sourceMutationPath || "");
			if (!mutationPath && String(position || "inside") === "inside") {
				mutationPath = focus.insertMutationPath || focus.sourceMutationPath || "";
			}
			targets.push({
				id: slot.id || key,
				label: slot.label || key,
				accepts: accepts,
				sourceMutationPath: mutationPath,
				sourcePath: slot.sourcePath || focus.sourcePath || "",
				sourceWritable: inheritedWritable(slot.sourceWritable, focus.sourceWritable),
				readOnlyReference: slot.readOnlyReference === true || focus.readOnlyReference === true,
				position: position,
				mode: mode || "inside"
			});
		});
		return targets;
	}

	function computeAuthoringPalette(request, tree, descriptors, focusInfo) {
		var position = String(request.position || "inside");
		var query = String(request.query || request.q || "");
		var focus = authoringNodeSummary(focusInfo.node);
		var filters = {
			targetKinds: 0,
			acceptedPositions: 0,
			readOnly: 0,
			mutationTarget: 0,
			query: 0,
			noMatchingTrait: 0,
			noWritableSource: 0,
			noMutationPath: 0,
			readOnlyReference: 0,
			queryFiltered: 0
		};
		var targets = authoringPaletteTargets(focus, position, "inside");
		var items = [];
		(descriptors || []).forEach(function (descriptor) {
			if (!descriptorPositionMatch(descriptor, position)) {
				filters.acceptedPositions++;
				return;
			}
			if (!targets.length) {
				if (!descriptorTargetMatch(descriptor, focus)) {
					filters.targetKinds++;
					return;
				}
				var legacyIssue = descriptorMutationTargetIssue(descriptor, focus, position, null);
				if (legacyIssue) {
					filters.mutationTarget++;
					if (filters[legacyIssue] !== undefined) {
						filters[legacyIssue]++;
					}
					return;
				}
				if (!descriptorMatchesQuery(descriptor, query)) {
					filters.query++;
					filters.queryFiltered++;
					return;
				}
				items.push(descriptorItem(descriptor, null));
				return;
			}
			var matchedTrait = false;
			var matchedMutation = false;
			var lastIssue = "";
			targets.forEach(function (target) {
				if (!descriptorSlotMatch(descriptor, focus, target)) {
					return;
				}
				matchedTrait = true;
				var issue = descriptorMutationTargetIssue(descriptor, focus, position, target);
				if (issue) {
					lastIssue = issue;
					return;
				}
				matchedMutation = true;
				if (!descriptorMatchesQuery(descriptor, query)) {
					return;
				}
				items.push(descriptorItem(descriptor, target));
			});
			if (!matchedTrait) {
				filters.noMatchingTrait++;
				filters.targetKinds++;
				return;
			}
			if (!descriptorMatchesQuery(descriptor, query)) {
				filters.query++;
				filters.queryFiltered++;
				return;
			}
			if (!matchedMutation) {
				filters.mutationTarget++;
				if (lastIssue && filters[lastIssue] !== undefined) {
					filters[lastIssue]++;
				}
			}
		});
		return {
			ok: true,
			target: "authoring.palette",
			surface: String(request.surface || "frontend"),
			builder: String(request.builder || ""),
			focus: focus,
			targets: targets,
			position: position,
			query: query,
			candidateCount: (descriptors || []).length,
			eligibleCount: items.length,
			filters: filters,
			items: items
		};
	}

	function authoringPaletteRequest(request, blocks) {
		request = request || {};
		var engine = authoringEngineDefinition(request);
		var tree = authoringEngineTree(Object.assign({}, request, { definition: engine }), blocks);
		var descriptors = authoringDescriptors(request, engine, blocks);
		var focusPath = String(request.focusPath || request.path || "");
		if (!focusPath) {
			var builderNode = findAuthoringBuilderNode(tree, authoringBuilderName(request, engine));
			focusPath = builderNode ? builderNode.path : "frontends";
		}
		var focusInfo = findTreeNode(tree, focusPath);
		if (!focusInfo) {
			return {
				ok: false,
				target: "authoring.palette",
				error: {
					code: "AUTHORING_FOCUS_NOT_FOUND",
					message: "No authoring tree node matches focusPath: " + focusPath
				},
				focusPath: focusPath,
				candidateCount: descriptors.length,
				eligibleCount: 0,
				filters: {
					targetKinds: 0,
					acceptedPositions: 0,
					readOnly: 0,
					mutationTarget: 0,
					query: 0
				},
				items: []
			};
		}
		var result = computeAuthoringPalette(request, tree, descriptors, focusInfo);
		if (result.eligibleCount === 0 && focusInfo.parent) {
			var cursor = focusInfo.parent;
			var fallbackResult = null;
			while (cursor) {
				var parentRequest = Object.assign({}, request, {
					focusPath: cursor.path
				});
				var parentResult = computeAuthoringPalette(parentRequest, tree, descriptors, {
					node: cursor,
					parent: null
				});
				if (parentResult.eligibleCount > 0) {
					fallbackResult = parentResult;
					break;
				}
				var parentInfo = findTreeNode(tree, cursor.path);
				cursor = parentInfo && parentInfo.parent;
			}
			var applyFallback = request.applyFallback !== false && fallbackResult && fallbackResult.eligibleCount > 0;
			result.fallback = {
				applied: applyFallback,
				from: result.focus,
				to: fallbackResult ? fallbackResult.focus : authoringNodeSummary(focusInfo.parent),
				available: !!fallbackResult,
				eligibleCount: fallbackResult ? fallbackResult.eligibleCount : 0,
				items: fallbackResult ? fallbackResult.items : [],
				reason: "No compatible candidate on focused node; using nearest parent insertion slot."
			};
			if (applyFallback) {
				fallbackResult.fallback = result.fallback;
				fallbackResult.fallback.applied = true;
				return fallbackResult;
			}
		}
		return result;
	}

	function authoringContractRequest(request, blocks) {
		request = request || {};
		var engine = authoringEngineDefinition(request);
		var descriptors = authoringDescriptors(request, engine, blocks);
		return {
			ok: true,
			target: "authoring.contract",
			surface: String(request.surface || "frontend"),
			builder: authoringBuilderName(request, engine),
			items: descriptors.map(function (descriptor) {
				var insert = descriptor.insert || {};
				return {
					id: String(descriptor.id || ""),
					tag: String(descriptor.tag || insert.tag || ""),
					label: String(descriptor.label || descriptor.name || descriptor.localName || ""),
					category: String(descriptor.category || ""),
					properties: descriptorPropertyContract(descriptor.properties),
					slots: descriptor.slots || {}
				};
			})
		};
	}

	function authoringMutateRequest(request, blocks) {
		request = request || {};
		var mutations = request.mutations || (request.mutation ? [request.mutation] : []);
		var engineMutations = mutations.filter(function (mutation) {
			return !!engineMutationSpec(mutation);
		});
		if (engineMutations.length > 0) {
			if (engineMutations.length !== mutations.length) {
				raise("MIXED_AUTHORING_MUTATIONS", "Engine config mutations cannot be batched with source mutations.");
			}
			return applyEngineMutationRequest(request, blocks, engineMutations);
		}
		return applyMutationRequest(request, blocks);
	}

	function intOption(value, fallback, min, max) {
		var number = Number(value);
		if (isNaN(number)) {
			number = fallback;
		}
		number = Math.floor(number);
		if (min !== undefined && number < min) {
			number = min;
		}
		if (max !== undefined && number > max) {
			number = max;
		}
		return number;
	}

	function searchKinds(request) {
		var kinds = request.kinds;
		if (!kinds) {
			return { sample: true, flow: true, node: true, block: true, type: true, schema: true };
		}
		if (typeof kinds === "string") {
			kinds = String(kinds).split(",");
		}
		var out = {};
		(kinds || []).forEach(function (kind) {
			out[String(kind).trim()] = true;
		});
		return out;
	}

	function isSampleFlowName(flowName) {
		return String(flowName || "").indexOf("sample_") === 0;
	}

	function collectFlowBlockUses(definition, blocks) {
		var uses = [];
		function add(name) {
			name = String(name || "");
			if (name && uses.indexOf(name) === -1) {
				uses.push(name);
			}
		}
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = blockName(node);
				add(name);
				activeSlots(node, blockCatalog(blocks && blocks[name])).forEach(function (slot) {
					walk(slot.nodes || []);
				});
			});
		}
		walk(definition && definition.nodes || []);
		uses.sort();
		return uses;
	}

	function searchNeedle(request) {
		return String(request.query || request.q || "").trim().toLowerCase();
	}

	function searchTokens(needle) {
		var tokens = [];
		String(needle || "").toLowerCase().split(/[^a-z0-9_]+/).forEach(function (part) {
			if (part) {
				tokens.push(part);
			}
		});
		return tokens;
	}

	function searchMatches(text, needle) {
		if (!needle) {
			return true;
		}
		var haystack = String(text || "").toLowerCase();
		if (haystack.indexOf(needle) !== -1) {
			return true;
		}
		var tokens = searchTokens(needle);
		if (!tokens.length) {
			return true;
		}
		return tokens.every(function (token) {
			return haystack.indexOf(token) !== -1;
		});
	}

	function searchSnippet(text, needle) {
		text = String(text || "").replace(/\s+/g, " ").trim();
		if (!text) {
			return "";
		}
		var max = 180;
		var lower = text.toLowerCase();
		var index = needle ? lower.indexOf(needle) : -1;
		var matchLength = String(needle || "").length;
		if (index < 0 && needle) {
			searchTokens(needle).some(function (token) {
				index = lower.indexOf(token);
				if (index >= 0) {
					matchLength = token.length;
					return true;
				}
				return false;
			});
		}
		if (index < 0) {
			return summaryText(text, max);
		}
		var start = Math.max(0, index - 60);
		var end = Math.min(text.length, index + matchLength + 80);
		return (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
	}

	function pointerEscape(part) {
		return String(part).replace(/~/g, "~0").replace(/\//g, "~1");
	}

	function pointerPath(parts) {
		return "/" + (parts || []).map(pointerEscape).join("/");
	}

	function flowQNameForSearch(request, flowName) {
		var project = currentProjectName(request);
		return project ? project + "." + flowName : String(flowName || "");
	}

	function searchTokenScore(text, needle) {
		if (!needle) {
			return 1;
		}
		var haystack = String(text || "").toLowerCase();
		if (haystack.indexOf(needle) !== -1) {
			return 100;
		}
		var tokens = searchTokens(needle);
		var score = 0;
		tokens.forEach(function (token) {
			if (haystack.indexOf(token) !== -1) {
				score += 10;
			}
		});
		return score;
	}

		function shallowNodeDefinition(node) {
			var shallow = {};
			Object.keys(node || {}).forEach(function (key) {
				if (key.indexOf("__") !== 0 && ["nodes", "do", "then", "else", "catch", "finally"].indexOf(key) === -1) {
					shallow[key] = node[key];
				}
		});
		return shallow;
	}

	function searchNodeContext(nodes, index, node, parentSummary, blocks, contextCount) {
		if (contextCount <= 0) {
			return undefined;
		}
		var context = {
			parent: parentSummary || "",
			previous: [],
			children: [],
			next: []
		};
		for (var previous = Math.max(0, index - contextCount); previous < index; previous++) {
			context.previous.push(searchNodeSummary(nodes[previous], blocks));
		}
		var slots = activeSlots(node, blockCatalog(blocks[blockName(node)]));
		slots.forEach(function (slot) {
			(slot.nodes || []).slice(0, contextCount).forEach(function (child) {
				context.children.push(searchNodeSummary(child, blocks));
			});
		});
		for (var next = index + 1; next < Math.min(nodes.length, index + 1 + contextCount); next++) {
			context.next.push(searchNodeSummary(nodes[next], blocks));
		}
		return context;
	}

	function searchNodeSummary(node, blocks) {
		node = node || {};
		var name = blockName(node);
		var block = blocks && blocks[name];
		var catalog = blockCatalog(block);
		return nodeSummary(block, catalog, node, nodePath(node), name || "unknown");
	}

	function searchFlowNodes(request, blocks, flowName, definition, matches) {
		var needle = searchNeedle(request);
		var contextCount = intOption(request.context || request.around, 0, 0, 5);
		var includeDefinition = request.includeDefinition === true;
		var flowQName = flowQNameForSearch(request, flowName);

		function walk(nodes, parts, parentSummary) {
			nodes = nodes || [];
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i] || {};
				var name = blockName(node);
				var block = blocks && blocks[name];
				var catalog = blockCatalog(block);
				var id = nodePath(node);
				var path = pointerPath(parts.concat([String(i)]));
				var summary = nodeSummary(block, catalog, node, id, name || "unknown");
				var shallow = shallowNodeDefinition(node);
				var text = [flowName, flowQName, id, name, summary, JSON.stringify(normalizeTree(shallow))].join(" ");
				if (searchMatches(text, needle)) {
					var match = {
						kind: "node",
						project: currentProjectName(request),
						flow: flowName,
						flowQName: flowQName,
						nodeId: id,
						path: path,
						block: name,
						summary: summary,
						snippet: searchSnippet(text, needle),
						next: "flow-context name=" + flowName + " node=" + id
					};
					var context = searchNodeContext(nodes, i, node, parentSummary, blocks, contextCount);
					if (context) {
						match.context = context;
					}
					if (includeDefinition) {
						match.definition = normalizeTree(node);
					}
					matches.push(match);
				}
				activeSlots(node, catalog).forEach(function (slot) {
					walk(slot.nodes || [], parts.concat([String(i), slot.name]), summary);
				});
			}
		}

		walk(definition.nodes || [], ["nodes"], "");
	}

	function searchCatalogEntries(request, blocks, matches) {
		var needle = searchNeedle(request);
		var kinds = searchKinds(request);
		var catalog = catalogDefinition(blocks);
		if (kinds.block) {
			(catalog.blocks || []).forEach(function (block) {
				var text = JSON.stringify(block);
				if (!searchMatches(text, needle)) {
					return;
				}
				matches.push({
					kind: "block",
					name: block.blockId || block.name,
					label: block.name,
					provider: block.provider,
					origin: block.origin,
					namespace: block.namespace,
					summary: "[" + (block.namespace ? block.namespace + "." : "") + block.name + "] " + summaryText(block.description || ""),
					snippet: searchSnippet(text, needle),
					next: "flow-block-get name=" + (block.blockId || block.name)
				});
			});
		}
		if (kinds.type) {
			(catalog.types || []).forEach(function (type) {
				var text = JSON.stringify(type);
				if (!searchMatches(text, needle)) {
					return;
				}
				matches.push({
					kind: "type",
					name: type.name,
					origin: type.origin,
					summary: "[" + type.name + "] " + summaryText(type.description || ""),
					snippet: searchSnippet(text, needle),
					next: "flow-type-get name=" + type.name
				});
			});
		}
	}

	function searchSchemaFiles(request, matches) {
		var kinds = searchKinds(request);
		if (!kinds.schema) {
			return;
		}
		var dir = projectSchemasDir();
		if (!dir || !dir.isDirectory()) {
			return;
		}
		var needle = searchNeedle(request);
		function walk(file) {
			var files = file.listFiles();
			if (!files) {
				return;
			}
			Arrays.asList(files).toArray().forEach(function (child) {
				if (child.isDirectory()) {
					walk(child);
					return;
				}
				if (!String(child.getName()).endsWith(".schema.json")) {
					return;
				}
				var text = String(FileUtils.readFileToString(child, "UTF-8"));
				if (!searchMatches(text, needle)) {
					return;
				}
				matches.push({
					kind: "schema",
					file: String(child.getAbsolutePath()),
					summary: "[schema] " + String(child.getName()),
					snippet: searchSnippet(text, needle)
				});
			});
		}
		walk(dir);
	}

	function searchFlowRequest(request, blocks) {
		request = request || {};
		var budgetFlows = request.name ? [{ name: String(request.name), source: sourceForFlowRequest(request) }] :
			visibleSearchFlows(request);
		var budgetSignature = {
			service: "flow.search",
			project: currentProjectName(request),
			revision: env.sha256Hex(JSON.stringify({
				flows: budgetFlows.map(function (flow) { return [flow.project || "", flow.name, flow.source]; }),
				blocks: Object.keys(blocks || {}).sort()
			})),
			query: String(request.query || request.q || ""),
			kinds: request.kinds || null,
			context: request.context || request.around || 0,
			includeDefinition: request.includeDefinition === true,
			includeLibrarySamples: request.includeLibrarySamples === true
		};
		var budget = env.responseBudget(request, { key: env.sha256Hex(JSON.stringify(budgetSignature)) });
		if (budget.enabled || String(request.cursor || "").indexOf("rb1.") === 0) {
			return budgetedSearchFlowRequest(request, blocks, budget, budgetFlows);
		}
		var needle = searchNeedle(request);
		var kinds = searchKinds(request);
		var matches = [];
		var includeSampleMatches = kinds.sample || request.includeLibrarySamples === true;
		var flows = request.name ? [{ name: String(request.name), source: sourceForFlowRequest(request) }] :
			visibleSearchFlows(request);
		flows.forEach(function (flow) {
			var flowProject = flow.project || currentProjectName(request);
			var flowQName = flowQNameForSearch(request, flow.name);
			if (flowProject && flowProject !== currentProjectName(request)) {
				flowQName = flowQNameForSearch(Object.assign({}, request, { project: flowProject }), flow.name);
			}
			var definition = expandFlowDefinition(blocks, parseSource(flow.source));
			var sample = isSampleFlowName(flow.name);
			var uses = sample ? collectFlowBlockUses(definition, blocks) : [];
			var flowText = [flow.name, flowQName, flow.source, uses.join(" "), sample ? "sample example tutorial usage pattern" : ""].join(" ");
			if (sample && includeSampleMatches) {
				var sampleScore = searchTokenScore(flowText, needle);
				if (sampleScore <= 0) {
					return;
				}
				matches.push({
					kind: "sample",
					score: 90 + sampleScore,
					project: flowProject || currentProjectName(request),
					flow: flow.name,
					flowQName: flowQName,
					file: flow.file || "",
					uses: uses,
					summary: "[sample] " + flowQName + (uses.length ? " uses " + uses.join(", ") : ""),
					snippet: searchSnippet(flow.source, needle),
					next: "flow-tree project=" + (flowProject || currentProjectName(request)) + " name=" + flow.name +
						", flow-test project=" + (flowProject || currentProjectName(request)) + " name=" + flow.name +
						", then copy the pattern into a new Flow"
				});
			}
			if (kinds.flow && !sample && searchMatches(flowText, needle)) {
				matches.push({
					kind: "flow",
					score: 50,
					project: flowProject || currentProjectName(request),
					flow: flow.name,
					flowQName: flowQName,
					file: flow.file || "",
					summary: "[flow] " + flowQName,
					snippet: searchSnippet(flow.source, needle),
					next: "flow-tree name=" + flow.name
				});
			}
			if (kinds.node) {
				searchFlowNodes(request, blocks, flow.name, definition, matches);
			}
		});
		searchCatalogEntries(request, blocks, matches);
		searchSchemaFiles(request, matches);
		matches.sort(function (a, b) {
			var scoreDiff = Number(b.score || 0) - Number(a.score || 0);
			if (scoreDiff !== 0) {
				return scoreDiff;
			}
			return String(a.summary || a.name || "").localeCompare(String(b.summary || b.name || ""));
		});

		var offset = intOption(request.cursor, 0, 0);
		var limit = intOption(request.limit, 50, 1, 500);
		var page = matches.slice(offset, offset + limit);
		var out = {
			ok: true,
			query: String(request.query || request.q || ""),
			scope: String(request.scope || "project"),
			project: currentProjectName(request),
			count: page.length,
			total: matches.length,
			matches: page,
			nextCursor: offset + limit < matches.length ? String(offset + limit) : null
		};
		if (request.doc !== false) {
			out.doc = "Search Flow sidecars, nodes, catalog entries and learned schemas. Use flow-tree on a match for detailed inspection, then flow-edit with nodeId/path for mutations.";
		}
		if (request.hints !== false) {
			out.hints = [
				"If you understood, call with hints=false.",
				"Use kinds=['node'] to search executable Flow nodes only.",
				"Use context=1 or 2 to get nearby parent/previous/children/next summaries.",
				"Pass doc=false on repeated calls when the short tool contract is already known."
			];
		}
		return out;
	}

	function budgetedSearchFlowRequest(request, blocks, budget, flows) {
		var needle = searchNeedle(request);
		var kinds = searchKinds(request);
		var includeSampleMatches = kinds.sample || request.includeLibrarySamples === true;
		flows = flows || [];
		var definitions = {};
		var phases = [];
		if (includeSampleMatches) phases.push("sample");
		if (kinds.flow) phases.push("flow");
		if (kinds.node) phases.push("node");
		if (kinds.block) phases.push("block");
		if (kinds.type) phases.push("type");
		if (kinds.schema) phases.push("schema");
		var catalogMatches = {};
		var schemaMatches = null;

		function definitionFor(flow, index) {
			if (!definitions[index]) {
				definitions[index] = expandFlowDefinition(blocks, parseSource(flow.source));
			}
			return definitions[index];
		}

		function flowMatch(phase, flow, index) {
			var found = [];
			var sample = isSampleFlowName(flow.name);
			if (phase === "node") {
				searchFlowNodes(request, blocks, flow.name, definitionFor(flow, index), found);
				return found;
			}
			var flowProject = flow.project || currentProjectName(request);
			var flowQName = flowQNameForSearch(request, flow.name);
			if (flowProject && flowProject !== currentProjectName(request)) {
				flowQName = flowQNameForSearch(Object.assign({}, request, { project: flowProject }), flow.name);
			}
			var uses = sample ? collectFlowBlockUses(definitionFor(flow, index), blocks) : [];
			var flowText = [flow.name, flowQName, flow.source, uses.join(" "), sample ? "sample example tutorial usage pattern" : ""].join(" ");
			if (phase === "sample" && sample) {
				var score = searchTokenScore(flowText, needle);
				if (score > 0) {
					found.push({
						kind: "sample", score: 90 + score, project: flowProject || currentProjectName(request),
						flow: flow.name, flowQName: flowQName, file: flow.file || "", uses: uses,
						summary: "[sample] " + flowQName + (uses.length ? " uses " + uses.join(", ") : ""),
						snippet: searchSnippet(flow.source, needle),
						next: "flow-tree project=" + (flowProject || currentProjectName(request)) + " name=" + flow.name +
							", flow-test project=" + (flowProject || currentProjectName(request)) + " name=" + flow.name +
							", then copy the pattern into a new Flow"
					});
				}
			} else if (phase === "flow" && !sample && searchMatches(flowText, needle)) {
				found.push({
					kind: "flow", score: 50, project: flowProject || currentProjectName(request), flow: flow.name,
					flowQName: flowQName, file: flow.file || "", summary: "[flow] " + flowQName,
					snippet: searchSnippet(flow.source, needle), next: "flow-tree name=" + flow.name
				});
			}
			return found;
		}

		function matchesFor(phase, unit) {
			if (phase === "sample" || phase === "flow" || phase === "node") {
				return flowMatch(phase, flows[unit], unit);
			}
			if (phase === "block" || phase === "type") {
				if (!catalogMatches[phase]) {
					catalogMatches[phase] = [];
					searchCatalogEntries(Object.assign({}, request, { kinds: [phase] }), blocks, catalogMatches[phase]);
				}
				return catalogMatches[phase];
			}
			if (!schemaMatches) {
				schemaMatches = [];
				searchSchemaFiles(Object.assign({}, request, { kinds: ["schema"] }), schemaMatches);
			}
			return schemaMatches;
		}

		function unitCount(phase) {
			return phase === "sample" || phase === "flow" || phase === "node" ? flows.length : 1;
		}

		var state = budget.cursor({ phase: 0, unit: 0, item: 0 });
		var phaseIndex = intOption(state.phase, 0, 0);
		var unitIndex = intOption(state.unit, 0, 0);
		var itemIndex = intOption(state.item, 0, 0);
		var limit = intOption(request.limit, 50, 1, 500);
		var page = [];
		var workCount = 0;
		for (; phaseIndex < phases.length; phaseIndex++, unitIndex = 0, itemIndex = 0) {
			var phase = phases[phaseIndex];
			for (; unitIndex < unitCount(phase); unitIndex++, itemIndex = 0) {
				var resumeState = { phase: phaseIndex, unit: unitIndex, item: itemIndex };
				if (!budget.shouldContinue(page.length, resumeState, workCount)) {
					return finishBudgetedSearch(request, budget, page, true, resumeState);
				}
				var unitMatches = matchesFor(phase, unitIndex);
				unitMatches.sort(function (a, b) {
					var scoreDiff = Number(b.score || 0) - Number(a.score || 0);
					return scoreDiff || String(a.summary || a.name || "").localeCompare(String(b.summary || b.name || ""));
				});
				workCount += 1;
				for (; itemIndex < unitMatches.length; itemIndex++) {
					resumeState = { phase: phaseIndex, unit: unitIndex, item: itemIndex };
					if (!budget.shouldContinue(page.length, resumeState, workCount) ||
							!budget.tryAdd(page, unitMatches[itemIndex], resumeState)) {
						return finishBudgetedSearch(request, budget, page, true, resumeState);
					}
					if (page.length >= limit) {
						return finishBudgetedSearch(request, budget, page, true,
							{ phase: phaseIndex, unit: unitIndex, item: itemIndex + 1 });
					}
				}
			}
		}
		return finishBudgetedSearch(request, budget, page, false, null);
	}

	function finishBudgetedSearch(request, budget, page, hasMore, nextState) {
		var out = budget.finish({
			ok: true,
			query: String(request.query || request.q || ""),
			scope: String(request.scope || "project"),
			project: currentProjectName(request),
			count: page.length,
			total: null,
			matches: page,
			nextCursor: null
		}, hasMore, nextState);
		if (request.doc !== false) {
			out.doc = "Search Flow sidecars, nodes, catalog entries and learned schemas. Continue partial results with nextCursor.";
		}
		if (request.hints !== false) {
			out.hints = ["Use focused kinds and query terms. Continue with nextCursor only when the first results are insufficient."];
		}
		return out;
	}

	function toYamlSource(value) {
		var json = JSON.stringify(normalizeTree(value || {}));
		var root = jsonMapper.readTree(json);
		return String(yamlMapper.writeValueAsString(root)).replace(/^---\s*\r?\n/, "");
	}

	function parseMutationPath(path) {
		if (Object.prototype.toString.call(path) === "[object Array]") {
			return path.map(function (part) { return String(part); });
		}
		var text = String(path === undefined || path === null ? "" : path);
		if (text === "") {
			return [];
		}
		if (text.charAt(0) === "/") {
			if (text === "/") {
				return [""];
			}
			return text.substring(1).split("/").map(function (part) {
				return part.replace(/~1/g, "/").replace(/~0/g, "~");
			});
		}
		var parts = [];
		text.replace(/([^\.\[\]]+)|\[(\d+)\]/g, function (_, name, index) {
			parts.push(name !== undefined ? name : String(index));
			return "";
		});
		return parts;
	}

	function asArrayIndex(container, key, allowEnd) {
		if (allowEnd && key === "-") {
			return container.length;
		}
		var index = Number(key);
		if (String(index) !== String(key) || index < 0 || Math.floor(index) !== index) {
			raise("INVALID_MUTATION_PATH", "Expected array index, got: " + key);
		}
		return index;
	}

	function containerAt(root, parts, create) {
		var current = root;
		for (var i = 0; i < parts.length - 1; i++) {
			var key = parts[i];
			if (Object.prototype.toString.call(current) === "[object Array]") {
				current = current[asArrayIndex(current, key, false)];
			} else {
				if ((current[key] === undefined || current[key] === null) && create) {
					var next = parts[i + 1];
					current[key] = String(Number(next)) === String(next) ? [] : {};
				}
				current = current[key];
			}
			if (current === undefined || current === null) {
				raise("INVALID_MUTATION_PATH", "Mutation path does not exist: " + parts.join("/"));
			}
		}
		return current;
	}

	function valueAt(root, parts) {
		var current = root;
		for (var i = 0; i < parts.length; i++) {
			if (current === undefined || current === null) {
				return undefined;
			}
			if (Object.prototype.toString.call(current) === "[object Array]") {
				current = current[asArrayIndex(current, parts[i], false)];
			} else {
				current = current[parts[i]];
			}
		}
		return current;
	}

	function arrayAt(root, parts, create) {
		var array = valueAt(root, parts);
		if (array === undefined && create && parts.length > 0) {
			var parent = containerAt(root, parts, true);
			var key = parts[parts.length - 1];
			parent[key] = [];
			array = parent[key];
		}
		return array;
	}

	function cloneMutationValue(value) {
		return normalizeTree(value);
	}

	function childSlotNamesForMutation(blocks, node) {
		var names = {};
		var block = blocks && blocks[blockName(node)];
		slotDefinitions(blockCatalog(block)).forEach(function (definition) {
			names[String(definition.name)] = true;
			(definition.aliases || []).forEach(function (alias) {
				names[String(alias)] = true;
			});
		});
		return Object.keys(names);
	}

	function collectNodeLocations(root, blocks, wantedId) {
		var matches = [];
		var wanted = String(wantedId || "");
		function walk(nodes, arrayParts) {
			if (Object.prototype.toString.call(nodes) !== "[object Array]") {
				return;
			}
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i] || {};
				var nodeParts = arrayParts.concat([String(i)]);
				if (nodePath(node) === wanted) {
					matches.push({
						node: node,
						parts: nodeParts,
						arrayParts: arrayParts,
						index: i
					});
				}
				childSlotNamesForMutation(blocks, node).forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") {
						walk(node[slot], nodeParts.concat([slot]));
					}
				});
			}
		}
		walk(root.nodes || [], ["nodes"]);
		return matches;
	}

	function locateSingleNode(root, blocks, nodeId, role) {
		var id = String(nodeId || "");
		if (!id) {
			raise("MISSING_NODE_ID", "Mutation requires " + role + ".");
		}
		var matches = collectNodeLocations(root, blocks, id);
		if (matches.length === 0) {
			raise("UNKNOWN_NODE_ID", "No Flow node found for " + role + ": " + id);
		}
		if (matches.length > 1) {
			raise("AMBIGUOUS_NODE_ID", "More than one Flow node matches " + role + ": " + id);
		}
		return matches[0];
	}

	function mutationNodeId(mutation) {
		return mutation.nodeId || mutation.node || "";
	}

	function mutationPropertyName(mutation) {
		return mutation.property || mutation.prop || mutation.field || "";
	}

	function resolveMutationValueParts(root, mutation, blocks) {
		if (mutation.path !== undefined && mutation.path !== null) {
			return parseMutationPath(mutation.path);
		}
		var nodeId = mutationNodeId(mutation);
		if (nodeId) {
			var location = locateSingleNode(root, blocks, nodeId, "nodeId");
			var property = mutationPropertyName(mutation);
			return property ? location.parts.concat([String(property)]) : location.parts;
		}
		return [];
	}

	function resolveMutationArrayParts(root, mutation, blocks) {
		if (mutation.beforeNodeId || mutation.before) {
			var before = locateSingleNode(root, blocks, mutation.beforeNodeId || mutation.before, "beforeNodeId");
			if (mutation.index === undefined || mutation.index === null) {
				mutation.index = String(before.index);
			}
			return before.arrayParts;
		}
		if (mutation.afterNodeId || mutation.after) {
			var after = locateSingleNode(root, blocks, mutation.afterNodeId || mutation.after, "afterNodeId");
			if (mutation.index === undefined || mutation.index === null) {
				mutation.index = String(after.index + 1);
			}
			return after.arrayParts;
		}
		if (mutation.parentNodeId || mutation.parentNode) {
			var parent = locateSingleNode(root, blocks, mutation.parentNodeId || mutation.parentNode, "parentNodeId");
			var slot = String(mutation.slot || "nodes");
			if (parent.node[slot] === undefined || parent.node[slot] === null) {
				parent.node[slot] = [];
			}
			if (Object.prototype.toString.call(parent.node[slot]) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Node slot is not an array: " + slot);
			}
			return parent.parts.concat([slot]);
		}
		if (mutation.path !== undefined && mutation.path !== null) {
			return parseMutationPath(mutation.path);
		}
		return ["nodes"];
	}

	function mergeObjects(target, patch) {
		if (!patch || typeof patch !== "object" || Object.prototype.toString.call(patch) === "[object Array]") {
			return cloneMutationValue(patch);
		}
		if (!target || typeof target !== "object" || Object.prototype.toString.call(target) === "[object Array]") {
			target = {};
		}
		Object.keys(patch).forEach(function (key) {
			var value = patch[key];
			if (value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]") {
				target[key] = mergeObjects(target[key], value);
			} else {
				target[key] = cloneMutationValue(value);
			}
		});
		return target;
	}

	function applyOneMutation(root, mutation, blocks) {
		mutation = mutation || {};
		var op = String(mutation.op || "replace");
		if (op === "set") {
			op = "replace";
		}
		if (op === "remove") {
			op = "delete";
		}
		if (op === "batch") {
			(mutation.mutations || []).forEach(function (child) {
				applyOneMutation(root, child, blocks);
			});
			return;
		}
		if (op === "setEnabled") {
			var enabledParts = resolveMutationValueParts(root, mutation, blocks);
			var enabledNode = valueAt(root, enabledParts);
			if (!enabledNode || typeof enabledNode !== "object" || Object.prototype.toString.call(enabledNode) === "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "setEnabled must target one Flow node.");
			}
			if (mutation.enabled === false) {
				enabledNode.disabled = true;
			} else {
				delete enabledNode.disabled;
			}
			return;
		}

		var parts = (op === "insert" || op === "append" || op === "move" || op === "copy")
			? resolveMutationArrayParts(root, mutation, blocks)
			: resolveMutationValueParts(root, mutation, blocks);
		if (op === "move" || op === "copy") {
			var fromPath = mutation.from || mutation.source;
			if (!fromPath && (mutation.fromNodeId || mutation.sourceNodeId || mutationNodeId(mutation))) {
				fromPath = pointerPath(locateSingleNode(root, blocks,
					mutation.fromNodeId || mutation.sourceNodeId || mutationNodeId(mutation), "fromNodeId").parts);
			}
			if (!fromPath) {
				raise("INVALID_MUTATION_PATH", "Move/copy mutation requires a source path.");
			}
			var moved = cloneMutationValue(valueAt(root, parseMutationPath(fromPath)));
			if (op === "copy") {
				var patch = mutation.patch || mutation.properties || mutation.props;
				if (patch !== undefined && patch !== null) {
					moved = mergeObjects(moved, patch);
				}
				if (mutation.newId || mutation.newNodeId) {
					moved.id = String(mutation.newId || mutation.newNodeId);
				}
			}
			if (op === "move") {
				applyOneMutation(root, { op: "delete", path: fromPath }, blocks);
			}
			var moveArray = valueAt(root, parts);
			if (Object.prototype.toString.call(moveArray) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Move target is not an array: " + pointerPath(parts));
			}
			var moveIndex = mutation.index === undefined || mutation.index === null || mutation.index === "end"
				? moveArray.length : asArrayIndex(moveArray, String(mutation.index), true);
			moveArray.splice(moveIndex, 0, moved);
			return;
		}
		if (op === "append") {
			var array = arrayAt(root, parts, true);
			if (Object.prototype.toString.call(array) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Append target is not an array: " + pointerPath(parts));
			}
			array.push(cloneMutationValue(mutation.value));
			return;
		}
		if (op === "insert") {
			var targetArray = arrayAt(root, parts, true);
			if (Object.prototype.toString.call(targetArray) !== "[object Array]") {
				raise("INVALID_MUTATION_TARGET", "Insert target is not an array: " + pointerPath(parts));
			}
			var index = mutation.index === undefined || mutation.index === null || mutation.index === "end"
				? targetArray.length : asArrayIndex(targetArray, String(mutation.index), true);
			targetArray.splice(index, 0, cloneMutationValue(mutation.value));
			return;
		}
		if (parts.length === 0) {
			if (op !== "replace" && op !== "merge") {
				raise("INVALID_MUTATION_PATH", "Only replace or merge can target the root.");
			}
			var replacement = op === "merge" ? mergeObjects(root, mutation.value) : cloneMutationValue(mutation.value);
			Object.keys(root).forEach(function (key) {
				delete root[key];
			});
			Object.keys(replacement || {}).forEach(function (key) {
				root[key] = replacement[key];
			});
			return;
		}

		var parent = containerAt(root, parts, op === "replace" || op === "merge");
		var key = parts[parts.length - 1];
		if (Object.prototype.toString.call(parent) === "[object Array]") {
			var arrayIndex = asArrayIndex(parent, key, false);
			if (op === "delete") {
				parent.splice(arrayIndex, 1);
			} else if (op === "merge") {
				parent[arrayIndex] = mergeObjects(parent[arrayIndex], mutation.value);
			} else if (op === "replace") {
				parent[arrayIndex] = cloneMutationValue(mutation.value);
			} else {
				raise("UNKNOWN_MUTATION_OP", "Unknown Flow mutation operation: " + op);
			}
			return;
		}
		if (op === "delete") {
			delete parent[key];
		} else if (op === "merge") {
			parent[key] = mergeObjects(parent[key], mutation.value);
		} else if (op === "replace") {
			parent[key] = cloneMutationValue(mutation.value);
		} else {
			raise("UNKNOWN_MUTATION_OP", "Unknown Flow mutation operation: " + op);
		}
	}

	function applyMutationRequest(request, blocks) {
		request = request || {};
		var target = String(request.target || "flow");
		var definition = target === "engine"
			? parseYamlSource(request.engineSource, "version: 1\n")
			: request.definition !== undefined && request.definition !== null
				? canonicalFlowDefinition(normalizeTree(request.definition))
				: parseSource(sourceForFlowRequest(request, blocks));
		var mutations = request.mutations || (request.mutation ? [request.mutation] : []);
		if (mutations.length === 0) {
			raise("MISSING_MUTATION", "Flow mutation request requires mutation or mutations.");
		}
		mutations.forEach(function (mutation) {
			applyOneMutation(definition, mutation, blocks);
		});
		if (definition.version === undefined || definition.version === null) {
			definition.version = 1;
		}
		var yamlSource = toYamlSource(definition);
		var source = target === "flow" && renderFlowScript
			? renderFlowScript(blocks, String(request.name || request.flowName || "Flow"), yamlSource, { includeHeader: false })
			: yamlSource;
		var tree = describeTreeRequest({
			target: target,
			flowSource: source,
			engineSource: source,
			flowQName: request.flowQName || "",
			flowName: request.flowName || request.name || "",
			name: request.name || request.flowName || "",
			engineQName: request.engineQName || definition.engineQName || "",
			sourceFile: request.sourceFile || request.sourcePath || ""
		}, blocks);
		var out = {
			ok: true,
			target: target,
			source: source,
			children: tree.children
		};
		if (target === "flow") {
			out.analysis = analyzeFlowSource(blocks, source);
		}
		return out;
	}

	function engineMutationSpec(mutation) {
		var value = mutation && mutation.value || {};
		var path = value.__engineMutationPath || mutation && mutation.__engineMutationPath;
		if (!path) {
			return null;
		}
		var payload = {};
		Object.keys(value || {}).forEach(function (key) {
			if (String(key).indexOf("__") !== 0) {
				payload[key] = value[key];
			}
		});
		return {
			op: String(value.__engineMutationOp || mutation.__engineMutationOp || mutation.op || "merge"),
			path: String(path),
			value: payload
		};
	}

	function applyEngineMutationRequest(request, blocks, mutations) {
		var base = projectDir && projectDir();
		if (!base) {
			raise("PROJECT_RESOURCES_UNAVAILABLE", "Project Flow resources are unavailable.",
				null, "Run through a Flow requestable or set __flowProjectDir in standalone tests.");
		}
		var file = new File(base, "libs/flow/engine.yaml");
		var fallback = "version: 1\nengineQName: lib_flow_engine.Engine\nbindings: {}\nconfig: {}\n";
		var oldSource = file.isFile()
			? String(FileUtils.readFileToString(file, "UTF-8"))
			: fallback;
		var definition = parseYamlSource(oldSource, fallback);
		mutations.forEach(function (mutation) {
			var spec = engineMutationSpec(mutation);
			if (!spec) {
				raise("UNSUPPORTED_AUTHORING_MUTATION", "Engine authoring mutations require a palette payload with __engineMutationPath.");
			}
			applyOneMutation(definition, spec, blocks);
		});
		if (definition.version === undefined || definition.version === null) {
			definition.version = 1;
		}
		if (!definition.engineQName) {
			definition.engineQName = "lib_flow_engine.Engine";
		}
		var source = toYamlSource(definition);
		if (request.dryRun !== true && request.write !== false && request.persist !== false) {
			FileUtils.forceMkdir(file.getParentFile());
			FileUtils.writeStringToFile(file, source, "UTF-8");
		}
		var tree = authoringTreeRequest({
			surface: request.surface || "frontend",
			builder: request.builder || "svelte",
			engineSource: source,
			sourceFile: String(file.getAbsolutePath()),
			detail: request.detail || "compact",
			maxDepth: request.maxDepth || 4
		}, blocks);
		return {
			ok: true,
			target: "engine",
			path: "libs/flow/engine.yaml",
			sourceFile: String(file.getAbsolutePath()),
			source: source,
			oldHash: env.sha256Hex ? env.sha256Hex(oldSource) : "",
			newHash: env.sha256Hex ? env.sha256Hex(source) : "",
			changed: oldSource !== source,
			written: request.dryRun === true || request.write === false || request.persist === false ? false : oldSource !== source,
			children: tree.children || []
		};
	}

	function fullSchemaDetail(request) {
		var detail = String(request && (request.detail || request.mode) || "").toLowerCase();
		return detail === "full" || request && (request.includeSources === true || request.includeDetails === true);
	}

	function schemaDetails(schema) {
		var normalized = objectSchema(schema || {});
		var available = !!schema && schemaScore(normalized) > 0;
		var out = {
			available: available,
			score: schemaScore(normalized),
			schema: normalized
		};
		if (schemaSummary) {
			out.summary = schemaSummary(schema || {});
		}
		return out;
	}

		function schemaQuality(schema) {
			return schemaScore(objectSchema(schema || {}));
		}

		function schemaChoiceScore(schema) {
			var normalized = objectSchema(schema || {});
			if (!schema || schemaQuality(normalized) === 0) {
				return 0;
			}
			return schemaScore(normalized) * 2 - unknownSchemaPaths(normalized, 100000).length * 3;
		}

	function pathRemainder(path, base) {
		if (path === base) {
			return "";
		}
		var next = String(path).charAt(String(base).length);
		return next === "." ? String(path).substring(String(base).length + 1) : String(path).substring(String(base).length);
	}

	function schemaForAnalysisPath(analysis, path) {
		path = String(path || "");
		if (!path) {
			return null;
		}
		var schemas = analysis && analysis.schemas || {};
		var best = "";
		Object.keys(schemas).forEach(function (base) {
			if (path === base || path.indexOf(base + ".") === 0 || path.indexOf(base + "[") === 0) {
				if (base.length > best.length) {
					best = base;
				}
			}
		});
		return best ? schemaAtPath(schemas[best], pathRemainder(path, best)) : null;
	}

	function missingSchemaPaths(base, richer, limit) {
		limit = limit || 12;
		var out = [];
		var normalizedBase = objectSchema(base || {});
		schemaPaths(objectSchema(richer || {}), "").forEach(function (path) {
			if (path && !schemaAtPath(normalizedBase, path) && out.length < limit) {
				out.push(path);
			}
		});
		return out;
	}

	function unknownSchemaPaths(schema, limit) {
		limit = limit || 12;
		var out = [];
		schemaPaths(objectSchema(schema || {}), "").forEach(function (path) {
			if (path && schemaSimpleType(schemaAtPath(objectSchema(schema || {}), path)) === "unknown" && out.length < limit) {
				out.push(path);
			}
		});
		return out;
	}

	function schemaTypeName(schema) {
		if (schema && typeof schema === "object" && schema.type) {
			return String(schema.type);
		}
		return typeof schema === "string" ? schema : "";
	}

	function mergeSchemaWithoutDowngrade(primary, secondary) {
		if (!primary) {
			return secondary;
		}
		if (!secondary) {
			return primary;
		}
		primary = normalizeTree(primary);
		secondary = normalizeTree(secondary);
		var primaryType = schemaTypeName(primary);
		var secondaryType = schemaTypeName(secondary);
		if (primaryType === "unknown") {
			return secondary;
		}
		if (secondaryType === "unknown") {
			return primary;
		}
		if (primaryType && secondaryType && primaryType !== secondaryType) {
			return primary;
		}
		if ((primaryType === "object" || primary.properties) && (secondaryType === "object" || secondary.properties)) {
			var properties = {};
			Object.keys(primary.properties || {}).forEach(function (key) {
				properties[key] = primary.properties[key];
			});
			Object.keys(secondary.properties || {}).forEach(function (key) {
				properties[key] = mergeSchemaWithoutDowngrade(properties[key], secondary.properties[key]);
			});
			return { type: "object", properties: properties };
		}
		if (primaryType === "array" && secondaryType === "array") {
			return {
				type: "array",
				items: mergeSchemaWithoutDowngrade(primary.items, secondary.items) || { type: "unknown" }
			};
		}
		return primary;
	}

	function mergedEffectiveSchema(selectedSource, selectedSchema, declaredSchema, staticSchema, learnedSchema, options) {
		if (selectedSource === "declared" && (!options || options.preferDeclared !== false)) {
			return selectedSchema;
		}
		var schema = selectedSchema;
		[
			declaredSchema,
			staticSchema,
			learnedSchema
		].forEach(function (candidate) {
			if (candidate && candidate !== schema && schemaQuality(candidate) > 0) {
				schema = mergeSchemaWithoutDowngrade(schema, candidate);
			}
		});
		return schema;
	}

	function addOutputSchemaWarnings(warnings, selectedSource, selectedSchema, sources) {
		if (schemaQuality(selectedSchema) === 0) {
			warnings.push({
				code: "OUTPUT_SCHEMA_EMPTY",
				message: "No usable output schema is available yet.",
				hint: "Add block output hooks/static schemas, declare _flow.outputs, or explicitly record/adopt a runtime schema."
			});
		}
		var unknown = unknownSchemaPaths(selectedSchema, 8);
		if (unknown.length > 0) {
			warnings.push({
				code: "OUTPUT_SCHEMA_UNKNOWN_PATHS",
				message: "The selected output schema still contains unknown paths.",
				paths: unknown,
				hint: "Add block outputs/hooks or explicitly learn/adopt a richer runtime schema."
			});
		}
		if (selectedSource === "declared") {
			["static", "learned"].forEach(function (name) {
				var other = sources[name];
				if (schemaQuality(other) > 0) {
					var missing = missingSchemaPaths(selectedSchema, other, 12);
					if (missing.length > 0) {
						warnings.push({
							code: "DECLARED_SCHEMA_MISSING_PATHS",
							source: name,
							message: "The explicit output contract is missing paths visible in the " + name + " schema.",
							paths: missing,
							hint: "Review _flow.outputs or adopt the " + name + " schema if the runtime result is correct."
						});
					}
				}
			});
		}
	}

	function selectedSchemaSource(request, declaredSchema, staticSchema, learnedSchema, options) {
		options = options || {};
		var wanted = String(request.source || request.schemaSource || "effective").toLowerCase();
		var wantsEffective = wanted === "effective" || wanted === "selected" || wanted === "best" || wanted === "";
		var schemaSource = "effective";
		var schema = null;
		if (wanted === "declared" || wanted === "contract" || wanted === "explicit") {
			schema = declaredSchema;
			schemaSource = "declared";
		} else if (wanted === "static" || wanted === "inferred") {
			schema = staticSchema;
			schemaSource = "static";
		} else if (wanted === "learned" || wanted === "runtime") {
			schema = learnedSchema;
			schemaSource = "learned";
		} else if (options.preferDeclared === false) {
			var declaredQuality = schemaChoiceScore(declaredSchema);
			var staticQuality = schemaChoiceScore(staticSchema);
			var learnedQuality = schemaChoiceScore(learnedSchema);
			if (learnedQuality > staticQuality && learnedQuality > declaredQuality) {
				schema = learnedSchema;
				schemaSource = "learned";
			} else if (staticQuality > declaredQuality) {
				schema = staticSchema;
				schemaSource = "static";
			} else if (declaredSchema) {
				schema = declaredSchema;
				schemaSource = "declared";
			} else {
				schema = staticSchema || learnedSchema;
				schemaSource = schema === learnedSchema ? "learned" : "static";
			}
		} else if (declaredSchema) {
			schema = declaredSchema;
			schemaSource = "declared";
		} else if (schemaChoiceScore(learnedSchema) > schemaChoiceScore(staticSchema)) {
			schema = learnedSchema;
			schemaSource = "learned";
		} else {
			schema = staticSchema || learnedSchema;
			schemaSource = schema === learnedSchema ? "learned" : "static";
		}
		if (wantsEffective) {
			schema = mergedEffectiveSchema(schemaSource, schema, declaredSchema, staticSchema, learnedSchema, options);
		}
		return {
			source: schemaSource,
			schema: schema || {}
		};
	}

	function outputSchemaRequest(request, blocks) {
		request = request || {};
		var definition = request.definition !== undefined && request.definition !== null
			? canonicalFlowDefinition(normalizeTree(request.definition))
			: parseSource(sourceForFlowRequest(request, blocks));
		var declaredSchema = declaredOutputSchema(definition);
		var wantsFull = fullSchemaDetail(request);
		var staticSchema = !declaredSchema || request.ignoreDeclared === true || wantsFull || String(request.source || request.schemaSource || "").match(/^(static|inferred)$/)
			? resultSchemaFromAnalysis(analyzeFlowDefinition(blocks, definition, request))
			: null;
		var learnedSchema = readResultSchema(request, definition);
		var selected = selectedSchemaSource(request, declaredSchema, staticSchema, learnedSchema);
		var warnings = [];
		addOutputSchemaWarnings(warnings, selected.source, selected.schema, {
			declared: declaredSchema,
			static: staticSchema,
			learned: learnedSchema
		});
		var out = {
			ok: true,
			source: selected.source,
			declared: !!declaredSchema,
			schema: objectSchema(selected.schema),
			warnings: warnings
		};
		if (wantsFull) {
			out.sources = {
				declared: schemaDetails(declaredSchema),
				static: schemaDetails(staticSchema),
				learned: schemaDetails(learnedSchema),
				effective: schemaDetails(selected.schema)
			};
		}
		return out;
	}

	function firstNodeOutput(nodeInfo, property) {
		var outputs = nodeInfo && nodeInfo.outputs || [];
		var fallback = null;
		for (var i = 0; i < outputs.length; i++) {
			var output = outputs[i];
			if (!output || !output.path) {
				continue;
			}
			if (!fallback) {
				fallback = output;
			}
			if (property && output.property === property) {
				return output;
			}
		}
		return fallback;
	}

	function nodeProperty(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function firstNodeOutputFromNode(node, catalog, property) {
		var props = catalog && catalog.props || {};
		var writes = catalog && catalog.writes || [];
		var keys = [];
		Object.keys(props || {}).forEach(function (key) {
			var descriptor = props[key] || {};
			if (writes.indexOf(key) !== -1 || descriptor.kind === "path" && descriptor.mode === "write") {
				keys.push(key);
			}
		});
		if (keys.length === 0) {
			["out", "path"].forEach(function (key) {
				if (nodeProperty(node, key) !== undefined) {
					keys.push(key);
				}
			});
		}
		var wanted = property ? [property].concat(keys) : keys;
		for (var i = 0; i < wanted.length; i++) {
			var key = wanted[i];
			var value = nodeProperty(node, key);
			if (typeof value === "string" && value !== "") {
				return {
					property: key,
					path: value
				};
			}
		}
		return null;
	}

	function nodeLocationFromPointer(root, pointer) {
		var text = String(pointer || "");
		if (!text) {
			return null;
		}
		var node = valueAt(root, parseMutationPath(text));
		if (!node || typeof node !== "object" || !blockName(node)) {
			raise("INVALID_NODE_POINTER", "No Flow node found at path: " + text);
		}
		return {
			node: node,
			parts: parseMutationPath(text)
		};
	}

	function nodeOutputSchemaRequest(request, blocks) {
		request = request || {};
		var action = String(request.action || "read").toLowerCase();
		if (request.adopt === true) {
			action = "adopt";
		}
		if (request.remove === true || request.reset === true || request["delete"] === true) {
			action = "remove";
		}
		var definition = request.definition !== undefined && request.definition !== null
			? canonicalFlowDefinition(normalizeTree(request.definition))
			: parseSource(sourceForFlowRequest(request, blocks));
		var expanded = expandFlowDefinition(blocks, definition);
		var nodeId = request.nodeId || request.node || request.id || "";
		var nodePointer = request.nodePointer || request.nodePath || request.pointer || "";
		var location = nodePointer
			? nodeLocationFromPointer(expanded, nodePointer)
			: locateSingleNode(expanded, blocks, nodeId, "nodeId");
		var node = location.node;
		var catalog = blockCatalog(blocks[blockName(node)]);
		var analysis = analyzeFlowDefinition(blocks, definition, request);
		var byId = analysisByNodeId(analysis);
		var effectiveNodeId = nodeId || nodePath(node);
		var nodeInfo = byId[String(effectiveNodeId)] || null;
		var property = String(request.property || request.output || "");
		var output = nodePointer
			? firstNodeOutputFromNode(node, catalog, property)
			: firstNodeOutput(nodeInfo, property);
		output = output || firstNodeOutput(nodeInfo, property) || firstNodeOutputFromNode(node, catalog, property);
		if (!property) {
			property = output && output.property || "out";
		}
		var outputPath = String(request.path || request.outPath || request.scope || output && output.path || "");
		if ((action === "adopt" || action === "remove" || action === "reset") && !outputPath) {
			raise("NODE_OUTPUT_PATH_UNKNOWN", "The node output path could not be inferred.",
				null, "Pass path/outPath or select a node property that writes to a scope path.");
		}
		var declaredSchema = declaredPropertyOutputSchema(catalog, property);
		var staticSchema = outputPath ? schemaForAnalysisPath(analysis, outputPath) : null;
		var learnedSchema = readOutputSchema(request, definition, node, property, outputPath);
		var selected = selectedSchemaSource(request, declaredSchema, staticSchema, learnedSchema, { preferDeclared: false });
		if (action === "adopt") {
			var adoptedSchema = request.schema !== undefined && request.schema !== null
				? normalizeTree(request.schema)
				: selected.schema;
			if (schemaQuality(adoptedSchema) === 0) {
				raise("NODE_OUTPUT_SCHEMA_EMPTY", "No usable node output schema is available to adopt.",
					null, "Run the Flow first, choose source:\"static\" or source:\"learned\", or pass schema:{...}.");
			}
			var written = writeOutputSchema(request, definition, node, property, outputPath, objectSchema(adoptedSchema));
			return {
				ok: true,
				action: "adopt",
				source: request.schema !== undefined && request.schema !== null ? "schema" : selected.source,
				schema: objectSchema(adoptedSchema),
				target: {
					nodeId: String(effectiveNodeId),
					nodePointer: nodePointer || pointerPath(location.parts || []),
					block: blockName(node),
					property: property,
					path: outputPath
				},
				written: {
					ok: written.ok !== false,
					file: written.file
				}
			};
		}
		if (action === "remove" || action === "reset") {
			var removed = deleteOutputSchema(request, definition, node, property, outputPath);
			return {
				ok: true,
				action: action === "reset" ? "reset" : "remove",
				deleted: removed.deleted === true,
				target: {
					nodeId: String(effectiveNodeId),
					nodePointer: nodePointer || pointerPath(location.parts || []),
					block: blockName(node),
					property: property,
					path: outputPath
				},
				file: removed.file
			};
		}
		if (action !== "read" && action !== "") {
			raise("NODE_OUTPUT_SCHEMA_ACTION", "Unsupported node output schema action: " + action,
				null, "Use read, adopt, remove or reset.");
		}
		var warnings = [];
		addOutputSchemaWarnings(warnings, selected.source, selected.schema, {
			declared: declaredSchema,
			static: staticSchema,
			learned: learnedSchema
		});
		if (!outputPath) {
			warnings.push({
				code: "NODE_OUTPUT_PATH_UNKNOWN",
				message: "The node output path could not be inferred.",
				hint: "Pass path/outPath or select a node property that writes to a scope path."
			});
		}
		var out = {
			ok: true,
			source: selected.source,
			schema: objectSchema(selected.schema),
			target: {
				nodeId: String(effectiveNodeId),
				nodePointer: nodePointer || pointerPath(location.parts || []),
				block: blockName(node),
				property: property,
				path: outputPath
			},
			warnings: warnings
		};
		if (fullSchemaDetail(request)) {
			out.sources = {
				declared: schemaDetails(declaredSchema),
				static: schemaDetails(staticSchema),
				learned: schemaDetails(learnedSchema),
				effective: schemaDetails(selected.schema)
			};
			out.analysis = nodeInfo && (!nodePointer || firstNodeOutput(nodeInfo, property) && firstNodeOutput(nodeInfo, property).path === outputPath)
				? nodeInfo
				: {
					id: nodePath(node),
					block: blockName(node),
					outputs: output ? [output] : []
				};
		}
		return out;
	}


		return {
			embeddedFlowSvelteDocument: function (sourcePath, source) {
				var root = flowSvelteLiteComponentRoot(sourcePath, source);
				return { root: root, diagnostics: root ? mergeFrontendDiagnostics(
					flowSvelteLiteBindingDiagnostics(root), flowSvelteCallContractDiagnostics(root, {})) : [] };
			},
			slotDefinitions: slotDefinitions,
			activeSlots: activeSlots,
			toYamlSource: toYamlSource,
			describeTreeRequest: describeTreeRequest,
			authoringTreeRequest: authoringTreeRequest,
			authoringSourceTreeRequest: authoringSourceTreeRequest,
			authoringContractRequest: authoringContractRequest,
			authoringPaletteRequest: authoringPaletteRequest,
			authoringMutateRequest: authoringMutateRequest,
			searchFlowRequest: searchFlowRequest,
			applyMutationRequest: applyMutationRequest,
			outputSchemaRequest: outputSchemaRequest,
			nodeOutputSchemaRequest: nodeOutputSchemaRequest,
			searchNeedle: searchNeedle,
			searchMatches: searchMatches,
			searchSnippet: searchSnippet,
			childSlotNamesForMutation: childSlotNamesForMutation
		};
	}

	return {
		embeddedFlowSvelteDocument: function (sourcePath, source, env) {
			return create(env || { normalizeTree: function (value) { return value; } })
				.embeddedFlowSvelteDocument(sourcePath, source);
		},
		slotDefinitions: function (catalog, env) {
			return create(env).slotDefinitions(catalog);
		},
		activeSlots: function (node, catalog, env) {
			return create(env).activeSlots(node, catalog);
		},
		toYamlSource: function (value, env) {
			return create(env).toYamlSource(value);
		},
		describeTreeRequest: function (request, blocks, env) {
			return create(env).describeTreeRequest(request, blocks);
		},
		authoringTreeRequest: function (request, blocks, env) {
			return create(env).authoringTreeRequest(request, blocks);
		},
		authoringSourceTreeRequest: function (request, env) {
			return create(env).authoringSourceTreeRequest(request);
		},
		authoringContractRequest: function (request, blocks, env) {
			return create(env).authoringContractRequest(request, blocks);
		},
		authoringPaletteRequest: function (request, blocks, env) {
			return create(env).authoringPaletteRequest(request, blocks);
		},
		authoringMutateRequest: function (request, blocks, env) {
			return create(env).authoringMutateRequest(request, blocks);
		},
		searchFlowRequest: function (request, blocks, env) {
			return create(env).searchFlowRequest(request, blocks);
		},
		applyMutationRequest: function (request, blocks, env) {
			return create(env).applyMutationRequest(request, blocks);
		},
		outputSchemaRequest: function (request, blocks, env) {
			return create(env).outputSchemaRequest(request, blocks);
		},
		nodeOutputSchemaRequest: function (request, blocks, env) {
			return create(env).nodeOutputSchemaRequest(request, blocks);
		},
		searchNeedle: function (request, env) {
			return create(env).searchNeedle(request);
		},
		searchMatches: function (text, needle, env) {
			return create(env).searchMatches(text, needle);
		},
		searchSnippet: function (text, needle, env) {
			return create(env).searchSnippet(text, needle);
		},
		childSlotNamesForMutation: function (blocks, node, env) {
			return create(env).childSlotNamesForMutation(blocks, node);
		}
	};
}())
