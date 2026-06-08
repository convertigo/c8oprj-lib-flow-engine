(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return "cache info -> " + (prop(node, "out") || "local.cache");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out, {
					type: "object",
					properties: {
						startedAt: { type: "string" },
						engineDir: { type: "string" },
						projectDir: { type: "string" },
						caches: { type: "object" }
					}
				});
			}
		}
	};
}())
