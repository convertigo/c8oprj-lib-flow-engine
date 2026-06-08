const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:check-decagram-outline",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Checks the current FlowScript working copy without running it.",
  "properties": {
    "qname": {
      "label": "qname",
      "kind": "text",
      "type": "string",
      "description": "Flow qname, for example Project.FlowName."
    },
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow name."
    },
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "Optional full FlowScript code for internal use. MCP agents should write with flow-code-set or flow-code-patch first."
    },
    "draft": {
      "label": "draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Check the draft source from libs/flow/drafts when code is omitted."
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
      "description": "Scope path receiving check diagnostics."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "check.hooks.js"
  }
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
