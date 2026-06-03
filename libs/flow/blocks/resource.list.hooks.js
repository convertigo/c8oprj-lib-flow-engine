(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			var root = prop(node, "rootDir") || "";
			var pattern = prop(node, "pattern") || "resources";
			return flowSummary.output(node, flowSummary.text(root ? root + "/" + pattern : pattern));
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addSchema(out, {
					type: "object",
					properties: {
						resources: {
							type: "array",
							items: {
								type: "object",
								properties: {
									uri: { type: "string" },
									path: { type: "string" },
									name: { type: "string" },
									description: { type: "string" },
									mimeType: { type: "string" }
								}
							}
						}
					}
				});
			}
		}
	};
}())
