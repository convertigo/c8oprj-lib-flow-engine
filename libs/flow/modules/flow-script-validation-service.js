(function () {
	function expectedProps(block, env) {
		return Object.keys(env.blockCatalog(block).props || {}).sort();
	}

	function validateDefinition(blocks, definition, env) {
		var activeBlocks = env.blocksWithFlowHelpers ? env.blocksWithFlowHelpers(blocks, definition) : blocks;
		var diagnostics = [];
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = env.blockName(node);
				var block = activeBlocks[name];
				var line = node.__flowScriptLine || 0;
				if (!block) {
					var candidates = env.flowScriptBlockCandidates(activeBlocks, name, 5);
					diagnostics.push({
						severity: "error",
						code: "UNKNOWN_BLOCK",
						line: line,
						message: "Unknown Flow block: " + name,
						candidates: candidates,
						next: candidates.length && candidates[0].score >= 35
							? "Try " + candidates[0].block + " first, or call flow-block-get for its exact contract."
							: "No strong palette match. If this is a real domain concept, create a project block with flow-block-code-set, then use it from FlowScript.",
						create: {
							tool: "flow-block-code-set",
							name: name
						},
						hint: candidates.length
							? "Use one candidate block, inspect it with flow-block-get, or create " + name + " as a project block if none matches."
							: "Create a project block with flow-block-code-set before using " + name + "."
					});
				} else {
					var catalog = env.blockCatalog(block);
					var props = catalog.props || {};
					var acceptsAdditionalProperties = catalog.dynamicProperties === true || !!catalog.additionalProperties;
					var slotMap = {};
					env.flowScriptSlotNames(activeBlocks, node).forEach(function (slot) {
						slotMap[slot] = true;
					});
					env.flowScriptArgKeys(node, Object.keys(slotMap)).forEach(function (key) {
						if (key !== "id" && key !== "comment" && key !== "out" && !props[key] && !acceptsAdditionalProperties) {
							var propertyCandidates = env.flowScriptPropertyCandidates(props, key, 5);
							diagnostics.push({
								severity: "error",
								code: "UNKNOWN_BLOCK_PROPERTY",
								line: line,
								block: name,
								property: key,
								message: "Unknown property " + key + " for Flow block " + name + ".",
								expected: expectedProps(block, env),
								candidates: propertyCandidates,
								next: propertyCandidates.length
									? "Use property " + propertyCandidates[0].property + " if it matches the intent, otherwise inspect the block contract with flow-block-get."
									: "Use only expected properties, or create/patch a project block if this property is part of a new contract.",
								hint: "Use " + name + "({ " + expectedProps(block, env).map(function (prop) { return prop + ": ..."; }).join(", ") + " })."
							});
						}
					});
				}
				["nodes", "then", "else", "fields"].forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") {
						walk(node[slot]);
					}
				});
			});
		}
		(definition.helpers || []).forEach(function (helper) {
			walk(helper.nodes || []);
		});
		walk(definition.nodes || []);
		return diagnostics;
	}

	function collectPotentialArrayPaths(schema, prefix, out, env) {
		schema = env.normalizeTree(schema);
		if (!schema || typeof schema !== "object") {
			return;
		}
		if (schema.type === "array") {
			env.addUnique(out, prefix);
			return;
		}
		if (schema.type === "unknown") {
			if (prefix) {
				env.addUnique(out, prefix);
			}
			return;
		}
		var source = schema.properties || schema;
		Object.keys(source || {}).filter(function (key) {
			return !env.isSchemaMetaKey(key);
		}).forEach(function (key) {
			collectPotentialArrayPaths(source[key], env.joinPath(prefix, key), out, env);
		});
	}

	function arrayPathCandidates(basePath, schema, env) {
		var paths = [];
		collectPotentialArrayPaths(schema, "", paths, env);
		return paths.map(function (path) {
			return path ? basePath + "." + path : basePath;
		}).filter(function (path) {
			return path !== basePath;
		}).slice(0, 8);
	}

	function analysisDiagnostics(blocks, analysis, env) {
		var diagnostics = [];
		if (!analysis || !analysis.nodes) {
			return diagnostics;
		}
		analysis.nodes.forEach(function (node) {
			var catalog = env.blockCatalog(blocks[node.block]);
			(node.inputs || []).forEach(function (input) {
				var descriptor = catalog.props && catalog.props[input.property] || {};
					var expected = String(descriptor.type || "");
					if (descriptor.kind !== "expression" || expected !== "array" || !input.path) {
						return;
					}
					if (input.propertyValueType === "array") {
						return;
					}
					var schema = env.schemaForSchemasPath(analysis.schemas || {}, input.path);
				if (!schema) {
					return;
				}
				var actual = env.schemaSimpleType(schema);
				if (actual === "array" || actual === "unknown") {
					return;
				}
				var candidates = arrayPathCandidates(input.path, schema, env);
				diagnostics.push({
					severity: "warning",
					code: "FLOWSCRIPT_EXPECTED_ARRAY",
					block: node.block,
					property: input.property,
					path: input.path,
					actual: actual,
					candidates: candidates,
					message: node.block + "." + input.property + " expects an array but " + input.path + " is " + actual + ".",
					hint: candidates.length
						? "Use " + candidates[0] + " or another array path from candidates."
						: "Use a path whose schema type is array."
				});
			});
		});
		return diagnostics;
	}

	function maxDiagnostics(request) {
		request = request || {};
		var value = request.maxDiagnostics !== undefined && request.maxDiagnostics !== null && request.maxDiagnostics !== ""
			? request.maxDiagnostics
			: request.diagnosticLimit !== undefined && request.diagnosticLimit !== null && request.diagnosticLimit !== ""
				? request.diagnosticLimit
				: request.diagnosticsLimit;
		var max = value === undefined || value === null || value === "" ? 8 : parseInt(String(value), 10);
		if (isNaN(max)) {
			max = 8;
		}
		return Math.max(1, Math.min(25, max));
	}

	function diagnosticReport(diagnostics, request) {
		var all = diagnostics || [];
		var limit = maxDiagnostics(request);
		var shown = all.slice(0, limit);
		return {
			diagnosticCount: all.length,
			diagnosticsShown: shown.length,
			hasMore: all.length > shown.length,
			diagnostics: shown
		};
	}

	function validateRequest(blocks, request, env) {
		request = request || {};
		var code = String(request.code || request.flowScript || "");
		if (code.trim() === "") {
			var source = env.sourceForFlowRequest(request);
			code = env.renderFlowScript(blocks, request.name || request.flowName || "Flow", source, request);
		}
		var definition = env.parseFlowScript(blocks, code);
		var activeBlocks = env.blocksWithFlowHelpers ? env.blocksWithFlowHelpers(blocks, definition) : blocks;
		var diagnostics = [].concat(definition.__flowScriptDiagnostics || [], validateDefinition(blocks, definition, env));
		var clean = env.stripFlowScriptMetadata(definition);
		var source = env.sourceFromDefinition(clean);
		var ok = diagnostics.filter(function (diagnostic) {
			return diagnostic.severity === "error";
		}).length === 0;
		var analysis = ok ? env.analyzeFlowSource(activeBlocks, source, request) : null;
		if (analysis) {
			analysisDiagnostics(activeBlocks, analysis, env).forEach(function (diagnostic) {
				diagnostics.push(diagnostic);
			});
		}
		var report = diagnosticReport(diagnostics, request);
		return {
			ok: ok,
			revision: env.sha256Hex(code),
			code: code,
			definition: clean,
			source: source,
			diagnosticCount: report.diagnosticCount,
			diagnosticsShown: report.diagnosticsShown,
			hasMore: report.hasMore,
			diagnostics: report.diagnostics,
			analysis: analysis
		};
	}

	return {
		validateDefinition: validateDefinition,
		analysisDiagnostics: analysisDiagnostics,
		diagnosticReport: diagnosticReport,
		validateRequest: validateRequest
	};
})();
