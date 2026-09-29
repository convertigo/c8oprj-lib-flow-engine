const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:check-decagram-outline",
  "tags": [
    "flow",
    "code",
    "flowscript",
  ],
  "description": "Checks the current FlowScript working copy without running it.",
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
      "description": "Check the in-memory FlowScript working copy when code is omitted.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "check.hooks.js",
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
			return ctx.flowCodeCheck(argsFrom(ctx.props(node)));
		}
	};
}())
