(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "set",

		catalog: function () {
			return {
				name: "set",
				icon: "mdi:variable",
				props: {
					path: { label: "path", kind: "path", mode: "write", "default": "result.value", description: "Scope path receiving the value." },
					value: { label: "value", kind: "value", type: "unknown", "default": "", description: "Value to write. Use {{ expression }} for dynamic values." }
				},
				description: "Writes a value to a scope path.",
				longDescription: "Use path to choose the destination and value for the content. A value containing only {{ expression }} keeps the native expression type."
			};
		},

		displayName: function (node) {
			return flowSummary.assignment(node, "=") || flowSummary.text(prop(node, "path") || "value");
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.path);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.write(props.path, ctx.input(props));
		}
	};
}())
