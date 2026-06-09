(function () {
	function create(env) {
		env = env || {};
		var blockName = env.blockName;
		var nodeProps = env.nodeProps;
		var raise = env.raise;
		var nodePath = env.nodePath;
		var normalizeTree = env.normalizeTree;
		var expandFlowDefinition = env.expandFlowDefinition;
		var parseSource = env.parseSource;
		var sourceForFlowRequest = env.sourceForFlowRequest;
		var loadProjectEngineDefinition = env.loadProjectEngineDefinition;
		var createRunContext = env.createRunContext;
		var assertNoRuntimeHandle = env.assertNoRuntimeHandle;
		var learnResultSchema = env.learnResultSchema;
		var schemaSummary = env.schemaSummary;
		var closeRuntimeHandles = env.closeRuntimeHandles;
		var snapshot = env.snapshot;

	function executeNode(ctx, node) {
		if (ctx.stopped || !node || node.disabled) {
			return undefined;
		}
		var name = blockName(node);
		var block = ctx.blocks[name];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, node, "Use flow-catalog or blockList to list supported blocks.");
		}
		var props = nodeProps(node);
		var result = block.run(ctx, node);
		if (props.out && result !== undefined) {
			ctx.write(props.out, result);
		}
		ctx.trace(node, name, result);
		return result;
	}

	function callBlock(ctx, name, props, options) {
		name = String(name || "");
		options = options || {};
		if (!name) {
			raise("MISSING_BLOCK_NAME", "ctx.callBlock requires a block name.");
		}
		var block = ctx.blocks[name];
		if (!block) {
			raise("UNKNOWN_BLOCK", "Unknown Flow block: " + name, null, "Use flow-catalog or blockList to list supported blocks.");
		}
		if (typeof block.run !== "function") {
			raise("INVALID_BLOCK", "Flow block has no runnable implementation: " + name);
		}
		var node = {
			block: name,
			props: normalizeTree(props || {})
		};
		if (options.id) {
			node.id = String(options.id);
		}
		if (!node.id) {
			node.id = "call:" + name;
		}
		var previousInput = ctx.scopes.input;
		var previousProps = ctx.scopes.props;
		var previousLocal = ctx.scopes.local;
		var previousCurrent = ctx.scopes.current;
		var previousReturned = ctx.returned;
		var previousStopped = ctx.stopped;
		ctx.scopes.props = nodeProps(node);
		ctx.scopes.input = ctx.scopes.props;
		ctx.scopes.local = {};
		ctx.returned = undefined;
		ctx.stopped = false;
		try {
			var nodeProperties = nodeProps(node);
			var result = block.run(ctx, node);
			if (ctx.returned !== undefined) {
				result = ctx.returned;
			}
			if (nodeProperties.out && result !== undefined) {
				ctx.write(nodeProperties.out, result);
			}
			if (options.trace !== false) {
				ctx.trace(node, name, result);
			}
			return result;
		} finally {
			ctx.scopes.input = previousInput;
			ctx.scopes.props = previousProps;
			ctx.scopes.local = previousLocal;
			ctx.scopes.current = previousCurrent;
			ctx.returned = previousReturned;
			ctx.stopped = previousStopped;
		}
	}

	function executeNodes(ctx, nodes) {
		var result;
		nodes = nodes || [];
		for (var i = 0; i < nodes.length; i++) {
			if (ctx.stopped) {
				break;
			}
			var node = nodes[i];
			result = executeNode(ctx, node);
		}
		return result;
	}

	function runFlowRequest(request, blocks) {
		var definition = expandFlowDefinition(blocks, parseSource(sourceForFlowRequest(request, blocks)));
		var projectEngine = loadProjectEngineDefinition();
		var ctx = createRunContext(request, definition, blocks, projectEngine);
		try {
			ctx.runNodes(definition.nodes || []);
			var result = ctx.returned === undefined ? ctx.scopes.result : ctx.returned;
			assertNoRuntimeHandle(result, "result");
			var resultSchema = learnResultSchema(request, definition, result);
			if (resultSchema && resultSchema.learned === true) {
				ctx.schemaUpdates.push({
					scope: "result",
					node: "return",
					block: "return",
					property: "out",
					file: resultSchema.file,
					schema: schemaSummary(resultSchema.schema),
					message: "Learned final result schema. Future output-schema calls can use it."
				});
			}
			closeRuntimeHandles(ctx);
			var out = {
				ok: true,
				result: snapshot(result)
			};
			if (ctx.schemaUpdates.length > 0) {
				out.schemaUpdates = snapshot(ctx.schemaUpdates);
			}
			if (request.includeFlow === true || request.includeLocal === true) {
				out.local = snapshot(ctx.scopes.local);
			}
			if (request.includeTrace !== false) {
				out.trace = snapshot(ctx.scopes.trace);
			}
			return out;
		} finally {
			closeRuntimeHandles(ctx);
		}
	}

		return {
			executeNode: executeNode,
			callBlock: callBlock,
			executeNodes: executeNodes,
			runFlowRequest: runFlowRequest
		};
	}

	return {
		executeNode: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).executeNode.apply(null, args);
		},
		callBlock: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).callBlock.apply(null, args);
		},
		executeNodes: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).executeNodes.apply(null, args);
		},
		runFlowRequest: function () {
			var args = Array.prototype.slice.call(arguments);
			var env = args.pop();
			return create(env).runFlowRequest.apply(null, args);
		}
	};
}())
