const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:file-remove-outline",
  "description": "Deletes a project-local Flow source resource.",
  "properties": {
    "path": {
      "label": "Resource path",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow resource path.",
    },
    "baseHash": {
      "label": "Base hash",
      "kind": "text",
      "type": "string",
      "description": "Hash returned by resource.get before deleting.",
    },
    "dryRun": {
      "label": "Dry run",
      "kind": "literal",
      "type": "boolean",
      "description": "Validate without deleting the file.",
    },
    "projectDir": {
      "label": "Project directory",
      "kind": "text",
      "type": "string",
      "description": "Optional project directory override.",
    },
  },
  "runtime": "rhino",
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
			return ctx.resourceDelete(argsFrom(ctx.props(node)));
		}
	};
}())
