(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "type.get",
		private: true,

		catalog: function () {
			return {
				name: "type.get",
				"package": "core",
				namespace: "type",
				private: true,
				icon: "mdi:shape-outline",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Flow property type name." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving type source and descriptor." }
				},
				description: "Reads one Flow property type source."
			};
		},

		displayName: function (node) {
			return "get type " + (prop(node, "name") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.typeGet(props.name, props);
		}
	};
}())
