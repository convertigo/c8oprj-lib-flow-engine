const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-code-outline",
  "tags": [
    "flow",
    "source",
    "flowscript",
  ],
  "description": "Renders one project Flow as FlowScript code with a revision.",
  "properties": {
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Project Flow name.",
    },
    "flowName": {
      "label": "Flow name (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for name.",
    },
    "includeContext": {
      "label": "Include context",
      "kind": "literal",
      "type": "boolean",
      "default": false,
      "description": "Include generated context comments such as known paths.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js",
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
			return ctx.flowSourceGet(argsFrom(ctx.props(node)));
		}
	};
}())
