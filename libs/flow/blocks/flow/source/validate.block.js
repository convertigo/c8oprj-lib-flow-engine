const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-check-outline",
  "tags": [
    "flow",
    "source",
    "flowscript",
    "validate"
  ],
  "description": "Parses and validates FlowScript without writing the Flow.",
  "properties": {
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Optional project Flow name used when code is omitted."
    },
    "code": {
      "label": "code",
      "kind": "text",
      "type": "string",
      "description": "FlowScript code to validate."
    },
    "flowScript": {
      "label": "flowScript",
      "kind": "text",
      "type": "string",
      "description": "Alias for code."
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
      "description": "Scope path receiving validation result."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "validate.hooks.js"
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
			return ctx.flowSourceValidate(argsFrom(ctx.props(node)));
		}
	};
}())
