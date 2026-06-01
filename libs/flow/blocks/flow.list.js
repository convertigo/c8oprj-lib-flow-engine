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
		name: "flow.list",
		private: true,

		catalog: function () {
			return {
				name: "flow.list",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:sitemap-outline",
				props: {
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving project Flow sidecars." }
				},
				description: "Lists project Flow sidecars."
			};
		},

		displayName: function () {
			return "list flows";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.flowList(argsFrom(ctx.props(node)));
		}
	};
}())
