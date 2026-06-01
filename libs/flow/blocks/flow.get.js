(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "flow.get",
		private: true,

		catalog: function () {
			return {
				name: "flow.get",
				"package": "core",
				namespace: "flow",
				private: true,
				icon: "mdi:sitemap",
				props: {
					name: { label: "name", kind: "text", type: "string", description: "Project Flow sidecar name." },
					flowName: { label: "flowName", kind: "text", type: "string", description: "Alias for name." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving Flow source and definition." }
				},
				description: "Reads one project Flow sidecar."
			};
		},

		displayName: function (node) {
			return "get flow " + (prop(node, "name") || prop(node, "flowName") || "");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.flowGet(props.name || props.flowName || prop(node, "name"), props);
		}
	};
}())
