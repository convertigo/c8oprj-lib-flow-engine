(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "block.get",
		private: true,

		catalog: function () {
			return {
				name: "block.get",
				"package": "core",
				namespace: "block",
				private: true,
				icon: "mdi:puzzle-outline",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Flow block name." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving block source and metadata." }
				},
				description: "Reads one Flow block source."
			};
		},

		displayName: function (node) {
			return "get block " + (prop(node, "name") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.blockGet(props.name, props);
		}
	};
}())
