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
		var raise = env.raise;
		var intOption = env.intOption;

	function nodeInfo(nodeAnalysis, catalog) {
		var info = nodeAnalysis ? normalizeTree(nodeAnalysis) : {};
		var props = catalog && catalog.props || {};
		var propertyDefinitions = {};
		var propertyOrder = [];
		var defaults = {};
		Object.keys(props).forEach(function (key) {
			var descriptor = props[key];
			propertyOrder.push(key);
			propertyDefinitions[key] = normalizeTree(descriptor || {});
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

	function addObjectFields(parent, object, path) {
		Object.keys(object || {}).sort().forEach(function (key) {
			var value = object[key];
			var fieldPath = path + "." + key;
			if (value && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]") {
				var folder = virtualNode(key, "object", key, fieldPath, key, compact(value), null, "mdi:cube-outline");
				parent.children.push(folder);
				addObjectFields(folder, value, fieldPath);
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

	function addConfig(out, config, path) {
		if (!config || typeof config !== "object" || Object.keys(config).length === 0) {
			return;
		}
		var folder = virtualNode("config", "scope", "config", path, "Config", compact(config), null, "mdi:cog-outline");
		out.push(folder);
		addObjectFields(folder, config, path);
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
		return "[" + blockName + "] " + summaryText(label);
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
				var nodeObject = virtualNode("node_" + id, "node", blockType, nodePath,
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
		if (options.defaultValue !== undefined) {
			definition.default = options.defaultValue;
		}
		if (options.hidden === true) {
			definition.hidden = true;
		}
		if (options.expert === true) {
			definition.expert = true;
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
		var jsSource = sourceDefinitionForFile(jsFile, "javascript");
		var jsSourceInfo = sourceObjectInfo(jsSource, sourcePropertyDefinitions(),
			["implementationKind", "sourceRelativePath", "sourceOrigin", "sourceWritable", "readOnly"]);
		parent.children.push(virtualNode("implementation", "blockImplementation", "javascript",
			path + ".implementation", "Implementation",
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

	function compactTreeNode(node, depth, maxDepth, includeDefinition) {
		var out = {
			name: node.name,
			kind: node.kind,
			type: node.type,
			path: node.path,
			summary: node.summary
		};
		if (node.definition) {
			try {
				var definition = JSON.parse(node.definition);
				if (definition && typeof definition === "object" && Object.prototype.toString.call(definition) !== "[object Array]") {
					if (definition.id !== undefined) {
						out.nodeId = definition.id;
					}
					if (definition.block !== undefined) {
						out.block = definition.block;
					}
				}
			} catch (e) {
			}
			if (includeDefinition === true) {
				out.definition = node.definition;
			}
		}
		var children = node.children || [];
		out.childCount = children.length;
		if (children.length && depth < maxDepth) {
			out.children = children.map(function (child) {
				return compactTreeNode(child, depth + 1, maxDepth, includeDefinition);
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
		var maxDepth = intOption(request.maxDepth, detail === "summary" ? 2 : 4, 0, 20);
		var includeDefinition = request.includeDefinition === true || String(request.includeDefinition || "") === "true";
		var out = {
			ok: tree.ok,
			target: tree.target,
			detail: detail,
			childCount: (tree.children || []).length,
			children: (tree.children || []).map(function (child) {
				return compactTreeNode(child, 0, maxDepth, includeDefinition);
			})
		};
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
				var analysisRequest = Object.assign({}, request, {
					allowRequestableSchema: false
				});
			analysisRequest.flowSource = sourceFromDefinition(definition);
			var analysis = analyzeFlowDefinition(activeBlocks, definition, analysisRequest);
			var analysisById = analysisByNodeId(analysis);
			addContracts(children, definition.contracts, "contracts");
			addBindings(children, definition.bindings, "bindings");
			addHelpers(children, definition.helpers || [], "helpers", activeBlocks, analysisById,
				request.sourceFile || request.sourcePath || "");
			addNodes(children, definition.nodes || [], "nodes", activeBlocks, analysisById);
		} else if (target === "engine") {
			var engine = parseYamlSource(request.engineSource, "version: 1\n");
			var engineQName = String(engine.engineQName || request.engineQName || "");
				children.push(virtualNode("engine", "engine", engineQName, "engineQName", engineQName, engineQName, null, "mdi:engine-outline"));
				addBindings(children, engine.bindings, "bindings");
				addConfig(children, engine.config, "config");
				addFragments(children, blocks);
				addCatalog(children, blocks, {
					includePrivate: request.includePrivate !== false
				});
			} else {
			raise("UNKNOWN_TREE_TARGET", "Unknown Flow tree target: " + target);
		}
		return compactTreeResponse({
			ok: true,
			target: target,
			children: children
		}, request);
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
			slotDefinitions: slotDefinitions,
			activeSlots: activeSlots,
			toYamlSource: toYamlSource,
			describeTreeRequest: describeTreeRequest,
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
