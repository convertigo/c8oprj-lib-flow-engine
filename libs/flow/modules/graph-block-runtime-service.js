(function () {
	function create(env) {
		var File = env.File;
		var FileUtils = env.FileUtils;
		var normalizeTree = env.normalizeTree;
		var raise = env.raise;
		var blockImplementation = env.blockImplementation;
		var validateBlockImplementationSource = env.validateBlockImplementationSource;
		var validateBlockHooksSource = env.validateBlockHooksSource;
		var parseYamlSource = env.parseYamlSource;
		var graphBlockCatalog = env.graphBlockCatalog;
		var blockName = env.blockName;
		var blockCatalog = env.blockCatalog;
		var nodeProps = env.nodeProps;
		var summaryText = env.summaryText;
		var renderTemplateTree = env.renderTemplateTree;
		var readScopePath = env.readScopePath;
		var graphBlockStackLabel = env.graphBlockStackLabel;
		var compileTemplateTree = env.compileTemplateTree;
		var nanoTime = env.nanoTime || function () { return 0; };

	function profileDuration(started) {
		return Number(nanoTime() - started) / 1000000;
	}

	function profileCount(ctx, name) {
		if (!ctx || !ctx.profile) {
			return;
		}
		var hotPath = ctx.profile.hotPath || (ctx.profile.hotPath = {});
		hotPath[name] = Number(hotPath[name] || 0) + 1;
	}

	function profileAdd(ctx, name, started) {
		if (!ctx || !ctx.profile) {
			return;
		}
		var hotPath = ctx.profile.hotPath || (ctx.profile.hotPath = {});
		hotPath[name] = Number(hotPath[name] || 0) + profileDuration(started);
	}

	function blockImplementationFile(definition, file, config) {
		config = config || blockImplementation(definition);
		var filename = String(config.file || config.source || "").trim();
		if (!filename) {
			raise("MISSING_BLOCK_IMPLEMENTATION", "Block \"" + definition.name + "\" needs an implementation file.",
				null, "Use implementation.file in the block YAML.");
		}
		var implementationFile = new File(filename);
		if (!implementationFile.isAbsolute()) {
			implementationFile = new File(file.getParentFile(), filename);
		}
		if (!implementationFile.isFile()) {
			raise("UNKNOWN_BLOCK_IMPLEMENTATION", "Unknown block implementation file: " + implementationFile.getAbsolutePath());
		}
		return implementationFile;
	}

	function loadBlockScript(file, label) {
		var source = String(FileUtils.readFileToString(file, "UTF-8"));
		var script = env.evalCompiledSource(source, env.canonicalPath(file), env.fileFingerprint(file));
		if (!script || typeof script !== "object") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Invalid " + label + ": " + file.getAbsolutePath(),
				null, "The script must evaluate to an object.");
		}
		script.__flowFile = String(file.getAbsolutePath());
		return script;
	}

	function loadRhinoBlockImplementation(definition, file) {
		var implementation = blockImplementation(definition);
		if (definition.__rhinoCode !== undefined && definition.__rhinoCode !== null) {
			var inlineScript = validateBlockImplementationSource(definition.__flowBlockId || definition.name, definition.__rhinoCode);
			var inlineEntry = String(implementation.entry || "run");
			if (typeof inlineScript[inlineEntry] !== "function") {
				raise("INVALID_BLOCK_IMPLEMENTATION", "Inline block implementation has no " + inlineEntry + "(ctx, node): " + file.getAbsolutePath());
			}
			return {
				file: file,
				script: inlineScript,
				entry: inlineEntry,
				inline: true
			};
		}
		var scriptFile = blockImplementationFile(definition, file, implementation);
		var script = loadBlockScript(scriptFile, "block implementation");
		["catalog", "name", "private", "displayName", "analyze", "analyzeShallow"].forEach(function (key) {
			if (script[key] !== undefined) {
				raise("INVALID_BLOCK_IMPLEMENTATION", "Block runtime implementation must not define " + key + ": " + scriptFile.getAbsolutePath(),
					null, "Move static metadata to _meta in *.block.js and dynamic display/analyze code to hooks.file.");
			}
		});
		var entry = String(implementation.entry || "run");
		if (typeof script[entry] !== "function") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Block implementation has no " + entry + "(ctx, node): " + scriptFile.getAbsolutePath());
		}
		return {
			file: scriptFile,
			script: script,
			entry: entry
		};
	}

	function validateBlockFlowImplementationDefinition(name, definition) {
		definition = normalizeTree(definition || {});
		if (!definition.version) {
			definition.version = 1;
		}
		if (!definition.nodes) {
			definition.nodes = [];
		}
		if (Object.prototype.toString.call(definition.nodes) !== "[object Array]") {
			raise("INVALID_BLOCK_IMPLEMENTATION", "Flow block implementation \"" + name + "\" must define a nodes array.");
		}
		return definition;
	}

	function validateBlockFlowImplementationSource(name, source) {
		return validateBlockFlowImplementationDefinition(name, parseYamlSource(source, "version: 1\nnodes: []\n"));
	}

	function loadFlowBlockImplementation(definition, file) {
		var implementation = blockImplementation(definition);
		var flowFile = blockImplementationFile(definition, file, implementation);
		var source = String(FileUtils.readFileToString(flowFile, "UTF-8"));
		return {
			file: flowFile,
			definition: validateBlockFlowImplementationSource(definition.name, source)
		};
	}

	function loadBlockHooks(definition, file) {
		var hooks = definition.hooks;
		if (!hooks) {
			return {};
		}
		if (typeof hooks === "string") {
			hooks = { file: hooks };
		}
		hooks = normalizeTree(hooks);
		if (!hooks.file) {
			return hooks;
		}
		var hookFile = blockImplementationFile(definition, file, hooks);
		var script = loadBlockScript(hookFile, "block hooks");
		Object.keys(hooks).forEach(function (key) {
			if (key !== "file" && script[key] === undefined) {
				script[key] = hooks[key];
			}
		});
		return script;
	}


	function graphBlockDisplayName(definition, node) {
		var props = nodeProps(node);
		var display = definition.displayName || definition.display || "";
		if (display) {
			return summaryText(renderTemplateTree({
				scopes: {
					request: {},
					input: props,
					config: {},
					result: {},
					trace: {},
					current: null,
					local: {}
				},
				read: function (path) {
					return readScopePath(this.scopes, path);
				}
			}, display));
		}
		return props.out ? definition.name + " -> " + props.out : definition.name;
	}

	function resolveGraphBlockProp(ctx, descriptor, value) {
		descriptor = descriptor || {};
		var kind = descriptor.kind || descriptor.type || "";
		var mode = descriptor.mode || "";
		if (value === undefined && descriptor["default"] !== undefined) {
			value = descriptor["default"];
		}
		if (kind === "expression") {
			if (value && typeof value === "object") {
				return ctx.literal(value);
			}
			return ctx.expr(value);
		}
		if (kind === "template") {
			return ctx.template(value);
		}
		if (kind === "literal" || kind === "text" || kind === "schema" || kind === "secret") {
			return ctx.literal(value);
		}
		if (kind === "path" && mode === "write") {
			return value;
		}
		if (kind === "value" || kind === "") {
			return ctx.template(ctx.literal(value));
		}
		return ctx.template(ctx.literal(value));
	}

	function compileGraphBlockProp(descriptor, value) {
		descriptor = descriptor || {};
		var kind = descriptor.kind || descriptor.type || "";
		var mode = descriptor.mode || "";
		if (value === undefined && descriptor["default"] !== undefined) {
			value = descriptor["default"];
		}
		if (kind === "template" || kind === "value" || kind === "") {
			if (typeof compileTemplateTree === "function") {
				return compileTemplateTree(value);
			}
			return function (ctx) { return resolveGraphBlockProp(ctx, descriptor, value); };
		}
		if (kind === "expression") {
			return value && typeof value === "object"
				? function (ctx) { return ctx.literal(value); }
				: function (ctx) { return ctx.expr(value); };
		}
		if (kind === "literal" || kind === "text" || kind === "schema" || kind === "secret") {
			return function (ctx) { return ctx.literal(value); };
		}
		if (kind === "path" && mode === "write") {
			return function () { return value; };
		}
		return typeof compileTemplateTree === "function"
			? compileTemplateTree(value)
			: function (ctx) { return resolveGraphBlockProp(ctx, descriptor, value); };
	}

	function compileGraphBlockProps(node, catalog) {
		var raw = ctxPropsForCompile(node);
		var descriptors = catalog.props || {};
		var fields = [];
		Object.keys(descriptors).forEach(function (key) {
			fields.push({ key: key, resolve: compileGraphBlockProp(descriptors[key], raw[key]) });
		});
		Object.keys(raw).forEach(function (key) {
			if (descriptors[key] === undefined) {
				fields.push({ key: key, resolve: function () { return raw[key]; } });
			}
		});
		return function (ctx) {
			var props = {};
			for (var i = 0; i < fields.length; i++) {
				props[fields[i].key] = fields[i].resolve(ctx);
			}
			return props;
		};
	}

	function ctxPropsForCompile(node) {
		var prepared = node && node.__flowRuntimeNode;
		return prepared && prepared.props ? prepared.props : nodeProps(node);
	}

	function resolveGraphBlockProps(ctx, node, catalog) {
		var prepared = node && node.__flowRuntimeNode;
		if (prepared && prepared.graphPropsCatalog === catalog && prepared.graphPropsResolver) {
			if (ctx.profile) {
				var hits = ctx.profile.hotPath || (ctx.profile.hotPath = {});
				hits.graphBlockPreparedPropsHits = Number(hits.graphBlockPreparedPropsHits || 0) + 1;
			}
			return prepared.graphPropsResolver(ctx);
		}
		var resolver = compileGraphBlockProps(node, catalog);
		if (prepared) {
			prepared.graphPropsCatalog = catalog;
			prepared.graphPropsResolver = resolver;
		}
		if (ctx.profile) {
			var misses = ctx.profile.hotPath || (ctx.profile.hotPath = {});
			misses.graphBlockPreparedPropsMisses = Number(misses.graphBlockPreparedPropsMisses || 0) + 1;
		}
		return resolver(ctx);
	}

	function runGraphBlock(ctx, node, block) {
		var profiled = !!ctx.profile;
		var totalStarted = profiled ? nanoTime() : 0;
		profileCount(ctx, "graphBlockCalls");
		var catalogStarted = profiled ? nanoTime() : 0;
		var catalog = block.__graphRuntimeCatalog || blockCatalog(block);
		profileAdd(ctx, "graphBlockCatalogMs", catalogStarted);
		var graphName = String(block && block.name || blockName(node) || "");
		ctx.graphBlockStack = ctx.graphBlockStack || [];
		var maxDepth = Number(ctx.maxGraphBlockDepth || 128);
		if (ctx.graphBlockStack.length >= maxDepth) {
			var stack = ctx.graphBlockStack.concat([graphName]);
			raise("FLOW_GRAPH_BLOCK_DEPTH_LIMIT",
				"Composite Flow block call depth exceeded " + maxDepth + " calls: " + graphBlockStackLabel(stack),
				node,
				"Make the recursion converge, lower the input size, or raise maxGraphBlockDepth for this run.");
		}
		var previousInput = ctx.scopes.input;
		var previousProps = ctx.scopes.props;
		var previousLocal = ctx.scopes.local;
		var previousResult = ctx.scopes.result;
		var previousCurrent = ctx.scopes.current;
		var previousReturned = ctx.returned;
		var previousStopped = ctx.stopped;
		if (graphName) {
			ctx.graphBlockStack.push(graphName);
		}
		var propsStarted = profiled ? nanoTime() : 0;
		var resolvedProps = resolveGraphBlockProps(ctx, node, catalog);
		profileAdd(ctx, "graphBlockResolvePropsMs", propsStarted);
		var frameStarted = profiled ? nanoTime() : 0;
		ctx.scopes.props = resolvedProps;
		ctx.scopes.input = ctx.scopes.props;
		ctx.scopes.local = {};
		ctx.scopes.result = {};
		ctx.returned = undefined;
		ctx.stopped = false;
		profileAdd(ctx, "graphBlockFrameEnterMs", frameStarted);
		try {
			var executeStarted = profiled ? nanoTime() : 0;
			try {
				var result = ctx.runNodes(block.__graphDefinition.nodes || []);
				if (ctx.returned !== undefined) {
					result = ctx.returned;
				} else if (ctx.scopes.result && Object.keys(ctx.scopes.result).length > 0) {
					result = ctx.scopes.result;
				}
				return result;
			} finally {
				profileAdd(ctx, "graphBlockExecuteMs", executeStarted);
			}
		} finally {
			var restoreStarted = profiled ? nanoTime() : 0;
			ctx.scopes.input = previousInput;
			ctx.scopes.props = previousProps;
			ctx.scopes.local = previousLocal;
			ctx.scopes.result = previousResult;
			ctx.scopes.current = previousCurrent;
			ctx.returned = previousReturned;
			ctx.stopped = previousStopped;
			if (graphName) {
				ctx.graphBlockStack.pop();
			}
			profileAdd(ctx, "graphBlockFrameRestoreMs", restoreStarted);
			profileAdd(ctx, "graphBlockTotalMs", totalStarted);
		}
	}

	function analyzeGraphBlockDescriptor(ctx, node, catalog) {
		var raw = nodeProps(node);
		Object.keys(catalog.props || {}).forEach(function (key) {
			var descriptor = catalog.props[key] || {};
			var kind = String(descriptor.kind || descriptor.type || "");
			var mode = String(descriptor.mode || "");
			if (kind === "path" && mode === "write") {
				var value = raw[key] !== undefined ? raw[key] : descriptor["default"];
				if (value !== undefined && value !== null && String(value) !== "") {
					ctx.addPath(String(value));
				}
			}
		});
	}

	function graphBlockFromDefinition(definition, file, origin, provider) {
		var catalog = graphBlockCatalog(definition);
		var implementation = blockImplementation(definition);
		var runtime = implementation.runtime;
		var blockId = String(definition.__flowBlockId || definition.blockId || definition.name || "");
		var rhino = runtime === "rhino" ? loadRhinoBlockImplementation(definition, file) : null;
		var flow = runtime === "flow" ? (definition.__graphDefinition ? {
			definition: definition.__graphDefinition,
			file: file
		} : loadFlowBlockImplementation(definition, file)) : null;
		var hooks = loadBlockHooks(definition, file);
		var block = {
			name: blockId,
			"private": definition["private"] === true,
			visibility: definition.visibility || "",
			__blockDefinition: definition,
			__graphRuntimeCatalog: catalog,
			__blockImplementationRuntime: runtime,
			catalog: function () {
				return normalizeTree(catalog);
			},
			displayName: function (node) {
				if (typeof hooks.displayName === "function") {
					return hooks.displayName(node);
				}
				return graphBlockDisplayName(definition, node);
			},
			analyze: function (ctx, node) {
				if (typeof hooks.analyze === "function") {
					return hooks.analyze(ctx, node);
				}
				analyzeGraphBlockDescriptor(ctx, node, catalog);
				if (runtime === "flow" && ctx.withGraphBlock) {
					ctx.withGraphBlock(node, block, function () {
						ctx.visitNodes(block.__graphDefinition.nodes || []);
					});
				} else if (runtime === "flow") {
					ctx.visitNodes(block.__graphDefinition.nodes || []);
				}
			},
			analyzeShallow: function (ctx, node) {
				if (typeof hooks.analyzeShallow === "function") {
					return hooks.analyzeShallow(ctx, node);
				}
				analyzeGraphBlockDescriptor(ctx, node, catalog);
			},
			run: function (ctx, node) {
				if (rhino) {
					return rhino.script[rhino.entry](ctx, node);
				}
				return runGraphBlock(ctx, node, block);
			}
		};
		if (flow) {
			block.__graphDefinition = flow.definition;
		}
		block.__flowOrigin = origin;
		block.__flowProvider = provider || origin || "unknown";
		block.__flowFile = String(file.getAbsolutePath());
		block.__flowFormat = definition.__flowCode ? "flowscript-block" : "descriptor-block";
		if (definition.__flowCode) {
			block.__flowCode = String(definition.__flowCode);
		}
		if (rhino) {
			if (rhino.inline) {
				block.__rhinoCode = String(definition.__rhinoCode || "");
				block.__flowImplementationFile = "";
			} else {
				block.__flowImplementationFile = String(rhino.file.getAbsolutePath());
			}
		} else if (flow) {
			block.__flowImplementationFile = definition.__flowCode ? "" : String(flow.file.getAbsolutePath());
		}
		if (hooks.__flowFile) {
			block.__flowHooksFile = String(hooks.__flowFile);
		}
		return block;
	}

	function loadGraphBlockFile() {
		raise("UNSUPPORTED_BLOCK_STORAGE", "Legacy *.block.yaml Flow block descriptors are no longer supported.",
			null, "Use canonical libs/flow/blocks/**/*.block.js files.");
	}


		return {
			validateBlockFlowImplementationSource: validateBlockFlowImplementationSource,
			graphBlockFromDefinition: graphBlockFromDefinition,
			loadGraphBlockFile: loadGraphBlockFile
		};
	}

	return {
		validateBlockFlowImplementationSource: function (name, source, env) {
			return create(env).validateBlockFlowImplementationSource(name, source);
		},
		graphBlockFromDefinition: function (definition, file, origin, provider, env) {
			return create(env).graphBlockFromDefinition(definition, file, origin, provider);
		},
		loadGraphBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return create(env).loadGraphBlockFile(blocks, file, origin, provider, blocksDir);
		}
	};
}())
