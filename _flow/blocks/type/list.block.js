const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "private": true,
  "icon": "mdi:shape-outline",
  "description": "Lists Flow property types visible from a project.",
  "traits": [
    "flow.projectScoped",
  ],
  "properties": {},
  "runtime": "rhino",
  "hooks": {
    "file": "list.hooks.js",
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
			return ctx.typeList(argsFrom(ctx.props(node)));
		}
	};
}())
