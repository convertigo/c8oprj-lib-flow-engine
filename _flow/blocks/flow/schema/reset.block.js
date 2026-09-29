const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:database-refresh-outline",
  "description": "Deletes learned Flow schema files so the Flow falls back to declared/static schema until an explicit record/adopt action is used.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {
    "flowName": {
      "label": "Flow name",
      "kind": "text",
      "type": "string",
      "description": "Flow name.",
    },
    "name": {
      "label": "Flow name (alias)",
      "kind": "text",
      "type": "string",
      "description": "Alias for flowName.",
    },
    "node": {
      "label": "Node id",
      "kind": "text",
      "type": "string",
      "description": "Optional node id.",
    },
    "property": {
      "label": "Property",
      "kind": "text",
      "type": "string",
      "description": "Optional output property.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "reset.hooks.js",
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
			return ctx.schemaReset(argsFrom(ctx.props(node)));
		}
	};
}())
