(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		displayName: function (node) {
			return flowSummary.text("response error " + (prop(node, "code") || "FLOW_ERROR"));
		},

		analyze: function (ctx, node) {
			var path = prop(node, "path") || "result.error";
			ctx.addPath(path);
			if (ctx.addSchema) {
				ctx.addSchema(path, { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } });
			}
		}
	};
}())
