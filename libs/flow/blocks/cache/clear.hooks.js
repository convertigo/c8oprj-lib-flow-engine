(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return "cache clear -> " + (prop(node, "out") || "local.cache");
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out, {
					type: "object",
					properties: {
						runtimeId: { type: "string" },
						startedAt: { type: "string" },
						threadName: { type: "string" },
						engineDir: { type: "string" },
						activeProjectDir: { type: "string" },
						caches: { type: "object" }
					}
				});
			}
		}
	};
}())
