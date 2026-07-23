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
		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "path") || prop(node, "uri") || "resource"));
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addSchema(out, {
					type: "object",
					properties: {
						ok: { type: "boolean" },
						content: { type: "string" },
						truncated: { type: "boolean" },
						contentLength: { type: "integer" },
						returnedLength: { type: "integer" },
						path: { type: "string" },
						mimeType: { type: "string" },
						hash: { type: "string" },
						hint: { type: "string" }
					}
				});
			}
		}
	};
}())
