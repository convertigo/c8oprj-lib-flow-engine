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
		name: "block.list",
		private: true,

		catalog: function () {
			return {
				name: "block.list",
				"package": "core",
				namespace: "block",
				private: true,
				icon: "mdi:puzzle-outline",
				props: {
					detail: { label: "detail", kind: "text", type: "string", description: "Catalog detail: summary, compact or full." },
					mode: { label: "mode", kind: "text", type: "string", description: "Alias for detail." },
					includePrivate: { label: "includePrivate", kind: "literal", type: "boolean", description: "Include private blocks." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving the block catalog." }
				},
				description: "Lists Flow blocks visible from a project."
			};
		},

		displayName: function () {
			return "list blocks";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.blockList(argsFrom(ctx.props(node)));
		}
	};
}())
