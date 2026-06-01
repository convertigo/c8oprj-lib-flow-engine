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
		name: "resource.search",
		private: true,

		catalog: function () {
			return {
				name: "resource.search",
				"package": "core",
				namespace: "resource",
				private: true,
				icon: "mdi:file-search-outline",
				props: {
					query: { label: "query", kind: "text", type: "string", description: "Text query over project Flow resources." },
					q: { label: "q", kind: "text", type: "string", description: "Short alias for query." },
					limit: { label: "limit", kind: "literal", type: "number", description: "Maximum number of resources to return." },
					cursor: { label: "cursor", kind: "text", type: "string", description: "Pagination cursor returned by a previous search." },
					maxFileBytes: { label: "maxFileBytes", kind: "literal", type: "number", description: "Skip files larger than this size." },
					doc: { label: "doc", kind: "literal", type: "boolean", description: "Include short tool documentation." },
					hints: { label: "hints", kind: "literal", type: "boolean", description: "Include short usage hints." },
					projectDir: { label: "projectDir", kind: "text", type: "string", description: "Optional project directory override." },
					out: { label: "out", kind: "path", mode: "write", description: "Scope path receiving search results." }
				},
				description: "Searches project-local Flow text resources."
			};
		},

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "query") || prop(node, "q") || "resources"));
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		},

		run: function (ctx, node) {
			return ctx.resourceSearch(argsFrom(ctx.props(node)));
		}
	};
}())
