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

	function businessPropertyKeys(node, slots, env) {
		var keys = env.flowScriptArgKeys(node, slots).filter(function (key) {
			return key !== "id" && key !== "comment" && key !== "out";
		});
		Object.keys(node.props || {}).forEach(function (key) {
			if (keys.indexOf(key) === -1) keys.push(key);
		});
		return keys;
	}

	function templateExpressions(value, env) {
		var out = [];
		if (typeof value !== "string") {
			return out;
		}
		return env.templateSyntax.expressions(value);
	}

	function unknownIdentifierHint(error, context) {
		var match = /^Unknown expression identifier: ([A-Za-z_$][\w$]*)$/.exec(String(error && error.message || ""));
		if (!match || !context) return error && error.hint;
		var name = match[1], available = [];
		["input", "local", "config"].forEach(function (scope) {
			if (Object.prototype.hasOwnProperty.call(context.known[scope], name)) available.push(scope + "." + name);
		});
		if (context.current) available.push("current." + name + " (item field)");
		return (available.length ? "Read " + available.join(" or ") + ". " : "") +
			"Quote literal text (\"" + name + "\"). Read other values through their existing input.*, local.* or config.* scope.";
	}

	function expressionDiagnostic(error, node, blockName, property, expression, context) {
		return {
			severity: "error",
			code: error && error.code ? String(error.code) : "INVALID_EXPRESSION",
			line: node && node.__flowScriptLine || 0,
			block: blockName,
			property: property,
			expression: expression,
			message: "Invalid FlowScript expression for " + blockName + "." + property + ": " + String(error && error.message || error || ""),
			hint: unknownIdentifierHint(error, context) || "Use FlowScript expressions over input.*, config.*, local.* or result.*; use blocks or literal properties for structured objects/arrays."
		};
	}

	function validateExpressionText(diagnostics, node, blockName, property, expression, env, context) {
		expression = String(expression || "").trim();
		if (!expression || !env.tokenizeExpression) {
			return;
		}
		try {
			env.tokenizeExpression(expression);
		} catch (e) {
			diagnostics.push(expressionDiagnostic(e, node, blockName, property, expression, context));
		}
	}

	// A quoted string given to an expression property is text, as in JavaScript (day: "2025-12-14" is that text). A
	// quoted text reading a scope (where: "current.active", condition: "input.count > 1") is the former spelling of an
	// expression: it is reported with the expression to write, as an error unless the property takes a text.
	var SCOPE_ROOTS = /^(?:input|config|local|result|request|current|parent|trace)(?:[.[]|$)/;

	function quotedExpressionDiagnostic(diagnostics, node, blockName, property, expression, descriptor, env) {
		if (!env.inputExpressionTokens) {
			return;
		}
		var tokens, inner;
		try {
			tokens = env.inputExpressionTokens(String(expression).trim());
			if (tokens.length !== 2 || tokens[0].type !== "string") {
				return;
			}
			inner = env.inputExpressionTokens(tokens[0].value);
		} catch (_notAnExpression) {
			return;
		}
		var readsScope = inner.some(function (token) {
			return token.type === "id" && SCOPE_ROOTS.test(String(token.value));
		});
		if (!readsScope) {
			return;
		}
		var types = String(descriptor && descriptor.type || "").split("|").map(function (type) { return type.trim(); });
		var text = types.indexOf("string") !== -1;
		var unquoted = tokens[0].value.trim();
		diagnostics.push({
			severity: text ? "warning" : "error",
			code: "FLOWSCRIPT_QUOTED_EXPRESSION",
			line: node && node.__flowScriptLine || 0,
			block: blockName,
			property: property,
			expression: unquoted,
			message: blockName + "." + property + " receives the text " + JSON.stringify(tokens[0].value) +
				": a quoted string is text, even on an expression property.",
			hint: "To pass the value, write the expression without quotes: " + property + ": " + unquoted +
				(text ? ". Keep the quotes only if the property must receive these characters." : ".")
		});
	}

	function validateTemplateExpressions(diagnostics, node, blockName, property, value, env, context) {
		templateExpressions(value, env).forEach(function (expression) {
			validateExpressionText(diagnostics, node, blockName, property, expression, env, context);
		});
	}

	function validateStructuredTemplates(diagnostics, node, blockName, property, value, env, context) {
		if (Object.prototype.toString.call(value) === "[object Array]") {
			value.forEach(function (item) {
				validateStructuredTemplates(diagnostics, node, blockName, property, item, env, context);
			});
			return;
		}
		if (value && typeof value === "object") {
			Object.keys(value).forEach(function (key) {
				validateStructuredTemplates(diagnostics, node, blockName, property + "." + key, value[key], env, context);
			});
			return;
		}
		validateTemplateExpressions(diagnostics, node, blockName, property, value, env, context);
	}

	function validateNodeExpressions(diagnostics, blocks, node, blockName, env, context) {
		var catalog = env.blockCatalog(blocks[blockName]) || {};
		var props = catalog.props || {};
		var slotMap = {};
		env.flowScriptSlotNames(blocks, node).forEach(function (slot) {
			slotMap[slot] = true;
		});
		businessPropertyKeys(node, Object.keys(slotMap), env).forEach(function (key) {
			var descriptor = props[key] || (catalog.dynamicProperties === true ? catalog.additionalProperties || {} : {});
			var value = flowScriptPropertyValue(node, key);
			var expressionContext = {known: context.known, current: context.current ||
				(blockName === "list.map" && key === "select") ||
				(blockName === "list.filter" && key === "where") ||
				(blockName === "list.sort" && key === "by")};
			if (descriptor.kind === "expression") {
				if (typeof value === "string") {
					validateExpressionText(diagnostics, node, blockName, key, value, env, expressionContext);
					quotedExpressionDiagnostic(diagnostics, node, blockName, key, value, descriptor, env);
				} else {
					validateStructuredTemplates(diagnostics, node, blockName, key, value, env, expressionContext);
				}
				return;
			}
			if (descriptor.kind === "template" || descriptor.kind === "value" || descriptor.kind === undefined) {
				validateStructuredTemplates(diagnostics, node, blockName, key, value, env, expressionContext);
			}
		});
	}

	function validateDefinition(blocks, definition, env, target) {
		var activeBlocks = env.blocksWithFlowHelpers ? env.blocksWithFlowHelpers(blocks, definition) : blocks;
		var dependencyContext = {blocks: activeBlocks};
		var diagnostics = [];
		var meta = definition.flow || definition._flow || {};
		var known = {input: meta.inputs || meta.input || definition.inputs || definition.input || {},
			local: {}, config: meta.config || {}};
		target = String(target || "backend").trim().toLowerCase() || "backend";
		function walk(nodes, context) {
			context = context || {known: known, current: false};
			(nodes || []).forEach(function (node) {
				var name = env.blockName(node);
				var block = activeBlocks[name];
				var line = node.__flowScriptLine || 0;
				if (!block) {
					var candidates = env.flowScriptBlockCandidates(activeBlocks, name, 5);
					var decision = env.flowScriptBlockCandidateDecision
						? env.flowScriptBlockCandidateDecision(candidates)
						: {
							recommendation: candidates.length && candidates[0].score >= 140 ? "existing" : "mock",
							tool: candidates.length && candidates[0].score >= 140 ? "flow-block-get" : "flow-block-mock",
							bestBlock: candidates.length ? candidates[0].block : "",
							bestScore: candidates.length ? Number(candidates[0].score || 0) : 0,
							preferExistingScore: 140
						};
					var preferExisting = decision.recommendation === "existing";
					var create = {
						tool: decision.tool,
						name: name,
						block: preferExisting ? decision.bestBlock : name
					};
					if (preferExisting) {
						create.alternativeTool = "flow-block-mock";
					} else if (candidates.length) {
						create.candidateTool = "flow-block-get";
						create.candidateBlock = decision.bestBlock;
					}
					diagnostics.push({
						severity: "error",
						code: "UNKNOWN_BLOCK",
						line: line,
						message: "Unknown Flow block: " + name,
						candidates: candidates,
						candidateDecision: decision,
						next: preferExisting
							? "Best candidate " + decision.bestBlock + " scored " + decision.bestScore + " (threshold " + decision.preferExistingScore + "). Try it only if it matches the intent; otherwise keep the top-down FlowScript and create " + name + " with flow-block-mock, typed properties and typed outputs."
							: (candidates.length
								? "Best candidate " + decision.bestBlock + " scored " + decision.bestScore + " below threshold " + decision.preferExistingScore + ". Keep the top-down FlowScript and create " + name + " as an explicit project mock with flow-block-mock, typed properties and typed outputs, then implement that block with real FlowScript."
								: "No palette match. Keep the top-down FlowScript and create " + name + " as an explicit project mock with flow-block-mock, typed properties and typed outputs, then implement that block with real FlowScript."),
						create: create,
						mock: {
							tool: "flow-block-mock",
							name: name,
							when: preferExisting ? "Use this when the candidate is not the intended domain block." : "Use this to keep the parent Flow executable while the domain block is implemented."
						},
						hint: candidates.length
							? "Use one candidate block only when it really matches the requested behavior; otherwise create " + name + " as a project-local mock and run flow-block-mock-list before claiming completion."
							: "Use flow-block-mock to keep the parent Flow executable, then replace the mock with a real FlowScript implementation. Run flow-block-mock-list before claiming completion."
					});
				} else {
					var catalog = env.blockCatalog(block);
					if (catalog.requiresBlocks && env.validateBlockDependencies) {
						try { env.validateBlockDependencies(dependencyContext, name, node); }
						catch (error) {
							if (!/^BLOCK_DEPENDENCY_/.test(String(error.code || ""))) throw error;
							diagnostics.push({severity: "error", phase: "analysis", code: error.code, line: line,
								block: name, property: "requiresBlocks", message: error.message, hint: error.hint});
						}
					}
					var targets = catalog.targets || ["backend"];
					if (targets.indexOf(target) === -1) {
						diagnostics.push({
							severity: "error",
							code: "BLOCK_NOT_AVAILABLE_ON_TARGET",
							line: line,
							block: name,
							target: target,
							availableTargets: targets,
							message: "Flow block " + name + " is not available on target " + target + ".",
							next: "Choose a block exposing target " + target + " or move this operation behind an explicit target boundary."
						});
					}
					var props = catalog.props || {};
					if (env.destinationContract) env.destinationContract.entries(catalog, node.props || node, node.out).forEach(function (entry) {
						var checked = env.destinationContract.validate(entry.value);
						if (!checked.valid) diagnostics.push({ severity: "error", code: checked.code, line: line,
							block: name, property: entry.property, path: entry.value, message: checked.message,
							hint: "Use a static named destination such as local.value. For grouping by a computed key, build an array of groups with {key, items} using list.filter/list.map, or use json.map/json.put with a declared map; do not assign local.map[current.key]." });
					});
					var acceptsAdditionalProperties = catalog.dynamicProperties === true || !!catalog.additionalProperties;
					var slotMap = {};
					function inline(value) {
					if(!value || typeof value!=="object")return;
					if(value.__flowBlock){walk([Object.assign({block:value.__flowBlock,props:value.properties || {},__flowScriptLine:line},value.metadata || {})],
						{known: context.known, current: context.current || name === "list.map"});return;}
					Object.keys(value).forEach(function(key){inline(value[key]);});
				}
				if(name==='list.map')inline((node.props || {}).select);
				env.flowScriptSlotNames(activeBlocks, node).forEach(function (slot) {
						slotMap[slot] = true;
					});
					businessPropertyKeys(node, Object.keys(slotMap), env).forEach(function (key) {
						var descriptor = props[key], value = flowScriptPropertyValue(node, key);
						if (descriptor && Array.isArray(descriptor.enum) && descriptor.enum.every(function(choice){return choice === null || typeof choice !== "object";}) && descriptor.kind !== "expression" &&
							!(typeof value === "string" && env.templateSyntax.hasExpression(value)) && descriptor.enum.indexOf(value) < 0) {
							diagnostics.push({severity:"error",code:"BLOCK_PROPERTY_ENUM_INVALID",line:line,block:name,property:key,
								message:name+"."+key+" received "+JSON.stringify(value)+"; allowed values: "+descriptor.enum.map(function(choice){return JSON.stringify(choice);}).join(", ")+".",
								hint:"Set "+key+" to one of "+descriptor.enum.map(function(choice){return JSON.stringify(choice);}).join(", ")+" from the block contract."});
						}
						if (name === "throw" && !props[key] && /^(path|stack|operation)$|^__|^convertigo\./.test(key)) {
							diagnostics.push({severity: "error", code: "RESERVED_ERROR_FIELD", line: line, block: name, property: key,
								message: "throw cannot set " + key + ": the error envelope owns this name.",
								hint: "Rename the field (line: ..., field: ...) or put it in details."});
						}
						if (!props[key] && !acceptsAdditionalProperties) {
							var propertyCandidates = env.flowScriptPropertyCandidates(props, key, 5);
							// $id, $nodes... with one dollar: an engine attribute that lost a dollar, usually in a
							// String.replace whose replacement text held $$ (a pattern that writes $).
							if (/^\$[A-Za-z]/.test(key)) {
								diagnostics.push({
									severity: "error",
									code: "UNKNOWN_BLOCK_PROPERTY",
									line: line,
									block: name,
									property: key,
									engineAttribute: "$" + key,
									message: "Unknown property " + key + " for Flow block " + name + ": engine attributes take two dollars, $" + key + ".",
									expected: expectedProps(block, env),
									candidates: propertyCandidates,
									next: "Write $" + key + ". Every block accepts the engine attributes ($$id, $$comment, $$disabled...). " +
										"When the code is built with String.replace or replaceAll, $$ in a replacement text writes a single $: " +
										"pass the replacement as a function (() => text), use split(oldText).join(newText), or send code-patch edits.",
									hint: "Use " + name + "({ $" + key + ": ..., " + expectedProps(block, env).map(function (prop) { return prop + ": ..."; }).join(", ") + " })."
								});
								return;
							}
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
					validateNodeExpressions(diagnostics, activeBlocks, node, name, env, context);
				}
				var output = String(node.out || (name === "set" && node.props && node.props.path) || "");
				var localName = /^local\.([A-Za-z_$][\w$]*)/.exec(output);
				if (localName) context.known.local[localName[1]] = true;
				["nodes", "then", "else", "fields"].forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") {
					walk(node[slot], {known: {input: context.known.input, local: Object.assign({}, context.known.local),
						config: context.known.config}, current: context.current || name === "forEach"});
					}
				});
			});
		}
		(definition.helpers || []).forEach(function (helper) {
			walk(helper.nodes || [], {known: {input: known.input, local: {}, config: known.config}, current: false});
		});
		walk(definition.nodes || [], {known: known, current: false});
		return diagnostics;
	}

	// Values use template-literal content: scan its expressions only. Literal text,
	// including paths such as fixtures/input.csv, is never an input access.
	function inputVariablesFromDefinition(blocks, definition, env) {
		var variables = {};
		function expression(text) {
			try {
				(env.inputExpressionTokens(String(text)) || []).forEach(function (token) {
					if (token.type !== "id") return;
					var match = /^input\.([A-Za-z_$][\w$]*)/.exec(String(token.value));
					if (match) variables[match[1]] = true;
				});
			} catch (_invalidExpressionAlreadyDiagnosed) {}
		}
		function value(any, raw) {
			if (typeof any === "string") {
				if (raw) expression(any);
				else templateExpressions(any, env).forEach(expression);
			} else if (Array.isArray(any)) any.forEach(function (item) { value(item, false); });
			else if (any && typeof any === "object") Object.keys(any).forEach(function (key) { value(any[key], false); });
		}
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = env.blockName(node), descriptor = blocks[name] && env.blockCatalog(blocks[name]) || {}, props = descriptor.props || {};
				Object.keys(node.props || {}).forEach(function (key) { value(node.props[key], props[key] && props[key].kind === "expression"); });
				["nodes", "then", "else", "fields"].forEach(function (slot) { if (Array.isArray(node[slot])) walk(node[slot]); });
			});
		}
		(definition.helpers || []).forEach(function (helper) { walk(helper.nodes); });
		walk(definition.nodes);
		return Object.keys(variables).sort();
	}

	function inputDefinitionsFromDefinition(definition) {
		var meta = flowMetaFromDefinition(definition);
		var inputs = meta.inputs || meta.input || definition && (definition.inputs || definition.input) || {};
		return inputs && typeof inputs === "object" ? inputs : {};
	}

	// A private Flow named test... (test_Orders, testOrders): the scenario of a test calls the same requestable several
	// times, in order, with other inputs or under other users; the repetition of its calls is not a missing list.map.
	function isPrivateTestFlow(definition, request) {
		var meta = flowMetaFromDefinition(definition);
		if (String(meta.accessibility || "").toLowerCase() !== "private") return false;
		var name = String(request.name || request.flowName || request.flowQName || request.qname || "");
		name = name.substring(name.lastIndexOf(".") + 1);
		return /^(?:test|Test|TEST)(?:_|[A-Z0-9]|$)/.test(name);
	}

	// The blocks that run a pattern (lib/text-pattern.js), the property holding it and the literal property that turns
	// it into a pattern when it is not always one.
	var PATTERN_PROPERTIES = {
		"text.match": { property: "pattern" },
		"text.replace": { property: "search", when: "regex" },
		"text.split": { property: "separator", when: "regex" }
	};

	function literalTrue(value) {
		return value === true || String(value) === "true";
	}

	// In a Flow a caller reaches over HTTP (public or hidden, or without _flow.accessibility: the accessibility of the
	// Flow, public by default, applies), a pattern built from data is refused unless the block says dynamicPattern: true;
	// a literal pattern that repeats a repetition is reported. Every pattern also runs under the execution budget.
	function patternDiagnostics(blocks, definition, env) {
		var accessibility = String(flowMetaFromDefinition(definition).accessibility || "public").toLowerCase();
		if (accessibility === "private") return [];
		var diagnostics = [], writes = {};
		// a local written once, by a set of a literal text (local.pattern = "^[0-9]+$"), is a literal pattern too
		function each(nodes, visit) {
			(nodes || []).forEach(function (node) {
				visit(node);
				["nodes", "then", "else", "fields"].forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") each(node[slot], visit);
				});
			});
		}
		function count(path, literal) {
			if (typeof path !== "string" || path.indexOf("local.") !== 0) return;
			var known = writes[path] || (writes[path] = { count: 0, literal: false });
			known.count++;
			known.literal = literal;
		}
		[definition.nodes].concat((definition.helpers || []).map(function (helper) { return helper.nodes; })).forEach(function (nodes) {
			each(nodes, function (node) {
				if (env.blockName(node) === "set") {
					var assigned = flowScriptPropertyValue(node, "value");
					count(flowScriptPropertyValue(node, "path"), typeof assigned === "string" && !env.templateSyntax.hasExpression(assigned));
				}
				count(node.out, false);
			});
		});
		function constantLocal(value) {
			var reference = /^\$\{\s*(local\.[A-Za-z_$][\w$]*)\s*\}$|^\{\{\s*(local\.[A-Za-z_$][\w$]*)\s*\}\}$/.exec(String(value).trim());
			var known = reference && writes[reference[1] || reference[2]];
			return !!(known && known.count === 1 && known.literal);
		}
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = env.blockName(node), rule = PATTERN_PROPERTIES[name];
				if (rule && (!rule.when || literalTrue(flowScriptPropertyValue(node, rule.when)))) {
					var value = flowScriptPropertyValue(node, rule.property), line = node.__flowScriptLine || 0;
					var dynamic = value !== undefined && value !== null && (typeof value !== "string" || env.templateSyntax.hasExpression(value) && !constantLocal(value));
					if (dynamic && !literalTrue(flowScriptPropertyValue(node, "dynamicPattern"))) {
						diagnostics.push({
							severity: "error",
							code: "TEXT_PATTERN_NOT_LITERAL",
							line: line,
							block: name,
							property: rule.property,
							message: name + "." + rule.property + " is a pattern built from data in a Flow callable over HTTP (" + accessibility +
								"): a caller could choose a pattern that backtracks for long.",
							hint: "Write the pattern as a literal text. To find a text given by the caller, use value.includes(text), startsWith or endsWith" +
								(name === "text.match" ? "" : ", or " + name + " without regex") + ". When the pattern is meant to come from data, set dynamicPattern: true on the block; it still runs under its budget (TEXT_PATTERN_TIMEOUT)."
						});
					} else if (typeof value === "string" && /\([^()]*[+*][^()]*\)(?:[+*]|\{\d+,\d*\})/.test(value)) {
						diagnostics.push({
							severity: "warning",
							code: "TEXT_PATTERN_NESTED_REPETITION",
							line: line,
							block: name,
							property: rule.property,
							message: name + "." + rule.property + " repeats a group that repeats, which may backtrack for long on a text of the caller (TEXT_PATTERN_TIMEOUT).",
							hint: "Repeat a single class instead, for example [a-z0-9-]+ rather than ([a-z0-9]+-?)+, or anchor the pattern on a separator."
						});
					}
				}
				["nodes", "then", "else", "fields"].forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") walk(node[slot]);
				});
			});
		}
		(definition.helpers || []).forEach(function (helper) { walk(helper.nodes || []); });
		walk(definition.nodes || []);
		return diagnostics;
	}

	function flowMetaFromDefinition(definition) {
		return definition && (definition.flow || definition._flow) || {};
	}

	function inputDeclarationSnippet(missing) {
		return "const _flow = { inputs: { " + missing.map(function (name) {
			return name + ": { type: \"string\", description: \"TODO\", default: \"\" }";
		}).join(", ") + " } }";
	}

	// _flow.accessibility declares who may call the Flow over HTTP: private (internal calls, MCP and administrators),
	// hidden (callable, not listed) or public. Without it, the accessibility property of the Flow applies.
	function accessibilityDiagnostics(definition) {
		var meta = definition && definition.flow || {};
		if (meta.accessibility === undefined || /^(private|hidden|public)$/i.test(String(meta.accessibility))) {
			return [];
		}
		return [{
			severity: "error",
			code: "FLOW_ACCESSIBILITY_INVALID",
			message: "_flow.accessibility must be \"private\", \"hidden\" or \"public\", not " + JSON.stringify(meta.accessibility) + ".",
			hint: "Keep internal, exploration, authoring and test Flows private; make public or hidden only the Flows a frontend calls."
		}];
	}

	function inputContractDiagnostics(blocks, definition, request, env, variables) {
		request = request || {};
		if (request.blockMode === true || request.block === true || request.skipInputContractWarnings === true) return [];
		var definitions = inputDefinitionsFromDefinition(definition);
		var diagnostics = [];
		var meta = flowMetaFromDefinition(definition);
		Object.keys(definitions).forEach(function (name) {
			var schema = definitions[name];
			if (!schema || schema.type !== "array" || schema.items !== undefined ||
					!Array.isArray(schema["default"]) || !schema["default"].some(function (item) { return item !== null && typeof item === "object"; })) return;
			diagnostics.push({
				severity: "warning", code: "FLOWSCRIPT_ARRAY_INPUT_ITEMS_REQUIRED", path: "_flow.inputs." + name,
				message: "input." + name + " has object/array defaults but no items schema. Convertigo variables can deliver each element as JSON text.",
				hint: 'Declare items: { type: "object" } (or the intended element schema). Untyped array elements intentionally keep their type; JSON-looking strings are not decoded implicitly.'
			});
		});
		variables = variables || inputVariablesFromDefinition(blocks, definition, env);
		var missing = variables.filter(function (name) { return definitions[name] === undefined; });
		if (missing.length) diagnostics.push({
			severity: request.strictInputContract === true ? "error" : "warning",
			code: "FLOWSCRIPT_INPUT_NOT_DECLARED", inputVariables: variables, missingInputs: missing,
			message: "FlowScript reads " + missing.map(function (name) { return "input." + name; }).join(", ") + " without declaring them in _flow.inputs.",
			hint: "Declare request inputs before the function so Studio, SDK callers, test cases and MCP agree on the Flow contract. Example: " + inputDeclarationSnippet(missing)
		});
		return diagnostics;
	}

	// The line of the source of each node of a definition, by its block and its id (the path the analysis names a node
	// with: a json.array and the set of its destination may share an id), the first one kept.
	function nodeLines(definition) {
		var lines = {};
		(function visit(value) {
			if (Object.prototype.toString.call(value) === "[object Array]") { value.forEach(visit); return; }
			if (!value || typeof value !== "object") return;
			var key = typeof value.block === "string" && (value.uid || value.id) ? value.block + "\n" + String(value.uid || value.id) : "";
			if (key && value.__flowScriptLine && !lines[key]) lines[key] = value.__flowScriptLine;
			Object.keys(value).forEach(function (key) { if (key !== "props") visit(value[key]); });
		})(definition && definition.nodes);
		return lines;
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
		var groups = {};
		function count(nodes) {
			walkDefinitionNodes(nodes, function (node) {
				var name = env.blockName(node);
				if (!watched[name]) {
					return;
				}
				// Four different requestables can be four necessary service operations.
				// Keep the existing conservative budget when the target is dynamic.
				var target = name === "requestable.call" ? flowScriptPropertyValue(node, "requestable") : null;
				target = typeof target === "string" && target && !/\$\{|\{\{/.test(target) ? target : null;
				var key = name + (target ? "\u0000" + target : "");
				groups[key] = { block: name, target: target };
				counts[key] = (counts[key] || 0) + 1;
				if (firstLine[key] === undefined) {
					firstLine[key] = node.__flowScriptLine || 0;
				}
			});
		}
		(definition.helpers || []).forEach(function (helper) {
			count(helper.nodes || []);
		});
		count(definition.nodes || []);
		return Object.keys(counts).filter(function (key) {
			return counts[key] > 3;
		}).map(function (key) {
			var name = groups[key].block;
			return {
				severity: "warning",
				code: "FLOWSCRIPT_REPEATED_EXTERNAL_CALLS",
				line: firstLine[key] || 0,
				block: name,
				count: counts[key],
				message: "FlowScript contains " + counts[key] + " " + name + " calls" + (groups[key].target ? " to " + groups[key].target : "") + ".",
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

	// The body of forEach, while and file.forEachLine is a callback: a bare return there is the block next (the next
	// item), as return in a JavaScript forEach callback. A return with a value there leaves the whole Flow instead, at
	// the first item that reaches it, which JavaScript would not do: code-set refuses it, an existing source gets a
	// warning and keeps running as before. next outside a loop body has no item to end. forEachChunk is not
	// concerned: there, return gives the value of the chunk.
	var ITEM_LOOPS = { forEach: true, "while": true, "file.forEachLine": true };
	function loopReturnDiagnostics(definition, request, env) {
		var diagnostics = [];
		var authoring = request && request.authoringCorrections === true;
		// The lines of a $$nodes body count from that body: the diagnostic gives the line of the outermost loop.
		function walk(nodes, loop) {
			(nodes || []).forEach(function (node) {
				if (!node || typeof node !== "object") return;
				var name = env.blockName(node);
				if (name === "return" && loop) {
					diagnostics.push({
						severity: authoring ? "error" : "warning",
						code: "FLOWSCRIPT_RETURN_VALUE_IN_LOOP",
						line: loop.line,
						block: "return",
						loop: loop.id,
						message: "return with a value inside " + loop.block + (loop.id ? " " + loop.id : "") + " leaves the whole Flow at the first item that reaches it; " +
							"in JavaScript, return in a forEach callback only ends that item.",
						next: "To skip the item, write return without value (the loop goes on with the next item). To leave with a value, keep it in a local " +
							"inside the loop, skip the other items with if, and return it after the loop."
					});
				}
				if (name === "next" && !loop) {
					diagnostics.push({
						severity: "error",
						code: "FLOW_NEXT_OUTSIDE_LOOP",
						line: node.__flowScriptLine || 0,
						block: "next",
						message: "next ends the current item of a loop, but this one is outside the body of forEach, while or file.forEachLine.",
						next: "Use return to leave the Flow, or move it into the body of the loop."
					});
				}
				if (name === "forEachChunk") return;
				var inner = loop || (ITEM_LOOPS[name] === true ? { block: name, id: String(node.id || ""), line: node.__flowScriptLine || 0 } : null);
				["nodes", "then", "else", "fields"].forEach(function (slot) {
					if (Object.prototype.toString.call(node[slot]) === "[object Array]") walk(node[slot], inner);
				});
			});
		}
		(definition.helpers || []).forEach(function (helper) { walk(helper.nodes, null); });
		walk(definition.nodes, null);
		return diagnostics;
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
			hint: "Move structural endpoints to project FlowEngine config, for example config.services.weather.forecastUrl. Reusable domain blocks should read shared config or accept simple typed values such as latitude, longitude, city or limit, not prebuilt URLs."
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

	function isActionableUnknownPropertyType(type) {
		type = String(type || "").trim();
		return type === "string" || type === "number" || type === "integer" || type === "boolean" || type === "object";
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

	// The runtime converts the value (type-conversion.js): a text to a number, any value to a text... A type that is not
	// a JSON type (requestable, path...) names a text.
	function convertibleSchemaType(expected, actual, env) {
		var known = ["string", "number", "integer", "boolean", "array", "object", "null", "any", "unknown"];
		var types = splitTypes(expected).map(function (type) {
			return known.indexOf(type) === -1 ? "string" : type;
		});
		return !!env.typeConversion && env.typeConversion.convertible(types.join("|"), actual);
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
			next: "If " + node.block + " is project-local and should accept the native value, patch its _meta.properties." + input.property + ".type to " + actual + "; otherwise convert " + input.path + " explicitly before the call.",
			hint: "Treat this as block contract feedback. Do not stringify just to silence the compiler unless the block really expects a string."
		};
	}

	function projectBlockUnknownPropertyDiagnostic(node, input, actual) {
		return {
			severity: "warning",
			code: "FLOWSCRIPT_PROJECT_BLOCK_PROPERTY_UNKNOWN",
			line: node.line || 0,
			block: node.block,
			property: input.property,
			path: input.path,
			actual: actual,
			message: node.block + "." + input.property + " is declared unknown but " + input.path + " is " + actual + ".",
			next: "Patch the project-local block _meta.properties." + input.property + ".type to " + actual + " so Studio pickers and future agents see the native contract.",
			hint: "Use type:\"any\" with a description only when the property is intentionally generic."
		};
	}

	function analysisDiagnostics(blocks, analysis, env) {
		var diagnostics = [];
		if (!analysis || !analysis.nodes) {
			return diagnostics;
		}
		analysis.nodes.forEach(function (node) {
			var block = blocks[node.block];
			var catalog = env.blockCatalog(block);
			var projectBlock = block && String(block.__flowOrigin || "") === "project";
			(node.inputs || []).forEach(function (input) {
				var descriptor = catalog.props && catalog.props[input.property] || {};
				var expected = String(descriptor.type || "").trim();
				if (!input.path) {
					return;
				}
				var schema = input.schema || env.schemaForSchemasPath(analysis.schemas || {}, input.path);
				if (!schema) {
					return;
				}
				var actual = env.schemaSimpleType(schema);
				if (descriptor.kind === "expression" && expected === "array" && input.propertyValueType !== "array") {
					// a JSON text or a single value converts to an array; an object is more likely the wrong path
					if (actual !== "object" && actual !== "null") {
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
				// a property declared any or unknown is generic on purpose: only a missing type asks for one
				if (projectBlock && expected === "" && isActionableUnknownPropertyType(actual)) {
					diagnostics.push(projectBlockUnknownPropertyDiagnostic(node, input, actual));
					return;
				}
				if (expected === "array" || compatibleSchemaType(expected, actual) || convertibleSchemaType(expected, actual, env)) {
					return;
				}
				diagnostics.push(propertyTypeMismatchDiagnostic(node, input, descriptor, actual));
			});
		});
		return diagnostics;
	}

	// The expressions of the nodes of a definition, each with its node: the raw text of an expression property, the
	// ${...} parts of the other values.
	function nodeExpressions(blocks, definition, env, visit) {
		function value(any, raw, node) {
			if (typeof any === "string") {
				if (raw) visit(any, node);
				else templateExpressions(any, env).forEach(function (text) { visit(text, node); });
			} else if (Array.isArray(any)) any.forEach(function (item) { value(item, false, node); });
			else if (any && typeof any === "object") Object.keys(any).forEach(function (key) { value(any[key], false, node); });
		}
		function isNodeList(list) {
			return Array.isArray(list) && list.length > 0 && list.every(function (item) {
				return item && typeof item === "object" && typeof item.block === "string";
			});
		}
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				var name = env.blockName(node), descriptor = blocks[name] && env.blockCatalog(blocks[name]) || {}, props = descriptor.props || {};
				Object.keys(node.props || {}).forEach(function (key) {
					if (isNodeList(node.props[key])) walk(node.props[key]);
					else value(node.props[key], props[key] && props[key].kind === "expression", node);
				});
				Object.keys(node).forEach(function (key) {
					if (key !== "props" && isNodeList(node[key])) walk(node[key]);
				});
			});
		}
		(definition.helpers || []).forEach(function (helper) { walk(helper.nodes); });
		walk(definition.nodes);
	}

	// The types a value of a path can have, as far as the source tells: its declaration for an input, the schema the
	// analysis gives otherwise. null is one of them for a nullable declaration or a schema whose type names it.
	function pathTypes(path, definition, analysis, env) {
		var types = [];
		function add(type) {
			String(type || "").split(/[|,]/).forEach(function (part) {
				part = part.trim();
				if (part && types.indexOf(part) === -1) types.push(part);
			});
		}
		function fromSchema(schema) {
			if (!schema || typeof schema !== "object") return;
			if (Array.isArray(schema.type)) schema.type.forEach(add);
			else if (schema.type !== undefined) add(schema.type);
			else if (schema.properties) add("object");
			(schema.anyOf || schema.oneOf || []).forEach(fromSchema);
			if (schema.nullable === true) add("null");
		}
		var input = /^input\.([A-Za-z_$][\w$]*)$/.exec(path);
		var declared = input ? inputDefinitionsFromDefinition(definition)[input[1]] : undefined;
		if (declared && typeof declared === "object") {
			fromSchema(declared);
			return types;
		}
		if (analysis && analysis.schemas && env.schemaForSchemasPath) {
			try { fromSchema(env.schemaForSchemasPath(analysis.schemas, path)); } catch (_unknownPath) {}
		}
		return types;
	}

	// The blocks writing each path of the definition (out, or the path of a set): what a diagnostic names as the origin
	// of a type.
	function pathProducers(definition, env) {
		var producers = {};
		function walk(nodes) {
			(nodes || []).forEach(function (node) {
				if (!node || typeof node !== "object") return;
				var name = env.blockName(node);
				var out = node.out || node.props && node.props.$$out;
				if (typeof out === "string" && out && name !== "set") producers[out] = name;
				Object.keys(node).forEach(function (key) {
					if (Array.isArray(node[key])) walk(node[key]);
				});
			});
		}
		walk(definition.nodes);
		return producers;
	}

	var SCOPE_PATH = /^(?:input|local|result|config|current|request)(?:\.[A-Za-z_$][\w$]*|\.\d+)+$/;

	// A value that can be null used as if it could not: a method called on it gives "" or false instead of failing, and
	// a comparison with "" is false for null. Both let an anonymous session through a check like
	// `if (local.email == "") ... else query(local.email.toLowerCase())`, where null turned into "" matches every row.
	function nullableValueDiagnostics(blocks, definition, analysis, env) {
		var diagnostics = [];
		var seen = {};
		var producers = null;
		function origin(path) {
			producers = producers || pathProducers(definition, env);
			return producers[path] ? " (" + producers[path] + " gives null)" : "";
		}
		function push(key, diagnostic) {
			if (seen[key]) return;
			seen[key] = true;
			diagnostics.push(diagnostic);
		}
		function nullable(path) {
			return pathTypes(path, definition, analysis, env).indexOf("null") !== -1;
		}
		nodeExpressions(blocks, definition, env, function (text, node) {
			var tokens;
			try { tokens = env.inputExpressionTokens(String(text)) || []; } catch (_invalidExpressionAlreadyDiagnosed) { return; }
			var line = node && node.__flowScriptLine || 0;
			tokens.forEach(function (token, index) {
				if (token.type !== "id") return;
				var value = String(token.value);
				var next = tokens[index + 1];
				if (next && next.type === "op" && next.value === "(") {
					var dot = value.lastIndexOf(".");
					var receiver = dot > 0 ? value.substring(0, dot) : "";
					var method = value.substring(dot + 1);
					if (!SCOPE_PATH.test(receiver) || !nullable(receiver)) return;
					push("method\n" + receiver + "\n" + method + "\n" + line, {
						severity: "warning",
						code: "FLOWSCRIPT_METHOD_ON_NULLABLE_VALUE",
						line: line,
						path: receiver,
						method: method,
						message: receiver + " can be null" + origin(receiver) + ": " + method + "() on null gives " +
							(/^(trim|toLowerCase|toUpperCase)$/.test(method) ? "\"\"" : /^(includes|startsWith|endsWith)$/.test(method) ? "false" : "undefined") +
							" instead of failing, so a missing value goes on as an empty one.",
						next: "Test it first (condition: !" + receiver + " is true for null, absent and \"\"), or give it a default: default(" + receiver + ", \"\")." + method + "()."
					});
					return;
				}
				if (!SCOPE_PATH.test(value)) return;
				var before = tokens[index - 1], after = tokens[index + 1], operator = null, other = null;
				if (after && after.type === "op" && /^[!=]==?$/.test(after.value)) {
					operator = after.value;
					other = tokens[index + 2];
				} else if (before && before.type === "op" && /^[!=]==?$/.test(before.value)) {
					operator = before.value;
					other = tokens[index - 2];
				}
				if (!operator || !other || other.type !== "string" || other.value !== "" || !nullable(value)) return;
				push("empty\n" + value + "\n" + line, {
					severity: "warning",
					code: "FLOWSCRIPT_NULLABLE_COMPARED_TO_EMPTY_TEXT",
					line: line,
					path: value,
					message: value + " can be null" + origin(value) + ": " + value + " " + operator + " \"\" is " +
						(operator.charAt(0) === "!" ? "true" : "false") + " for null, so null takes the branch of a value.",
					next: "Write !" + value + " (true for null, absent and \"\") instead of comparing with \"\"."
				});
			});
		});
		return diagnostics;
	}

	// A text method called on a list, or a list method on a text, where the source tells the type: an error on an input
	// declared array or string (the run converts it to that type, so the call always fails), a warning on a path whose
	// schema the analysis gives (without analysis, the inputs only; with it, the other paths only).
	function methodTypeDiagnostics(blocks, definition, analysis, env) {
		var methods = env.expressionMethods;
		if (!methods) return [];
		var textOnly = methods.text.filter(function (name) { return methods.list.indexOf(name) === -1; });
		var listOnly = methods.list.filter(function (name) { return methods.text.indexOf(name) === -1; });
		var diagnostics = [];
		var seen = {};
		nodeExpressions(blocks, definition, env, function (text, node) {
			var tokens;
			try { tokens = env.inputExpressionTokens(String(text)) || []; } catch (_invalidExpressionAlreadyDiagnosed) { return; }
			var line = node && node.__flowScriptLine || 0;
			tokens.forEach(function (token, index) {
				var next = tokens[index + 1];
				if (token.type !== "id" || !next || next.type !== "op" || next.value !== "(") return;
				var value = String(token.value);
				var dot = value.lastIndexOf(".");
				var receiver = dot > 0 ? value.substring(0, dot) : "";
				var method = value.substring(dot + 1);
				var family = textOnly.indexOf(method) !== -1 ? "text" : listOnly.indexOf(method) !== -1 ? "list" : "";
				if (!family || !SCOPE_PATH.test(receiver)) return;
				var input = /^input\.[A-Za-z_$][\w$]*$/.test(receiver);
				if (input === !!analysis) return;
				var types = pathTypes(receiver, definition, analysis, env).filter(function (type) { return type !== "null"; });
				var actual = types.length === 1 ? types[0] : "";
				var wrong = family === "text" ? actual === "array" : actual === "string";
				if (!wrong || seen[receiver + "\n" + method + "\n" + line]) return;
				seen[receiver + "\n" + method + "\n" + line] = true;
				var declared = input ? "declared " + actual : "its schema says " + actual;
				diagnostics.push({
					severity: input ? "error" : "warning",
					code: family === "text" ? "FLOWSCRIPT_TEXT_METHOD_ON_LIST" : "FLOWSCRIPT_LIST_METHOD_ON_TEXT",
					line: line,
					path: receiver,
					method: method,
					expected: family === "text" ? "string" : "array",
					actual: actual,
					message: method + " is a " + family + " method, but " + receiver + " is " + (family === "text" ? "a list" : "a text") + " (" + declared + ").",
					next: family === "text"
						? (method === "split" ? receiver + " is already a list: use it as is (list blocks, " + receiver + ".join(\",\") for a text)." :
							"Use a list method (" + methods.list.join(", ") + ") or a list block, or join the list into a text first.")
						: "Use a text method (" + textOnly.slice(0, 8).join(", ") + "...), or declare " + receiver + " as an array if it is a list."
				});
			});
		});
		return diagnostics;
	}

	function editDistance(left, right) {
		left = String(left || "").toLowerCase();
		right = String(right || "").toLowerCase();
		var previous = [];
		for (var j = 0; j <= right.length; j++) previous[j] = j;
		for (var i = 1; i <= left.length; i++) {
			var current = [i];
			for (j = 1; j <= right.length; j++) {
				current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
					previous[j - 1] + (left.charAt(i - 1) === right.charAt(j - 1) ? 0 : 1));
			}
			previous = current;
		}
		return previous[right.length];
	}

	// The assigned local name closest to a read one: a typo, or a name extended or shortened (page, pageAll).
	function nearestLocalName(name, assigned) {
		var lower = String(name).toLowerCase();
		var best = null;
		(assigned || []).forEach(function (candidate) {
			if (candidate === "*") return;
			var other = String(candidate).toLowerCase();
			var distance = editDistance(lower, other);
			var shorter = Math.min(lower.length, other.length);
			var related = shorter >= 3 && (other.indexOf(lower) === 0 || lower.indexOf(other) === 0);
			if (!related && distance > Math.max(2, Math.floor(Math.max(lower.length, other.length) / 3))) return;
			if (!best || distance < best.distance || distance === best.distance && candidate < best.name) {
				best = { name: candidate, distance: distance };
			}
		});
		return best ? best.name : "";
	}

	// A local read that no node of the Flow assigns: no assignment, $$out, write path or block output gives it a value,
	// so it is null at run time and the Flow goes on with it. A warning: a Rhino block could still write it by code.
	function unassignedLocalDiagnostics(analysis, code) {
		var codeLines = String(code || "").split(/\r?\n/);
		return (analysis && analysis.unassignedLocals || []).map(function (entry) {
			// the first line of the source that reads it, not one that assigns it in a helper: the nodes of a slot carry a
			// line of their slot
			var name = entry.name.replace(/\$/g, "\\$");
			var read = new RegExp("\\blocal\\." + name + "(?![\\w$])(?![^=]*=(?!=))");
			var line = 0;
			codeLines.some(function (text, index) {
				if (read.test(text)) {
					line = index + 1;
					return true;
				}
				return false;
			});
			(line ? [] : analysis.nodes || []).some(function (node) {
				if ((node.reads || []).indexOf(entry.path) !== -1 && node.line) {
					line = node.line;
					return true;
				}
				return false;
			});
			var nearest = nearestLocalName(entry.name, entry.assigned);
			var diagnostic = {
				severity: "warning",
				code: "FLOWSCRIPT_LOCAL_NOT_ASSIGNED",
				line: line,
				path: entry.path,
				message: "local." + entry.name + " is read (" + entry.path + ") but never assigned in this Flow: it is null when it runs" +
					(nearest ? ". Did you mean local." + nearest + "?" : "."),
				next: nearest
					? "Read local." + nearest + " instead, or assign local." + entry.name + " before reading it."
					: "Assign local." + entry.name + " before reading it (local." + entry.name + " = ..., or $$out of a block), or read the path that holds the value. A helper function or a project block keeps its own local: return the value from it."
			};
			if (nearest) {
				diagnostic.candidates = ["local." + nearest];
			}
			return diagnostic;
		});
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
		var definition = env.parseFlowScript(blocks, code, request.blockMode === true
			? { sourceVersion: request.sourceVersion } : request.nameSession ? {nameSession:request.nameSession} : undefined);
		var activeBlocks = env.blocksWithFlowHelpers ? env.blocksWithFlowHelpers(blocks, definition) : blocks;
		var native = null, nativeDiagnostics = [];
		if (request.blockMode !== true && env.nativePropertyContract) {
			try { native = env.nativePropertyContract().sourceMetadata(code, flowMetaFromDefinition(definition), env.typeConversion, false); }
			catch (error) {
				if (!Array.isArray(error.details)) throw error;
				nativeDiagnostics = error.details;
			}
		}
		if (native) definition.flow = native.value;
		var diagnostics = nativeDiagnostics.concat(validateDefinition(blocks, definition, env, request.target || "backend"));
		if (native) native.normalizations.forEach(function (note) {
			diagnostics.push({severity:"warning",code:note.code,line:note.line,path:note.property,property:note.property,
				actual:note.before,expected:note.after,message:note.property+" is normalized from "+JSON.stringify(note.before)+" to "+JSON.stringify(note.after)+". Accepted as equivalent; source text is unchanged."});
		});
		(nativeDiagnostics.length ? [] : accessibilityDiagnostics(definition)).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		if (request.blockMode !== true) patternDiagnostics(activeBlocks, definition, env).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		var inputVariables = inputVariablesFromDefinition(activeBlocks, definition, env);
		inputContractDiagnostics(activeBlocks, definition, request, env, inputVariables).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		var testFlow = request.blockMode !== true && isPrivateTestFlow(definition, request);
		repetitionStyleDiagnostics(definition, env).forEach(function (diagnostic) {
			if (testFlow) {
				diagnostic.hint = "A private test Flow runs one scenario step per call, in order: this stays a warning. " +
					"To call as another user, sign in with session.authenticate before the call (a project block taking the user, the requestable and its input keeps each step on one line).";
			} else if (request.authoringCorrections === true) {
				diagnostic.severity = "error";
			}
			diagnostics.push(diagnostic);
		});
		localConfigStyleDiagnostics(definition).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		loopReturnDiagnostics(definition, request, env).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		hardCodedServiceUrlDiagnostics(code).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		if (request.blockMode !== true) methodTypeDiagnostics(activeBlocks, definition, null, env).forEach(function (diagnostic) {
			diagnostics.push(diagnostic);
		});
		var clean = env.stripFlowScriptMetadata(definition);
		var source = env.sourceFromDefinition(clean);
		var ok = diagnostics.filter(function (diagnostic) {
			return diagnostic.severity === "error";
		}).length === 0;
		var analysis = ok && request.skipAnalysis !== true ? env.analyzeFlowSource(activeBlocks, source, request) : null;
		if (analysis) {
			var sourceLines=nodeLines(definition);
			(analysis.nodes || []).forEach(function(node){
				if(!node.line)node.line=sourceLines[node.block+'\n'+node.id] || (node.inlineParent && sourceLines[node.inlineParent.block+'\n'+node.inlineParent.id]) || 0;
			});
			analysisDiagnostics(activeBlocks, analysis, env).concat(unassignedLocalDiagnostics(analysis, code)).forEach(function (diagnostic) {
				diagnostics.push(diagnostic);
			});
			// a typed collection whose type the runtime refuses (json.array itemType: { type: ["string", "null"] }) is
			// refused by the check, not at the first run
			var invalidSchemas = (analysis.errors || []).filter(function (error) { return error && error.code === "INVALID_SCHEMA"; });
			if (invalidSchemas.length) {
				ok = false;
				var lines = nodeLines(definition);
				invalidSchemas.forEach(function (error) {
					diagnostics.push({ severity: "error", code: error.code, line: error.line || lines[error.block + "\n" + error.path] || 0, block: error.block,
						property: error.property, message: error.message });
				});
			}
			nullableValueDiagnostics(activeBlocks, definition, analysis, env).concat(
				methodTypeDiagnostics(activeBlocks, definition, analysis, env)).forEach(function (diagnostic) {
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
			inputVariables: inputVariables,
			diagnosticCount: report.diagnosticCount,
			diagnosticsShown: report.diagnosticsShown,
			hasMore: report.hasMore,
			diagnostics: report.diagnostics,
			analysis: analysis
		};
	}

	return {
		inputVariablesFromDefinition: inputVariablesFromDefinition,
		validateDefinition: validateDefinition,
		analysisDiagnostics: analysisDiagnostics,
		nullableValueDiagnostics: nullableValueDiagnostics,
		methodTypeDiagnostics: methodTypeDiagnostics,
		diagnosticReport: diagnosticReport,
		validateRequest: validateRequest
	};
})();
