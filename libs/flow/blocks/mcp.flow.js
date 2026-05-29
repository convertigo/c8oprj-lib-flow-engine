(function () {
	function jsonRpcResult(id, result) {
		return {
			jsonrpc: "2.0",
			id: id === undefined ? null : id,
			result: result
		};
	}

	function jsonRpcError(id, code, message, data) {
		return {
			jsonrpc: "2.0",
			id: id === undefined ? null : id,
			error: {
				code: code,
				message: String(message || "MCP Flow error"),
				data: data || null
			}
		};
	}

	function textContent(value) {
		return [{
			type: "text",
			text: JSON.stringify(value)
		}];
	}

	function tools() {
		return [
			{
				name: "flow-catalog",
				description: "List Flow blocks exposed by the current Flow engine.",
				inputSchema: {
					type: "object",
					properties: {}
				}
			},
			{
				name: "flow-analyze",
				description: "Analyze a Flow YAML source and return reads, writes and nodes.",
				inputSchema: {
					type: "object",
					properties: {
						flowSource: { type: "string" }
					},
					required: ["flowSource"]
				}
			},
			{
				name: "flow-context",
				description: "Return visible scope paths at a Flow node for Studio pickers or LLM guidance.",
				inputSchema: {
					type: "object",
					properties: {
						flowSource: { type: "string" },
						node: { type: "string" },
						path: { type: "string" },
						property: { type: "string" },
						mode: { type: "string" },
						include: {
							type: "array",
							items: { type: "string" }
						},
						detail: { type: "string" }
					},
					required: ["flowSource"]
				}
			},
			{
				name: "flow-schema-reset",
				description: "Delete learned schema files for a Flow or one Flow node so the next successful run learns them again.",
				inputSchema: {
					type: "object",
					properties: {
						flowName: { type: "string" },
						name: { type: "string" },
						node: { type: "string" },
						property: { type: "string" },
						out: { type: "string" }
					}
				}
			},
			{
				name: "flow-run",
				description: "Run a Flow YAML source with optional input and config objects.",
				inputSchema: {
					type: "object",
					properties: {
						flowSource: { type: "string" },
						input: { type: "object" },
						config: { type: "object" },
						includeFlow: { type: "boolean" },
						includeTrace: { type: "boolean" }
					},
					required: ["flowSource"]
				}
			},
			{
				name: "flow-list",
				description: "List project Flow sidecars.",
				inputSchema: {
					type: "object",
					properties: {}
				}
			},
			{
				name: "flow-get",
				description: "Read one project Flow sidecar.",
				inputSchema: {
					type: "object",
					properties: {
						name: { type: "string" }
					},
					required: ["name"]
				}
			},
			{
				name: "flow-set",
				description: "Validate and write one project Flow sidecar.",
				inputSchema: {
					type: "object",
					properties: {
						name: { type: "string" },
						flowSource: { type: "string" }
					},
					required: ["name", "flowSource"]
				}
			},
			{
				name: "flow-test",
				description: "Run a named project Flow sidecar or a provided Flow source.",
				inputSchema: {
					type: "object",
					properties: {
						name: { type: "string" },
						flowSource: { type: "string" },
						input: { type: "object" },
						config: { type: "object" },
						includeFlow: { type: "boolean" },
						includeTrace: { type: "boolean" }
					}
				}
			},
			{
				name: "flow-block-list",
				description: "List Flow blocks with their origin.",
				inputSchema: {
					type: "object",
					properties: {}
				}
			},
			{
				name: "flow-block-get",
				description: "Read one Flow block source.",
				inputSchema: {
					type: "object",
					properties: {
						name: { type: "string" }
					},
					required: ["name"]
				}
			},
			{
				name: "flow-block-create",
				description: "Create or replace a project-local Flow block.",
				inputSchema: {
					type: "object",
					properties: {
						name: { type: "string" },
						source: { type: "string" },
						overwrite: { type: "boolean" }
					},
					required: ["name", "source"]
				}
			},
			{
				name: "flow-block-test",
				description: "Run a Flow YAML source, typically to validate a custom block.",
				inputSchema: {
					type: "object",
					properties: {
						flowSource: { type: "string" },
						input: { type: "object" },
						config: { type: "object" },
						includeFlow: { type: "boolean" },
						includeTrace: { type: "boolean" }
					},
					required: ["flowSource"]
				}
			}
		];
	}

	function toolResult(value) {
		return {
			content: textContent(value),
			structuredContent: value
		};
	}

	function callTool(ctx, name, args) {
		args = args || {};
		switch (name) {
		case "flow-catalog":
			return toolResult(ctx.catalog());
		case "flow-analyze":
			return toolResult(ctx.analyzeFlowSource(args.flowSource || "", args));
		case "flow-context":
			return toolResult(ctx.contextFlowSource(args));
		case "flow-schema-reset":
			return toolResult(ctx.schemaReset(args));
		case "flow-run":
			var execution = ctx.runFlowSource(args.flowSource || "", args.config || {}, {
				input: args.input || {},
				includeTrace: args.includeTrace === true
			});
			if (args.includeFlow !== true) {
				delete execution.flow;
			}
			if (args.includeTrace !== true) {
				delete execution.trace;
			}
			return toolResult(execution);
		case "flow-list":
			return toolResult(ctx.flowList());
		case "flow-get":
			return toolResult(ctx.flowGet(args.name));
		case "flow-set":
			return toolResult(ctx.flowSet(args.name, args.flowSource || ""));
		case "flow-test":
			var flowTest = ctx.flowTest(args);
			if (args.includeFlow !== true) {
				delete flowTest.flow;
			}
			if (args.includeTrace !== true) {
				delete flowTest.trace;
			}
			return toolResult(flowTest);
		case "flow-block-list":
			return toolResult(ctx.blockList());
		case "flow-block-get":
			return toolResult(ctx.blockGet(args.name));
		case "flow-block-create":
			return toolResult(ctx.blockCreate(args.name, args.source || "", args.overwrite === true));
		case "flow-block-test":
			var test = ctx.blockTest(args.flowSource || "", args.config || {}, {
				input: args.input || {},
				includeTrace: args.includeTrace === true
			});
			if (args.includeFlow !== true) {
				delete test.flow;
			}
			if (args.includeTrace !== true) {
				delete test.trace;
			}
			return toolResult(test);
		default:
			throw new Error("Unknown Flow MCP tool: " + name);
		}
	}

	function handle(ctx, request) {
		var id = request.id;
		switch (request.method) {
		case "initialize":
			return jsonRpcResult(id, {
				protocolVersion: "2025-06-18",
				serverInfo: {
					name: "convertigo-flow-mcp",
					version: "0.1.0"
				},
				capabilities: {
					tools: {}
				}
			});
		case "tools/list":
			return jsonRpcResult(id, { tools: tools() });
		case "tools/call":
			try {
				return jsonRpcResult(id, callTool(ctx, request.params && request.params.name,
					request.params && request.params.arguments));
			} catch (e) {
				return jsonRpcError(id, -32000, String(e.message || e), {
					code: String(e.code || "FLOW_MCP_TOOL_ERROR"),
					hint: e.hint ? String(e.hint) : ""
				});
			}
		default:
			return jsonRpcError(id, -32601, "Method not found: " + request.method);
		}
	}

	function parseRequest(value) {
		value = value || {};
		if (typeof value === "string") {
			return JSON.parse(value);
		}
		return value;
	}

	return {
		name: "mcp.flow",

		catalog: function () {
			return {
				name: "mcp.flow",
				icon: "mdi:tools",
				props: {
					request: { kind: "expression", type: "object" },
					out: { kind: "path", mode: "write" }
				},
				description: "Handles a small MCP JSON-RPC request for Flow catalog, analyze and run."
			};
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var request = parseRequest(ctx.expr(props.request || "config.request"));
			if (Object.prototype.toString.call(request) === "[object Array]") {
				return request.map(function (item) {
					return handle(ctx, item);
				});
			}
			return handle(ctx, request);
		}
	};
}())
