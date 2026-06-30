(function () {
	function expectedProps(block, env) {
		return Object.keys(env.blockCatalog(block).props || {}).sort();
	}

	function flowScriptPropertyValue(node, key) {
		if (node && node.props && Object.prototype.hasOwnProperty.call(node.props, key)) {
			return node.props[key];
		}
		return node ? node[key] : undefined;
	}

	function templateExpressions(value, env) {
		var out = [];
		if (typeof value !== "string") {
			return out;
		}
		var exact = env.exactTemplateExpression ? env.exactTemplateExpression(value) : null;
		if (exact) {
			return [exact];
		}
		String(value).replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, expr) {
			out.push(String(expr || "").trim());
			return _;
		});
		return out;
	}

	function expressionDiagnostic(error, node, blockName, property, expression) {
		return {
			severity: "error",
			code: error && error.code ? String(error.code) : "INVALID_EXPRESSION",
			line: node && node.__flowScriptLine || 0,
			block: blockName,
			property: property,
			expression: expression,
			message: "Invalid FlowScript expression for " + blockName + "." + property + ": " + String(error && error.message || error || ""),
			hint: error && error.hint ? String(error.hint) : "Use FlowScript expressions over input.*, config.*, local.*, current.* or result.*; use blocks or literal properties for structured objects/arrays."
		};
	}

	function validateExpressionText(diagnostics, node, blockName, property, expression, env) {
		expression = String(expression || "").trim();
		if (!expression || !env.tokenizeExpression) {
			return;
		}
		try {
			env.tokenizeExpression(expression);
		} catch (e) {
			diagnostics.push(expressionDiagnostic(e, node, blockName, property, expression));
		}
	}

	function validateTemplateExpressions(diagnostics, node, blockName, property, value, env) {
		templateExpressions(value, env).forEach(function (expression) {
			validateExpressionText(diagnostics, node, blockName, property, expression, env);
		});
	}

	function validateStructuredTemplates(diagnostics, node, blockName, property, value, env) {
		if (Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				validateStructuredTemplates(diagnostics, node, blockName, property, item, env);
			});
			return;
		}
		if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				validateStructuredTemplates(diagnostics, node, blockName, property + "." + key, value[key], env);
			});
			return;
		}
		validateTemplateExpressions(diagnostics, node, blockName, property, value, env);
	}

	function validateNodeExpressions(diagnostics, blocks, node, blockName, env) {
		var catalog = env.blockCatalog(blocks[blockName]) || {};
		var props = catalog.props || {};
		var slotMap = {};
		env.flowScriptSlotNames(blocks, node).forEach(function (slot) {
			slotMap[slot] = true;
		});
		env.flowScriptArgKeys(node, Object.keys(slotMap)).forEach(function (key) {
			var descriptor = props[key] || (catalog.dynamicProperties === true ? catalog.additionalProperties || {} : {});
			var value = flowScriptPropertyValue(node, key);
			if (descriptor.kind === "expression") {
				if (typeof value === "string") {
					validateExpressionText(diagnostics, node, blockName, key, value, env);
				} else {
					validateStructuredTemplates(diagnostics, node, blockName, key, value, env);
				}
				return;
			}
			if (descriptor.kind === "template" || descriptor.kind === "value" || descriptor.kind === undefined) {
				validateStructuredTemplates(diagnostics, node, blockName, key, value, env);
			}
		});
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
							: "No strong palette match. If this is intentional domain vocabulary, create an explicit project mock with flow-block-mock, typed properties and typed outputs, then implement that block with real FlowScript.",
						create: {
							tool: candidates.length && candidates[0].score >= 35 ? "flow-block-get" : "flow-block-mock",
							name: name,
							block: name
						},
						hint: candidates.length
							? "Use one candidate block, inspect it with flow-block-get, or create " + name + " as a project block if none matches."
							: "Use flow-block-mock to keep the parent Flow executable, then replace the mock with a real FlowScript implementation."
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
					validateNodeExpressions(diagnostics, activeBlocks, node, name, env);
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

	function scanInputVariablesInValue(value, variables) {
		if (value === null || value === undefined) {
			return;
		}
		if (typeof value === "string") {
			var re = /\binput(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g;
			var match;
			while ((match = re.exec(value)) !== null) {
				var name = String(match[1] || match[2] || "").trim();
				if (name) {
					variables[name] = true;
				}
			}
			return;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				scanInputVariablesInValue(item, variables);
			});
			return;
		}
		if (typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				scanInputVariablesInValue(value[key], variables);
			});
		}
	}

	function scanInputVariablesInNodes(nodes, variables) {
		(nodes || []).forEach(function (node) {
			scanInputVariablesInValue(node && node.props || node, variables);
			["nodes", "then", "else", "fields"].forEach(function (slot) {
				if (Object.prototype.toString.call(node && node[slot]) === "[object Array]") {
					scanInputVariablesInNodes(node[slot], variables);
				}
			});
		});
	}

	function inputVariablesFromDefinition(definition) {
		var variables = {};
		(definition.helpers || []).forEach(function (helper) {
			scanInputVariablesInNodes(helper.nodes || [], variables);
		});
		scanInputVariablesInNodes(definition.nodes || [], variables);
		return Object.keys(variables).sort();
	}

	function inputDefinitionsFromDefinition(definition) {
		var meta = flowMetaFromDefinition(definition);
		var inputs = meta.inputs || meta.input || definition && (definition.inputs || definition.input) || {};
		return inputs && typeof inputs === "object" ? inputs : {};
	}

	function flowMetaFromDefinition(definition) {
		return definition && (definition.flow || definition._flow) || {};
	}

	function inputDeclarationSnippet(missing) {
		return "const _flow = { inputs: { " + missing.map(function (name) {
			return name + ": { type: \"string\", description: \"TODO\", default: \"\" }";
		}).join(", ") + " } }";
	}

	function inputContractDiagnostics(definition, request) {
		request = request || {};
		if (request.blockMode === true || request.block === true || request.skipInputContractWarnings === true) {
			return [];
		}
		var variables = inputVariablesFromDefinition(definition);
		if (!variables.length) {
			return [];
		}
		var definitions = inputDefinitionsFromDefinition(definition);
		var missing = variables.filter(function (name) {
			return definitions[name] === undefined;
		});
		if (!missing.length) {
			return [];
		}
		return [{
			severity: request.strictInputContract === true ? "error" : "warning",
			code: "FLOWSCRIPT_INPUT_NOT_DECLARED",
			inputVariables: variables,
			missingInputs: missing,
			message: "FlowScript reads " + missing.map(function (name) { return "input." + name; }).join(", ") + " without declaring them in _flow.inputs.",
			hint: "Declare request inputs before the function so Studio, SDK callers, test cases and MCP agree on the Flow contract. Example: " + inputDeclarationSnippet(missing)
		}];
	}

	function walkDefinitionNodes(nodes, visitor) {
		(nodes || []).forEach(function (node) {
			visitor(node);
			["nodes", "then", "else", "fields"].forEach(function (slot) {
				if (Object.prototype.toString.call(node && node[slot]) === "[object Array]") {
					walkDefinitionNodes(node[slot], visitor);
				}
			});
		});
	}

	function repetitionStyleDiagnostics(definition, env) {
		var watched = {
			"http.get": true,
			"http.post": true,
			"http.put": true,
			"http.delete": true,
			"http.request": true,
			"requestable.call": true
		};
		var counts = {};
		var firstLine = {};
		function count(nodes) {
			walkDefinitionNodes(nodes, function (node) {
				var name = env.blockName(node);
				if (!watched[name]) {
					return;
				}
				counts[name] = (counts[name] || 0) + 1;
				if (firstLine[name] === undefined) {
					firstLine[name] = node.__flowScriptLine || 0;
				}
			});
		}
		(definition.helpers || []).forEach(function (helper) {
			count(helper.nodes || []);
		});
		count(definition.nodes || []);
		return Object.keys(counts).filter(function (name) {
			return counts[name] > 3;
		}).map(function (name) {
			return {
				severity: "warning",
				code: "FLOWSCRIPT_REPEATED_EXTERNAL_CALLS",
				line: firstLine[name] || 0,
				block: name,
				count: counts[name],
				message: "FlowScript contains " + counts[name] + " " + name + " calls.",
				hint: "If these calls share the same shape, move repeated rows/endpoints to project config and iterate with list.map, calling one per-item FlowScript block from the map body."
			};
		});
	}

	function collectLargeConfigArrays(value, path, out) {
		if (!value || typeof value !== "object") {
			return;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			if (value.length >= 10) {
				out.push({ path: path, length: value.length });
			}
			value.forEach(function (item, index) {
				collectLargeConfigArrays(item, path + "[" + index + "]", out);
			});
			return;
		}
		Object.keys(value).forEach(function (key) {
			collectLargeConfigArrays(value[key], path ? path + "." + key : key, out);
		});
	}

	function localConfigStyleDiagnostics(definition) {
		var meta = flowMetaFromDefinition(definition);
		var config = meta.config;
		if (!config || typeof config !== "object") {
			return [];
		}
		var arrays = [];
		collectLargeConfigArrays(config, "config", arrays);
		if (!arrays.length) {
			return [];
		}
		return [{
			severity: "warning",
			code: "FLOWSCRIPT_LARGE_LOCAL_CONFIG",
			path: arrays[0].path,
			length: arrays[0].length,
			message: "_flow.config contains a large local table at " + arrays[0].path + " (" + arrays[0].length + " items).",
			hint: "Use _flow.config only for Flow-local defaults. If the project already has high-level FlowEngine config, read config.* directly instead of duplicating constants in the Flow source."
		}];
	}

	function lineForOffset(code, offset) {
		return String(code || "").slice(0, Math.max(0, offset)).split(/\r\n|\r|\n/).length;
	}

	function hardCodedServiceUrlDiagnostics(code) {
		var source = String(code || "");
		var urlRe = /["'`](https?:\/\/[^"'`\s]+)["'`]/g;
		var match;
		var urls = [];
		var seen = {};
		var firstOffset = -1;
		while ((match = urlRe.exec(source)) !== null) {
			var url = String(match[1] || "");
			if (!seen[url]) {
				seen[url] = true;
				urls.push(url);
			}
			if (firstOffset < 0) {
				firstOffset = match.index;
			}
		}
		if (!urls.length) {
			return [];
		}
		return [{
			severity: "warning",
			code: "FLOWSCRIPT_HARDCODED_SERVICE_URL",
			line: lineForOffset(source, firstOffset),
			urlCount: urls.length,
			message: "FlowScript contains " + urls.length + " hard-coded service URL" + (urls.length > 1 ? "s" : "") + ".",
			hint: "Move structural endpoints to project FlowEngine config, for example config.services.weather.forecastUrl, and pass that value into reusable blocks."
		}];
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

	function splitTypes(value) {
		return String(value || "").split("|").map(function (type) {
			return String(type || "").trim();
		}).filter(function (type) {
			return type !== "";
		});
	}

	function isLooseType(type) {
		type = String(type || "").trim();
		return type === "" || type === "unknown" || type === "any";
	}

	function compatibleSchemaType(expected, actual) {
		if (isLooseType(expected) || isLooseType(actual)) {
			return true;
		}
		if (expected === actual) {
			return true;
		}
		if (expected === "number" && actual === "integer") {
			return true;
		}
		if (expected.indexOf("|") === -1) {
			return false;
		}
		return splitTypes(expected).some(function (type) {
			return compatibleSchemaType(type, actual);
		});
	}

	function propertyTypeMismatchDiagnostic(node, input, descriptor, actual) {
		var expected = String(descriptor && descriptor.type || "").trim();
		return {
			severity: "warning",
			code: "FLOWSCRIPT_PROPERTY_TYPE_MISMATCH",
			line: node.line || 0,
			block: node.block,
			property: input.property,
			path: input.path,
			expected: expected,
			actual: actual,
			message: node.block + "." + input.property + " declares " + expected + " but " + input.path + " is " + actual + ".",
			hint: "Patch the block property type to " + actual + " when the value should keep its native type, or convert the value explicitly before calling the block."
		};
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
				var expected = String(descriptor.type || "").trim();
				if (!input.path) {
					return;
				}
				var schema = env.schemaForSchemasPath(analysis.schemas || {}, input.path);
				if (!schema) {
					return;
				}
				var actual = env.schemaSimpleType(schema);
				if (descriptor.kind === "expression" && expected === "array" && input.propertyValueType !== "array") {
					if (actual === "array" || actual === "unknown") {
						return;
					}
					var candidates = arrayPathCandidates(input.path, schema, env);
					diagnostics.push({
						severity: "warning",
						code: "FLOWSCRIPT_EXPECTED_ARRAY",
						line: node.line || 0,
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
					return;
				}
				if (!input.exactRef) {
					return;
				}
				if (expected === "array" || compatibleSchemaType(expected, actual)) {
					return;
				}
				diagnostics.push(propertyTypeMismatchDiagnostic(node, input, descriptor, actual));
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
		inputContractDiagnostics(definition, request).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		repetitionStyleDiagnostics(definition, env).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		localConfigStyleDiagnostics(definition).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		hardCodedServiceUrlDiagnostics(code).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
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
