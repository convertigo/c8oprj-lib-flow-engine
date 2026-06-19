(function () {
	function create(env) {
		var normalizeTree = env.normalizeTree;
		var raise = env.raise;
		var blockLocalName = env.blockLocalName;
		var blockCodeRuntimeFromMeta = env.blockCodeRuntimeFromMeta;
		var validateGraphBlockDefinition = env.validateGraphBlockDefinition;
		var extractFlowScriptBlockMeta = env.extractFlowScriptBlockMeta;
		var ensureFlowScriptBlockFunction = env.ensureFlowScriptBlockFunction;
		var graphBlockCatalog = env.graphBlockCatalog;
		var flowScriptValidateRequest = env.flowScriptValidateRequest;
		var flowScriptBlockCodeSource = env.flowScriptBlockCodeSource;
		var rhinoBlockCodeSource = env.rhinoBlockCodeSource;
		var sha256Hex = env.sha256Hex;
		var validateBlockImplementationSource = env.validateBlockImplementationSource;
		var rhinoImplementationWarnings = env.rhinoImplementationWarnings;
		var enforceRhinoImplementationPolicy = env.enforceRhinoImplementationPolicy;

		function flowScriptBlockDescriptorFromMeta(name, meta, graphDefinition, code) {
			meta = normalizeTree(meta || {});
			if (meta.name && String(meta.name) !== String(name) && String(meta.name) !== blockLocalName(name)) {
				raise("BLOCK_NAME_MISMATCH", "FlowScript block _meta declares \"" + meta.name + "\" instead of \"" + name + "\".");
			}
			var runtime = blockCodeRuntimeFromMeta(meta);
			var implementation = normalizeTree(meta.implementation || {});
			implementation.runtime = runtime;
			delete implementation.file;
			var descriptor = {
				version: Number(meta.version || 1),
				name: blockLocalName(name) || name,
				icon: meta.icon || "mdi:puzzle-outline",
				description: meta.description || "Project FlowScript block.",
				props: meta.properties || meta.props || {},
				outputs: meta.outputs || meta.output || { out: { type: "unknown" } },
				implementation: implementation,
				__flowBlockId: String(name)
			};
			if (runtime === "flow") {
				descriptor.__graphDefinition = graphDefinition;
				descriptor.__flowCode = String(code || "");
			} else if (runtime === "rhino") {
				descriptor.__rhinoCode = String(graphDefinition || "");
				descriptor.__flowCode = String(code || "");
			} else {
				raise("INVALID_BLOCK_RUNTIME", "Unsupported .block.js runtime: " + runtime,
					null, "Use runtime: \"flow\" or runtime: \"rhino\" in _meta.");
			}
			["private", "visibility", "tags", "label", "display", "longDescription", "documentation", "slots", "uses", "hooks", "additionalProperties", "dynamicProperties"].forEach(function (key) {
				if (meta[key] !== undefined) {
					descriptor[key] = meta[key];
				}
			});
			return validateGraphBlockDefinition(name, descriptor);
		}

		function flowScriptBlockMetaFromRequest(name, request) {
			request = request || {};
			var descriptor = {};
			if (request.descriptorSource !== undefined && request.descriptorSource !== null) {
				descriptor = env.parseYamlSource(String(request.descriptorSource), "version: 1\n");
			} else if (request.descriptor !== undefined && request.descriptor !== null) {
				descriptor = normalizeTree(request.descriptor);
			} else if (request.definition !== undefined && request.definition !== null) {
				descriptor = normalizeTree(request.definition);
			}
			var meta = {};
			["version", "description", "icon", "private", "visibility", "tags", "label", "display", "longDescription", "documentation", "slots", "uses", "hooks", "additionalProperties", "dynamicProperties"].forEach(function (key) {
				if (descriptor[key] !== undefined) {
					meta[key] = descriptor[key];
				}
				if (request[key] !== undefined && request[key] !== null && request[key] !== "") {
					meta[key] = request[key];
				}
			});
			if (descriptor.props !== undefined) {
				meta.properties = descriptor.props;
			}
			if (descriptor.properties !== undefined) {
				meta.properties = descriptor.properties;
			}
			if (request.props !== undefined && request.props !== null) {
				meta.properties = request.props;
			}
			if (request.properties !== undefined && request.properties !== null) {
				meta.properties = request.properties;
			}
			if (descriptor.output !== undefined) {
				meta.outputs = descriptor.output;
			}
			if (descriptor.outputs !== undefined) {
				meta.outputs = descriptor.outputs;
			}
			if (request.output !== undefined && request.output !== null) {
				meta.outputs = request.output;
			}
			if (request.outputs !== undefined && request.outputs !== null) {
				meta.outputs = request.outputs;
			}
			return normalizeTree(meta);
		}

		function compileFlowScriptBlockCode(blocks, name, code, request) {
			var extracted = extractFlowScriptBlockMeta(code);
			var functionCode = ensureFlowScriptBlockFunction(name, extracted.code);
			var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, request), normalizeTree(extracted.meta || {}));
			var provisional = flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, functionCode);
			var validationBlocks = Object.assign({}, blocks || {});
			validationBlocks[name] = {
				name: String(name),
				catalog: function () {
					return graphBlockCatalog(provisional);
				}
			};
			var validation = flowScriptValidateRequest(validationBlocks, {
				name: blockLocalName(name) || name,
				code: functionCode,
				includeHeader: false,
				blockMode: true
			});
			if (!validation.ok) {
				var error = new Error("FlowScript block validation failed: " + name);
				error.code = "FLOWSCRIPT_BLOCK_VALIDATION_FAILED";
				error.details = validation.diagnostics;
				error.hint = "Fix the FlowScript block diagnostics and retry.";
				throw error;
			}
			var canonicalCode = flowScriptBlockCodeSource(name, functionCode, meta);
			var descriptor = flowScriptBlockDescriptorFromMeta(name, meta, validation.definition, canonicalCode);
			return {
				name: String(name),
				code: canonicalCode,
				functionCode: functionCode,
				revision: sha256Hex(canonicalCode),
				descriptor: descriptor,
				source: validation.source,
				definition: validation.definition,
				diagnostics: validation.diagnostics,
				warnings: flowScriptBlockAuthoringWarnings(name, functionCode, meta, validation.definition)
			};
		}

		function flowScriptBlockAuthoringWarnings(name, functionCode, meta, definition) {
			var warnings = [];
			var outputs = normalizeTree(meta.outputs || meta.output || {});
			var hasOutOutput = outputs.out !== undefined || outputs.type || outputs.properties || outputs.items;
			if (hasOutOutput && String(functionCode || "").match(/return\s*\{\s*out\s*:/)) {
				warnings.push({
					severity: "warning",
					code: "BLOCK_RETURNS_OUT_WRAPPER",
					message: "FlowScript block " + name + " returns { out: ... }; return the block value directly instead.",
					hint: "The caller's out property writes the returned value into scope. Use return { temperature, unit } rather than return { out: { temperature, unit } }."
				});
			}
			var declaredProps = normalizeTree(meta.properties || meta.props || {});
			var inputReads = flowScriptDefinitionInputReads(definition);
			var missingInputs = inputReads.filter(function (name) {
				return declaredProps[name] === undefined;
			});
			if (missingInputs.length) {
				warnings.push({
					severity: "warning",
					code: "FLOW_BLOCK_INPUT_NOT_DECLARED",
					block: String(name),
					inputVariables: inputReads,
					missingInputs: missingInputs,
					message: "FlowScript block " + name + " reads " + missingInputs.map(function (input) { return "input." + input; }).join(", ") + " without declaring matching block properties.",
					hint: "Declare each public input in _meta.properties so the block is editable from Studio and discoverable by MCP. Example: properties: { " + missingInputs.map(function (input) {
						return input + ": { kind: \"template\", type: \"string\", description: \"TODO\" }";
					}).join(", ") + " }."
				});
			}
			return warnings;
		}

		function scanFlowScriptInputReads(value, inputs) {
			if (value === null || value === undefined) {
				return;
			}
			if (typeof value !== "string") {
				if (Object.prototype.toString.call(value) === "[object Array]") {
					value.forEach(function (item) {
						scanFlowScriptInputReads(item, inputs);
					});
					return;
				}
				if (typeof value === "object") {
					Object.keys(value).forEach(function (key) {
						scanFlowScriptInputReads(value[key], inputs);
					});
				}
				return;
			}
			var re = /\binput(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g;
			var match;
			while ((match = re.exec(value)) !== null) {
				var name = String(match[1] || match[2] || "").trim();
				if (name) {
					inputs[name] = true;
				}
			}
		}

		function flowScriptDefinitionInputReads(definition) {
			var inputs = {};
			function walk(nodes) {
				(nodes || []).forEach(function (node) {
					scanFlowScriptInputReads(node && node.props || node, inputs);
					["nodes", "then", "else", "fields"].forEach(function (slot) {
						if (Object.prototype.toString.call(node && node[slot]) === "[object Array]") {
							walk(node[slot]);
						}
					});
				});
			}
			(definition && definition.helpers || []).forEach(function (helper) {
				walk(helper.nodes || []);
			});
			walk(definition && definition.nodes || []);
			return Object.keys(inputs).sort();
		}

		function compileRhinoBlockCode(name, code, request) {
			var extracted = extractFlowScriptBlockMeta(code);
			var source = String(extracted.code || "").trim();
			var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, request), normalizeTree(extracted.meta || {}));
			meta.runtime = "rhino";
			var block = validateBlockImplementationSource(name, source);
			var warnings = request && request.allowPrimitiveRhino === true
				? rhinoImplementationWarnings(name, source)
				: enforceRhinoImplementationPolicy(name, source);
			var canonicalCode = rhinoBlockCodeSource(name, source, meta);
			var descriptor = flowScriptBlockDescriptorFromMeta(name, meta, source, canonicalCode);
			return {
				name: String(name),
				code: canonicalCode,
				functionCode: source,
				revision: sha256Hex(canonicalCode),
				descriptor: descriptor,
				source: source,
				definition: null,
				diagnostics: [],
				warnings: warnings,
				block: block,
				runtime: "rhino"
			};
		}

		function compileProjectBlockCode(blocks, name, code, request) {
			var extracted = extractFlowScriptBlockMeta(code);
			var meta = Object.assign({}, flowScriptBlockMetaFromRequest(name, request), normalizeTree(extracted.meta || {}));
			if (blockCodeRuntimeFromMeta(meta) === "rhino") {
				return compileRhinoBlockCode(name, code, request);
			}
			return compileFlowScriptBlockCode(blocks, name, code, request);
		}

		return {
			flowScriptBlockDescriptorFromMeta: flowScriptBlockDescriptorFromMeta,
			flowScriptBlockMetaFromRequest: flowScriptBlockMetaFromRequest,
			compileFlowScriptBlockCode: compileFlowScriptBlockCode,
			compileRhinoBlockCode: compileRhinoBlockCode,
			compileProjectBlockCode: compileProjectBlockCode
		};
	}

	return {
		flowScriptBlockDescriptorFromMeta: function (name, meta, graphDefinition, code, env) {
			return create(env).flowScriptBlockDescriptorFromMeta(name, meta, graphDefinition, code);
		},
		flowScriptBlockMetaFromRequest: function (name, request, env) {
			return create(env).flowScriptBlockMetaFromRequest(name, request);
		},
		compileFlowScriptBlockCode: function (blocks, name, code, request, env) {
			return create(env).compileFlowScriptBlockCode(blocks, name, code, request);
		},
		compileRhinoBlockCode: function (name, code, request, env) {
			return create(env).compileRhinoBlockCode(name, code, request);
		},
		compileProjectBlockCode: function (blocks, name, code, request, env) {
			return create(env).compileProjectBlockCode(blocks, name, code, request);
		}
	};
}())
