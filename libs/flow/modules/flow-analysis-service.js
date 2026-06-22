(function () {
	function create(env) {
		env = env || {};
		var scopeNames = env.scopeNames;
		var intOption = env.intOption;
		var nodeProps = env.nodeProps;
		var addUnique = env.addUnique;
		var schemaPaths = env.schemaPaths;
		var joinPath = env.joinPath;
		var readOutputSchema = env.readOutputSchema;
		var normalizeTree = env.normalizeTree;
		var exactTemplateExpression = env.exactTemplateExpression;
		var collectExpressionRefs = env.collectExpressionRefs;
		var inferSchema = env.inferSchema;
		var itemSchema = env.itemSchema;
		var blockCatalog = env.blockCatalog;
		var blockName = env.blockName;
		var nodePath = env.nodePath;
		var raise = env.raise;
		var outputPathsForFlow = env.outputPathsForFlow;
		var flowOutputSchema = env.flowOutputSchema;
		var currentProjectName = env.currentProjectName;
		var mergeSchema = env.mergeSchema;
		var requestableOutputSchema = env.requestableOutputSchema;
		var schemaAtPath = env.schemaAtPath;
		var collectScopeRefs = env.collectScopeRefs;
		var collectTemplateRefs = env.collectTemplateRefs;
		var declaredPropertyOutputSchema = env.declaredPropertyOutputSchema;
		var schemaSummary = env.schemaSummary;
		var expandFlowDefinition = env.expandFlowDefinition;
		var blocksWithFlowHelpers = env.blocksWithFlowHelpers;
		var parseSource = env.parseSource;
		var sourceForFlowRequest = env.sourceForFlowRequest;
		var objectSchema = env.objectSchema;
		var assignSchemaAtPath = env.assignSchemaAtPath;
		var hasSchemaContent = env.hasSchemaContent;
		var activeSlots = env.activeSlots;
		var canonicalFlowDefinition = env.canonicalFlowDefinition;

		function createAnalysisContext(blocks, request, definition) {
			request = request || {};
			definition = definition || {};
			var ctx = {
				request: request,
				definition: definition,
				blocks: blocks,
				paths: scopeNames.slice(0),
				reads: [],
				writes: [],
				providers: {},
				schemas: {},
				returnSchemas: [],
				currentSources: [],
				graphBlockStack: [],
				maxGraphBlockAnalysisDepth: intOption(request.maxGraphBlockAnalysisDepth, 32, 1, 200),
				currentNodeInfo: null,
				nodes: [],
				errors: []
			};
			ctx.props = nodeProps;
			ctx.addPath = function (path) {
				addUnique(ctx.paths, path);
			};
			ctx.addRead = function (path) {
				addUnique(ctx.reads, path);
				ctx.addPath(path);
			};
			ctx.addWrite = function (path) {
				addUnique(ctx.writes, path);
				ctx.addPath(path);
				if (ctx.currentNodeInfo && typeof path === "string" && path !== "") {
					ctx.providers[path] = {
						id: ctx.currentNodeInfo.id,
						block: ctx.currentNodeInfo.block,
						path: path
					};
				}
			};
			ctx.addOutputPath = function (property, path) {
				ctx.addWrite(path);
				if (ctx.currentNodeInfo && typeof path === "string" && path !== "") {
					addUnique(ctx.currentNodeInfo.writes, path);
					var exists = false;
					ctx.currentNodeInfo.outputs.forEach(function (output) {
						if (output.property === property && output.path === path) {
							exists = true;
						}
					});
					if (!exists) {
						ctx.currentNodeInfo.outputs.push({
							property: property || "out",
							path: path
						});
					}
				}
			};
			ctx.addSchema = function (basePath, schema) {
				if (typeof basePath !== "string" || basePath === "" || !schema) {
					return;
				}
				ctx.schemas[basePath] = normalizeTree(schema);
				ctx.addPath(basePath);
				if (ctx.currentNodeInfo) {
					ctx.providers[basePath] = {
						id: ctx.currentNodeInfo.id,
						block: ctx.currentNodeInfo.block,
						path: basePath
					};
				}
				schemaPaths(schema, "").forEach(function (path) {
					ctx.addPath(joinPath(basePath, path));
				});
			};
			ctx.schemaForOutput = function (node, property, outPath) {
				return readOutputSchema(request, definition, node, property || "out", outPath || "");
			};
			ctx.schemaForPath = function (path) {
				return schemaForAnalysisPath(ctx, path);
			};
			ctx.schemaForExpression = function (value) {
				if (typeof value !== "string") {
					return ctx.schemaForValue(value);
				}
				var expression = exactTemplateExpression(value) || String(value).trim();
				var refs = collectExpressionRefs(expression, []);
				if (refs.length === 1 && expression === refs[0]) {
					return schemaForAnalysisPath(ctx, refs[0]);
				}
				return null;
			};
			ctx.schemaForValue = function (value) {
				if (value && typeof value === "object") {
					return inferSchema(value);
				}
				var expression = exactTemplateExpression(value);
				if (expression) {
					var refs = collectExpressionRefs(expression, []);
					for (var i = 0; i < refs.length; i++) {
						var schema = schemaForAnalysisPath(ctx, refs[i]);
						if (schema) {
							return schema;
						}
					}
					return null;
				}
				if (typeof value === "string") {
					return { type: "string" };
				}
				if (typeof value === "number") {
					return { type: Math.floor(value) === value ? "integer" : "number" };
				}
				if (typeof value === "boolean") {
					return { type: "boolean" };
				}
				return null;
			};
			ctx.addReturnSchema = function (schema) {
				if (schema) {
					ctx.returnSchemas.push(normalizeTree(schema));
				}
			};
			ctx.itemSchema = itemSchema;
			ctx.schemaForItems = function (path) {
				if (typeof path !== "string" || path === "") {
					return null;
				}
				return ctx.schemaForExpression(path);
			};
			ctx.itemSchemaFor = function (path) {
				return itemSchema(ctx.schemaForItems(path));
			};
			ctx.addSameSchema = function (outPath, sourcePath) {
				if (typeof outPath !== "string" || outPath === "" || typeof sourcePath !== "string" || sourcePath === "") {
					return;
				}
				var schema = ctx.schemaForExpression(sourcePath);
				if (schema) {
					ctx.addSchema(outPath, schema);
				}
			};
			ctx.addArraySchema = function (outPath, item) {
				if (typeof outPath === "string" && outPath !== "" && item) {
					ctx.addSchema(outPath, {
						type: "array",
						items: normalizeTree(item)
					});
				}
			};
			ctx.withCurrentSchema = function (schema, callback) {
				if (!schema) {
					return callback();
				}
				var hadCurrent = Object.prototype.hasOwnProperty.call(ctx.schemas, "current");
				var previousCurrent = ctx.schemas.current;
				ctx.currentSources.push({
					path: "current",
					schema: schema
				});
				ctx.addSchema("current", schema);
				try {
					return callback();
				} finally {
					ctx.currentSources.pop();
					if (hadCurrent) {
						ctx.schemas.current = previousCurrent;
					} else {
						delete ctx.schemas.current;
					}
				}
			};
			ctx.inferSchema = inferSchema;
			ctx.sourceForPath = function (path) {
				return sourceForPath(ctx, path);
			};
			ctx.withCurrentSource = function (source, callback) {
				ctx.currentSources.push(source || {});
				if (source && source.schema) {
					ctx.addSchema("current", source.schema);
				}
				try {
					return callback();
				} finally {
					ctx.currentSources.pop();
				}
			};
			ctx.withGraphBlock = function (node, block, callback) {
				var catalog = blockCatalog(block);
				var props = nodeProps(node);
				var graphName = String(block && block.name || blockName(node) || "");
				ctx.graphBlockStack = ctx.graphBlockStack || [];
				var stack = ctx.graphBlockStack;
				if (graphName && stack.indexOf(graphName) !== -1) {
					var recursiveStack = stack.concat([graphName]);
					ctx.errors.push({
						severity: "warning",
						code: "RECURSIVE_GRAPH_BLOCK_ANALYSIS_SKIPPED",
						block: graphName,
						path: nodePath(node),
						stack: recursiveStack,
						message: "Skipped recursive analysis for composite Flow block " + graphName + ".",
						hint: "Declared outputs are still used; runtime recursion is allowed but tree/schema introspection stops at this reference."
					});
					return undefined;
				}
				var maxDepth = Number(ctx.maxGraphBlockAnalysisDepth || 32);
				if (stack.length >= maxDepth) {
					ctx.errors.push({
						severity: "warning",
						code: "GRAPH_BLOCK_ANALYSIS_DEPTH_LIMIT",
						block: graphName,
						path: nodePath(node),
						stack: stack.concat([graphName]),
						message: "Skipped composite Flow block analysis after " + maxDepth + " nested block calls.",
						hint: "Increase maxGraphBlockAnalysisDepth only for debugging; production introspection should stay bounded."
					});
					return undefined;
				}
				ctx.addPath("input");
				ctx.addPath("local");
				Object.keys(catalog.props || {}).forEach(function (key) {
					var descriptor = catalog.props[key] || {};
					var value = props[key] === undefined ? descriptor["default"] : props[key];
					var schema = null;
					if (descriptor.kind === "expression" && typeof value === "string") {
						schema = ctx.schemaForPath(value);
					} else {
						schema = ctx.schemaForValue(value);
					}
					if (!schema && descriptor.type) {
						schema = { type: String(descriptor.type) };
					}
					if (schema) {
						ctx.addSchema("input." + key, schema);
					} else {
						ctx.addPath("input." + key);
					}
				});
				if (graphName) {
					stack.push(graphName);
				}
				try {
					return callback();
				} finally {
					if (graphName) {
						stack.pop();
					}
				}
			};
			ctx.visitNodes = function (nodes) {
				analyzeNodes(ctx, nodes);
			};
			ctx.flowOutputPaths = function (name) {
				return outputPathsForFlow(name);
			};
			ctx.flowOutputSchema = function (name) {
				return flowOutputSchema(name);
			};
			ctx.currentProjectName = function () {
				return currentProjectName(request);
			};
			ctx.mergeSchema = mergeSchema;
			ctx.requestableOutputSchema = request.allowRequestableSchema === false
				? function () { return null; }
				: requestableOutputSchema;
			var sourceBlockName = String(request.sourceBlockName || request.blockName || "").trim();
			var sourceBlock = sourceBlockName ? blocks[sourceBlockName] : null;
			if (sourceBlock) {
				var sourceCatalog = blockCatalog(sourceBlock);
				ctx.addPath("input");
				Object.keys(sourceCatalog.props || {}).forEach(function (key) {
					var descriptor = sourceCatalog.props[key] || {};
					var schema = descriptor.type ? { type: String(descriptor.type) } : null;
					if (!schema && descriptor.kind === "array") {
						schema = { type: "array" };
					}
					if (schema) {
						ctx.addSchema("input." + key, schema);
					} else {
						ctx.addPath("input." + key);
					}
				});
			}
			ctx.raise = raise;
			return ctx;
		}

		function cloneSource(source) {
			if (!source) {
				return null;
			}
			var out = {};
			["id", "block", "path", "sourcePath"].forEach(function (key) {
				if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
					out[key] = source[key];
				}
			});
			return Object.keys(out).length === 0 ? null : out;
		}

		function sourceForPath(ctx, path) {
			if (typeof path !== "string" || path === "") {
				return null;
			}
			if (path === "current" || path.indexOf("current.") === 0) {
				var current = ctx.currentSources.length === 0 ? null : ctx.currentSources[ctx.currentSources.length - 1];
				if (current) {
					var cloned = cloneSource(current);
					if (cloned) {
						cloned.sourcePath = path;
						return cloned;
					}
				}
				return null;
			}
			if (ctx.providers[path]) {
				return cloneSource(ctx.providers[path]);
			}
			var best = "";
			Object.keys(ctx.providers).forEach(function (providerPath) {
				if (path.indexOf(providerPath + ".") === 0 && providerPath.length > best.length) {
					best = providerPath;
				}
			});
			if (best) {
				var source = cloneSource(ctx.providers[best]);
				if (source) {
					source.path = best;
					source.sourcePath = path;
				}
				return source;
			}
			return null;
		}

		function schemaForSchemasPath(schemas, path) {
			var best = "";
			Object.keys(schemas || {}).forEach(function (basePath) {
				if (path === basePath || path.indexOf(basePath + ".") === 0) {
					if (basePath.length > best.length) {
						best = basePath;
					}
				}
			});
			if (!best) {
				return null;
			}
			return schemaAtPath(schemas[best], path === best ? "" : String(path).substring(best.length + 1));
		}

		function schemaForAnalysisPath(ctx, path) {
			return schemaForSchemasPath(ctx.schemas, path);
		}

		function childGroups(node) {
			var groups = [];
			["nodes", "do", "then", "else"].forEach(function (key) {
				if (node[key]) {
					groups.push({
						name: key,
						count: (node[key] || []).length
					});
				}
			});
			return groups;
		}

		function analyzeProps(ctx, props, catalog) {
			var reads = [];
			var writes = [];
			var inputs = [];
			var outputs = [];
			var writeProps = catalog.writes || [];
			Object.keys(props).forEach(function (key) {
				var value = props[key];
				var descriptor = catalog.props && !Object.prototype.toString.call(catalog.props).match(/Array/) ?
					catalog.props[key] || {} : {};
				var kind = descriptor.kind || "";
				var mode = descriptor.mode || "";
				if (writeProps.indexOf(key) !== -1 || kind === "path" && mode === "write"
						|| key === "out" && declaredPropertyOutputSchema(catalog, key)) {
					if (typeof value === "string") {
						addUnique(writes, value);
						ctx.addOutputPath(key, value);
						var output = {
							property: key,
							path: value
						};
						var outputSchema = declaredPropertyOutputSchema(catalog, key);
						if (outputSchema) {
							ctx.addSchema(value, outputSchema);
							output.schema = schemaSummary(outputSchema);
						}
						outputs.push(output);
					}
					return;
				}
				var refs = [];
				if (kind === "path") {
					collectScopeRefs(value, refs);
				} else if (kind === "expression") {
					collectExpressionRefs(value, refs);
				} else if (kind === "template") {
					collectTemplateRefs(value, refs);
				} else if (kind === "value") {
					collectTemplateRefs(value, refs);
				} else if (kind === "literal" || kind === "text" || kind === "schema" || kind === "secret") {
					refs = [];
				} else {
					collectScopeRefs(value, refs);
				}
				refs.forEach(function (path) {
					addUnique(reads, path);
					ctx.addRead(path);
						inputs.push({
							property: key,
							path: path,
							propertyValueType: Object.prototype.toString.call(value) === "[object Array]"
								? "array"
								: value && typeof value === "object" ? "object" : typeof value,
							source: ctx.sourceForPath(path)
						});
					});
			});
			return {
				reads: reads,
				writes: writes,
				inputs: inputs,
				outputs: outputs
			};
		}

		function analyzeNode(ctx, node) {
			if (!node || node.disabled) {
				return;
			}
			var name = blockName(node);
			var block = ctx.blocks[name];
			if (!block) {
				raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
			}
			var props = nodeProps(node);
			var catalog = blockCatalog(block);
			var info = {
				id: nodePath(node),
				block: name,
				properties: Object.keys(props),
				reads: [],
				writes: [],
				inputs: [],
				outputs: [],
				children: childGroups(node)
			};
			var previousNodeInfo = ctx.currentNodeInfo;
			ctx.currentNodeInfo = info;
			try {
				var effects = analyzeProps(ctx, props, catalog);
				info.reads = effects.reads;
				info.writes = effects.writes;
				info.inputs = effects.inputs;
				info.outputs = effects.outputs;
				ctx.nodes.push(info);
				if (typeof block.analyze === "function") {
					block.analyze(ctx, node);
				}
			} finally {
				ctx.currentNodeInfo = previousNodeInfo;
			}
		}

		function analyzeNodes(ctx, nodes) {
			(nodes || []).forEach(function (node) {
				analyzeNode(ctx, node);
			});
		}

		function analyzeFlowSource(blocks, flowSource, request) {
			var args = Object.assign({}, request || {}, {
				flowSource: flowSource
			});
			var definition = parseSource(sourceForFlowRequest(args, blocks));
			return analyzeFlowDefinition(blocks, definition, request);
		}

		function analyzeFlowDefinition(blocks, definition, request) {
			var activeBlocks = blocksWithFlowHelpers ? blocksWithFlowHelpers(blocks, definition) : blocks;
			definition = expandFlowDefinition(activeBlocks, definition);
			var ctx = createAnalysisContext(activeBlocks, request || {}, definition);
			ctx.visitNodes(definition.nodes || []);
			return {
				ok: true,
				version: definition.version || 1,
				paths: ctx.paths,
				reads: ctx.reads,
				writes: ctx.writes,
				nodes: ctx.nodes,
				schemas: ctx.schemas,
				returnSchemas: ctx.returnSchemas,
				errors: ctx.errors
			};
		}

		function resultSchemaFromAnalysis(analysis) {
			if (analysis.returnSchemas && analysis.returnSchemas.length > 0) {
				var returned = null;
				analysis.returnSchemas.forEach(function (schema) {
					returned = mergeSchema(returned, schema) || schema;
				});
				return returned;
			}
			var result = { type: "object", properties: {} };
			Object.keys(analysis.schemas || {}).forEach(function (path) {
				if (path === "result") {
					result = mergeSchema(result, objectSchema(analysis.schemas[path])) || result;
				} else if (path.indexOf("result.") === 0) {
					assignSchemaAtPath(result, path.substring("result.".length), analysis.schemas[path]);
				}
			});
			(analysis.writes || []).forEach(function (path) {
				if (path.indexOf("result.") === 0 && !schemaAtPath(result, path.substring("result.".length))) {
					assignSchemaAtPath(result, path.substring("result.".length), { type: "unknown" });
				}
			});
			return hasSchemaContent(result) ? result : null;
		}

		function hasChildSlots(catalog) {
			return !!(catalog && (
				catalog.slots && Object.prototype.toString.call(catalog.slots) === "[object Array]" ||
				catalog.children && Object.prototype.toString.call(catalog.children) === "[object Array]"
			));
		}

		function analyzeNodeShallow(ctx, node, path) {
			if (!node || node.disabled) {
				return null;
			}
			var name = blockName(node);
			var block = ctx.blocks[name];
			if (!block) {
				raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
			}
			var props = nodeProps(node);
			var catalog = blockCatalog(block);
			var info = {
				id: nodePath(node),
				path: path || "",
				block: name,
				properties: Object.keys(props),
				reads: [],
				writes: [],
				inputs: [],
				outputs: [],
				children: childGroups(node)
			};
			var previousNodeInfo = ctx.currentNodeInfo;
			ctx.currentNodeInfo = info;
			try {
				var effects = analyzeProps(ctx, props, catalog);
				info.reads = effects.reads;
				info.writes = effects.writes;
				info.inputs = effects.inputs;
				info.outputs = effects.outputs;
				ctx.nodes.push(info);
				if (!hasChildSlots(catalog) && typeof block.analyze === "function") {
					block.analyze(ctx, node);
				}
			} finally {
				ctx.currentNodeInfo = previousNodeInfo;
			}
			return info;
		}

		function contextTargetValue(request) {
			return request.node || request.nodeId || request.id || "";
		}

		function currentContextSource(ctx) {
			if (!ctx || !ctx.currentSources || ctx.currentSources.length === 0) {
				return null;
			}
			return cloneSource(ctx.currentSources[ctx.currentSources.length - 1]);
		}

		function matchesContextTarget(request, node, path) {
			var target = String(contextTargetValue(request) || "");
			var targetPath = String(request.path || request.nodePath || "");
			if (targetPath && targetPath === path) {
				return true;
			}
			if (!target) {
				return false;
			}
			return target === String(node && node.id || "") ||
				target === String(node && node.uid || "") ||
				target === String(node && node.name || "") ||
				target === nodePath(node) ||
				target === path;
		}

		function currentSourceForSlot(ctx, node, slot) {
			var current = String(slot && slot.current || "");
			if (!current) {
				return null;
			}
			if (current === "item") {
				var props = nodeProps(node);
				var items = props.items || props["in"];
				var source = ctx.sourceForPath ? ctx.sourceForPath(items) : null;
				source = source || { path: items };
				var currentSchema = ctx.schemaForPath ? ctx.schemaForPath(items) : null;
				currentSchema = ctx.itemSchema ? ctx.itemSchema(currentSchema) : currentSchema;
				if (currentSchema) {
					source.schema = currentSchema;
				}
				return source;
			}
			if (current === "error") {
				return {
					path: "error",
					schema: {
						type: "object",
						properties: {
							code: { type: "string" },
							message: { type: "string" },
							details: { type: "object" }
						}
					}
				};
			}
			return { path: current };
		}

		function contextWalkNodes(ctx, nodes, request, path) {
			nodes = nodes || [];
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i];
				var nodeListPath = path + "[" + i + "]";
				var targetHere = matchesContextTarget(request, node, nodeListPath);
				var position = String(request.position || "before");
				if (targetHere && position !== "after") {
					return { found: true, node: node, path: nodeListPath, currentSource: currentContextSource(ctx) };
				}
				var name = blockName(node);
				var block = ctx.blocks[name];
				var catalog = blockCatalog(block);
				analyzeNodeShallow(ctx, node, nodeListPath);
				function walkSlots() {
					var slots = activeSlots(node, catalog);
					for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
						var slot = slots[slotIndex];
						var childPath = nodeListPath + "." + slot.name;
						var childResult;
						var currentSource = currentSourceForSlot(ctx, node, slot);
						if (currentSource) {
							childResult = ctx.withCurrentSource(currentSource, function () {
								ctx.addPath("current");
								return contextWalkNodes(ctx, slot.nodes || [], request, childPath);
							});
						} else if (name === "file.forEachLine" && slot.name === "nodes") {
							childResult = ctx.withCurrentSource({ path: "file.line", schema: { type: "string" } }, function () {
								ctx.addPath("current");
								return contextWalkNodes(ctx, slot.nodes || [], request, childPath);
							});
						} else {
							childResult = contextWalkNodes(ctx, slot.nodes || [], request, childPath);
						}
						if (childResult && childResult.found) {
							return childResult;
						}
					}
					return { found: false };
				}
				var slotResult = block && block.__graphDefinition && ctx.withGraphBlock
					? ctx.withGraphBlock(node, block, walkSlots)
					: walkSlots();
				if (slotResult && slotResult.found) {
					return slotResult;
				}
				if (targetHere && position === "after") {
					return { found: true, node: node, path: nodeListPath, currentSource: currentContextSource(ctx) };
				}
			}
			return { found: false };
		}

		function scopeRoot(path) {
			return String(path || "").split(".")[0];
		}

		function normalizeInclude(include) {
			if (include === undefined || include === null || include === "") {
				return scopeNames.slice(0);
			}
			if (typeof include === "string") {
				include = [include];
			}
			if (Object.prototype.toString.call(include) !== "[object Array]") {
				raise("INVALID_CONTEXT_INCLUDE", "Flow context include must be an array of scope names.");
			}
			var out = [];
			include.forEach(function (scope) {
				scope = String(scope || "").trim();
				if (scopeNames.indexOf(scope) === -1) {
					raise("INVALID_CONTEXT_SCOPE", "Unknown Flow scope in include: " + scope);
				}
				addUnique(out, scope);
			});
			return out;
		}

		function schemaType(schema, path) {
			if (!schema) {
				return "";
			}
			var current = schema;
			if (!path) {
				return current.type ? String(current.type) : typeof current === "string" ? current : "object";
			}
			String(path).split(".").forEach(function (part) {
				if (!current) {
					return;
				}
				if (current.type === "array" && current.items) {
					current = current.items;
				}
				var source = current.properties || current;
				current = source[part];
			});
			if (!current) {
				return "";
			}
			if (typeof current === "string") {
				return current;
			}
			if (current.type) {
				return String(current.type);
			}
			if (current.properties) {
				return "object";
			}
			if (Object.prototype.toString.call(current) === "[object Array]") {
				return "array";
			}
			return "";
		}

		function analysisSchemaType(ctx, path) {
			var best = "";
			Object.keys(ctx.schemas || {}).forEach(function (basePath) {
				if (path === basePath || path.indexOf(basePath + ".") === 0) {
					if (basePath.length > best.length) {
						best = basePath;
					}
				}
			});
			if (!best) {
				return "";
			}
			var local = path === best ? "" : String(path).substring(best.length + 1);
			return schemaType(ctx.schemas[best], local);
		}

		function declaredSchemaForRoot(definition, root) {
			if (root === "input") {
				return definition.input || definition.inputs || {};
			}
			if (root === "config") {
				return definition.config || {};
			}
			if (root === "result") {
				return definition.output || definition.outputs || {};
			}
			return {};
		}

		function pathType(definition, ctx, path) {
			var root = scopeRoot(path);
			if (path === root) {
				return analysisSchemaType(ctx, path) || (root === "current" ? "unknown" : "object");
			}
			var local = String(path).substring(root.length + 1);
			return analysisSchemaType(ctx, path) || schemaType(declaredSchemaForRoot(definition, root), local) || "unknown";
		}

		function pathConfidence(definition, ctx, path) {
			var root = scopeRoot(path);
			if (path === root) {
				return "declared";
			}
			if (schemaType(declaredSchemaForRoot(definition, root), String(path).substring(root.length + 1))) {
				return "declared";
			}
			if (analysisSchemaType(ctx, path)) {
				return "learned";
			}
			if (ctx.sourceForPath(path)) {
				return "inferred";
			}
			return "unknown";
		}

		function contextPathEntry(ctx, definition, path, currentSource) {
			var source = ctx.sourceForPath(path);
			if (!source && path === "current" && currentSource) {
				source = cloneSource(currentSource);
			}
			var entry = {
				path: path,
				type: pathType(definition, ctx, path),
				confidence: pathConfidence(definition, ctx, path)
			};
			if (source) {
				entry.producer = source;
			}
			return entry;
		}

		function targetPropertyDescriptor(blocks, node, property) {
			if (!node || !property) {
				return null;
			}
			var block = blocks[blockName(node)];
			var descriptor = blockCatalog(block);
			return descriptor && descriptor.props ? normalizeTree(descriptor.props[property] || null) : null;
		}

		function contextForFlowRequest(blocks, request) {
			request = request || {};
			var definition = request.definition !== undefined && request.definition !== null
				? canonicalFlowDefinition(normalizeTree(request.definition))
				: parseSource(sourceForFlowRequest(request, blocks));
			definition = expandFlowDefinition(blocks, definition);
			var include = normalizeInclude(request.include);
			var detail = String(request.detail || "normal");
			if (detail === "summary") {
				detail = "compact";
			}
			if (["normal", "compact"].indexOf(detail) === -1) {
				raise("INVALID_CONTEXT_DETAIL", "Unknown Flow context detail: " + detail,
					null, "Use detail=normal or detail=compact. detail=summary is accepted as compact.");
			}
			var ctx = createAnalysisContext(blocks, request, definition);
			var hasTarget = !!(contextTargetValue(request) || request.path || request.nodePath);
			var found = contextWalkNodes(ctx, definition.nodes || [], request, "nodes");
			if (hasTarget && !found.found) {
				raise("FLOW_CONTEXT_TARGET_NOT_FOUND", "Flow context target not found: " +
					(contextTargetValue(request) || request.path || request.nodePath));
			}
			var scopes = {};
			var currentSource = found.currentSource || null;
			include.forEach(function (scope) {
				var paths = ctx.paths.filter(function (path) {
					return scopeRoot(path) === scope;
				});
				if (paths.length === 0 && ctx.paths.indexOf(scope) !== -1) {
					paths = [scope];
				}
				if (detail === "compact") {
					scopes[scope] = paths;
				} else {
					scopes[scope] = {
						paths: paths.map(function (path) {
							return contextPathEntry(ctx, definition, path, currentSource);
						})
					};
				}
			});
			var out = {
				ok: true,
				node: found.node ? nodePath(found.node) : "",
				path: found.path || "",
				property: request.property || "",
				mode: request.mode || "read",
				include: include,
				detail: detail,
				scopes: scopes
			};
			if (found.node) {
				out.target = {
					id: nodePath(found.node),
					block: blockName(found.node),
					path: found.path || "",
					property: request.property || "",
					propertyDefinition: targetPropertyDescriptor(blocks, found.node, request.property)
				};
			}
			return out;
		}


		return {
			createAnalysisContext: createAnalysisContext,
			schemaForSchemasPath: schemaForSchemasPath,
			analyzeFlowSource: analyzeFlowSource,
			analyzeFlowDefinition: analyzeFlowDefinition,
			resultSchemaFromAnalysis: resultSchemaFromAnalysis,
			contextForFlowRequest: contextForFlowRequest
		};
	}

	function invoke(name, argsLike) {
		var args = Array.prototype.slice.call(argsLike);
		var env = args.pop();
		return create(env)[name].apply(null, args);
	}

	return {
		createAnalysisContext: function () {
			return invoke("createAnalysisContext", arguments);
		},
		schemaForSchemasPath: function () {
			return invoke("schemaForSchemasPath", arguments);
		},
		analyzeFlowSource: function () {
			return invoke("analyzeFlowSource", arguments);
		},
		analyzeFlowDefinition: function () {
			return invoke("analyzeFlowDefinition", arguments);
		},
		resultSchemaFromAnalysis: function () {
			return invoke("resultSchemaFromAnalysis", arguments);
		},
		contextForFlowRequest: function () {
			return invoke("contextForFlowRequest", arguments);
		}
	};
}())
