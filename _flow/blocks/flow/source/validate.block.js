const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-check-outline",
  "tags": [
    "flow",
    "source",
    "flowscript",
    "validate",
  ],
  "description": "Parses and validates FlowScript without writing the Flow.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "name": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Optional project Flow name used when code is omitted.",
    },
    "code": {
      "label": "Code",
      "kind": "text",
      "type": "string",
      "description": "FlowScript code to validate.",
    },
    "flowScript": {
      "label": "FlowScript code (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for code.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "validate.hooks.js",
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
			return ctx.flowSourceValidate(argsFrom(ctx.props(node)));
		}
	};
}())
