const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-code-outline",
  "tags": [
    "flow",
    "code",
    "flowscript"
  ],
  "description": "Returns compact FlowScript code and revision for one Flow.",
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
    "projectDir": {
      "label": "projectDir",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override."
    },
    "draft": {
      "label": "draft",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Read the in-memory FlowScript working copy when present."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Scope path receiving {code, revision}."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js"
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
			return ctx.flowCodeGet(argsFrom(ctx.props(node)));
		}
	};
}())
