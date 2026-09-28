const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:play-circle-outline",
  "description": "Runs a Flow source or definition.",
  "properties": {
    "flowSource": {
      "label": "Flow source",
      "kind": "text",
      "type": "string",
      "description": "Flow YAML source to run.",
    },
    "definition": {
      "label": "Definition",
      "kind": "literal",
      "type": "object",
      "description": "Flow definition object to run.",
    },
    "input": {
      "label": "Input",
      "kind": "template",
      "type": "object",
      "description": "Input scope.",
    },
    "config": {
      "label": "Configuration",
      "kind": "template",
      "type": "object",
      "description": "Config scope override.",
    },
    "includeFlow": {
      "label": "Include Flow",
      "kind": "literal",
      "type": "boolean",
      "description": "Include final flow scope in the response.",
    },
    "includeTrace": {
      "label": "Include trace",
      "kind": "literal",
      "type": "boolean",
      "description": "Include execution trace in the response.",
    },
    "includeFullTrace": {
      "label": "Include full trace",
      "kind": "literal",
      "type": "boolean",
      "description": "MCP authoring hint: return full per-node trace values instead of a compact preview.",
    },
    "includeFullResult": {
      "label": "Include full result",
      "kind": "literal",
      "type": "boolean",
      "description": "MCP authoring hint: request a full result. Large results still require detail full and allowHugeResult.",
    },
    "allowHugeResult": {
      "label": "Allow huge result",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Explicitly allow a result larger than maxResultChars, only when detail is full. Use rarely.",
    },
    "maxResultChars": {
      "label": "Maximum result characters",
      "kind": "literal",
      "type": "number",
      "description": "MCP authoring hint: compact result payloads larger than this JSON size. Compact responses cap this value.",
    },
    "maxArrayItems": {
      "label": "Maximum array items",
      "kind": "literal",
      "type": "number",
      "description": "MCP authoring hint: number of leading array items kept in compact previews.",
    },
    "maxTraceChars": {
      "label": "Maximum trace characters",
      "kind": "literal",
      "type": "number",
      "description": "MCP authoring hint: compact trace payloads larger than this JSON size.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
    "project": {
      "label": "Project",
      "kind": "text",
      "type": "string",
      "description": "Optional logical project name used for relative requestables.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "run.hooks.js",
  },
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
