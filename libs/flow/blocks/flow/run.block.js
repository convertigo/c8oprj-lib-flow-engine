const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:play-circle-outline",
  "description": "Runs a Flow source or definition.",
  "properties": {
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
    "project": {
      "label": "project",
      "kind": "text",
      "type": "string",
      "description": "Optional logical project name used for relative requestables."
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
    "file": "run.hooks.js"
  }
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
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
			return cleanup(ctx.runFlowSource(props.flowSource || "", props.config || {}, {
				input: props.input || {},
				project: props.project,
				projectDir: props.projectDir,
				definition: props.definition,
				includeFlow: include(props.includeFlow),
				includeTrace: include(props.includeTrace)
			}), props);
		}
	};
}())
