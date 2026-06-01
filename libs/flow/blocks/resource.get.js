(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

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
		name: "resource.get",
		private: true,

		catalog: function () {
			return {
				name: "resource.get",
				"package": "core",
				namespace: "resource",
				private: true,
				icon: "mdi:file-code-outline",
				props: {
					path: { label: "path", kind: "text", type: "string", description: "Project-local Flow resource path." },
					maxBytes: { label: "maxBytes", kind: "literal", type: "number", description: "Maximum content size to return." },
					allowLarge: { label: "allowLarge", kind: "literal", type: "boolean", description: "Allow returning a resource larger than maxBytes." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving the resource content and metadata." }
				},
				description: "Reads a project-local Flow source resource."
			};
		},

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "path") || "resource"));
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.resourceGet(argsFrom(ctx.props(node)));
		}
	};
}())
