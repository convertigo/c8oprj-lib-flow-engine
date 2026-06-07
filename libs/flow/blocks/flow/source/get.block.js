const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-code-outline",
  "tags": [
    "flow",
    "source",
    "flowscript"
  ],
  "description": "Renders one project Flow as FlowScript code with a revision.",
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
    "includeContext": {
      "label": "includeContext",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Include generated context comments such as known paths."
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
      "description": "Scope path receiving FlowScript code and revision."
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
			return ctx.flowSourceGet(argsFrom(ctx.props(node)));
		}
	};
}())
