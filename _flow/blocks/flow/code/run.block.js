const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:play-box-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
  ],
  "description": "Runs the current FlowScript working copy or official Flow.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "qname": {
      "label": "Qualified name",
      "kind": "text",
      "type": "string",
      "description": "Flow qname, for example Project.FlowName.",
    },
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow name.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "Optional full FlowScript code for internal use. MCP agents should write with flow-code-set or flow-code-patch first.",
    },
    "draft": {
      "label": "Use draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Run the in-memory FlowScript working copy when code is omitted.",
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
      "description": "Include final local scope in the response.",
    },
    "includeTrace": {
      "label": "Include trace",
      "kind": "literal",
      "type": "boolean",
      "description": "Include execution trace in the response.",
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
	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.flowCodeRun(argsFrom(ctx.props(node)));
		}
	};
}())
