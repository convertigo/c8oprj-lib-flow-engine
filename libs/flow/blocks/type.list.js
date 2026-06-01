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
		name: "type.list",
		private: true,

		catalog: function () {
			return {
				name: "type.list",
				"package": "core",
				namespace: "type",
				private: true,
				icon: "mdi:shape-outline",
				props: {
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving property type descriptors." }
				},
				description: "Lists Flow property types visible from a project."
			};
		},

		displayName: function () {
			return "list types";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.typeList(argsFrom(ctx.props(node)));
		}
	};
}())
