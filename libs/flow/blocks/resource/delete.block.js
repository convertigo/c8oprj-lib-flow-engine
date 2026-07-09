const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:file-remove-outline",
  "description": "Deletes a project-local Flow source resource.",
  "properties": {
    "path": {
      "label": "path",
      "kind": "text",
      "type": "string",
      "description": "Project-local Flow resource path."
    },
    "baseHash": {
      "label": "baseHash",
      "kind": "text",
      "type": "string",
      "description": "Hash returned by resource.get before deleting."
    },
    "dryRun": {
      "label": "dryRun",
      "kind": "literal",
      "type": "boolean",
      "description": "Validate without deleting the file."
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
      "description": "Scope path receiving delete result."
    }
  },
  "runtime": "rhino"
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
