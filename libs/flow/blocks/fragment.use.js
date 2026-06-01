(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "fragment.use",

		catalog: function () {
			return {
				name: "fragment.use",
				icon: "mdi:folder-sync-outline",
				kind: "composition",
				props: {
					fragment: { label: "fragment", kind: "text", type: "string", description: "Project Flow fragment to expand inline." }
				},
				children: ["nodes"],
				slots: [
					{ name: "nodes", label: "Fragment", inline: true }
				],
				description: "Expands and runs a reusable Flow fragment in the current scopes.",
				longDescription: "A fragment is stored in libs/flow/fragments/<name>.fragment.yaml and behaves like the nodes were written inline. It has closure-style access to input, config, flow, result and current."
			};
		},

		displayName: function (node) {
			return flowSummary.text(prop(node, "fragment") || "fragment");
		},

		analyze: function (ctx, node) {
			ctx.visitNodes(node.nodes || []);
		},

		run: function (ctx, node) {
			return ctx.runNodes(node.nodes || []);
		}
	};
}())
