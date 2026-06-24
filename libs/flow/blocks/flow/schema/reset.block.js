const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:database-refresh-outline",
  "description": "Deletes learned Flow schema files so the Flow falls back to declared/static schema until an explicit record/adopt action is used.",
  "properties": {
    "flowName": {
      "label": "flowName",
      "kind": "text",
      "type": "string",
      "description": "Flow sidecar name."
    },
    "name": {
      "label": "name",
      "kind": "text",
      "type": "string",
      "description": "Alias for flowName."
    },
    "node": {
      "label": "node",
      "kind": "text",
      "type": "string",
      "description": "Optional node id."
    },
    "property": {
      "label": "property",
      "kind": "text",
      "type": "string",
      "description": "Optional output property."
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
      "description": "Scope path receiving reset status."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "reset.hooks.js"
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
			return ctx.schemaReset(argsFrom(ctx.props(node)));
		}
	};
}())
