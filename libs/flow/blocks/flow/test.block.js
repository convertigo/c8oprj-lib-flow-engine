const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:test-tube",
  "description": "Runs a named project Flow sidecar, source or definition.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow sidecar name."
    },
    "flowName": {
      "label": "flowName",
      "kind": "text",
      "type": "string",
      "description": "Alias for name."
    },
    "flowSource": {
      "label": "flowSource",
      "kind": "text",
      "type": "string",
      "description": "Flow YAML source to run."
    },
    "definition": {
      "label": "definition",
      "kind": "literal",
      "type": "object",
      "description": "Flow definition object to run."
    },
    "input": {
      "label": "input",
      "kind": "template",
      "type": "object",
      "description": "Input scope."
    },
    "config": {
      "label": "config",
      "kind": "template",
      "type": "object",
      "description": "Config scope override."
    },
    "includeFlow": {
      "label": "includeFlow",
      "kind": "literal",
      "type": "boolean",
      "description": "Include final flow scope in the response."
    },
    "includeTrace": {
      "label": "includeTrace",
      "kind": "literal",
      "type": "boolean",
      "description": "Include execution trace in the response."
    },
    "includeFullTrace": {
      "label": "includeFullTrace",
      "kind": "literal",
      "type": "boolean",
      "description": "MCP authoring hint: return full per-node trace values instead of a compact preview."
    },
    "includeFullResult": {
      "label": "includeFullResult",
      "kind": "literal",
      "type": "boolean",
      "description": "MCP authoring hint: request a full result. Large results still require detail full and allowHugeResult."
    },
    "allowHugeResult": {
      "label": "allowHugeResult",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Explicitly allow a result larger than maxResultChars, only when detail is full. Use rarely."
    },
    "maxResultChars": {
      "label": "maxResultChars",
      "kind": "literal",
      "type": "number",
      "description": "MCP authoring hint: compact result payloads larger than this JSON size. Compact responses cap this value."
    },
    "maxArrayItems": {
      "label": "maxArrayItems",
      "kind": "literal",
      "type": "number",
      "description": "MCP authoring hint: number of leading array items kept in compact previews."
    },
    "maxTraceChars": {
      "label": "maxTraceChars",
      "kind": "literal",
      "type": "number",
      "description": "MCP authoring hint: compact trace payloads larger than this JSON size."
    },
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving execution result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "test.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	function include(value) {
		return value === true || String(value) === "true";
	}

	function cleanup(execution, props) {
		if (!include(props.includeFlow)) {
			delete execution.flow;
			delete execution.local;
		}
		if (!include(props.includeTrace)) {
			delete execution.trace;
		}
		return execution;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var args = argsFrom(props);
			if (!args.name && args.flowName) {
				args.name = args.flowName;
			}
			if (!args.name) {
				args.name = prop(node, "name");
			}
			return cleanup(ctx.flowTest(args), props);
		}
	};
}())
