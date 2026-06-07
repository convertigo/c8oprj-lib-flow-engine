const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:shape-outline",
  "description": "Lists Flow property types visible from a project.",
  "properties": {
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
      "description": "Scope path receiving property type descriptors."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "list.hooks.js"
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
			return ctx.typeList(argsFrom(ctx.props(node)));
		}
	};
}())
