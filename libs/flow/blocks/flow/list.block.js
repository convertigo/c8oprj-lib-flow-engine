const _meta = {
  "version": 1,
  "private": true,
  "icon": "mdi:sitemap-outline",
  "description": "Lists project Flow sidecars.",
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
      "description": "Scope path receiving project Flow sidecars."
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
			return ctx.flowList(argsFrom(ctx.props(node)));
		}
	};
}())
