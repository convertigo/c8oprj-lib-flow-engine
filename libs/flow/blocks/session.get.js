(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "session.get",

		catalog: function () {
			return {
				name: "session.get",
				icon: "mdi:key-outline",
				props: {
					key: { label: "key", kind: "template", type: "string", "default": "", description: "HTTP session attribute name." },
					"default": { label: "default", kind: "value", type: "unknown", description: "Value returned when the session key is missing." },
					out: { label: "out", kind: "path", mode: "write", "default": "flow.sessionValue", description: "Scope path receiving the session value." }
				},
				description: "Reads a value from the current HTTP session."
			};
		},

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text(prop(node, "key") || "session key"));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var session = ctx.convertigoContext().httpSession;
			var value = session.getAttribute(String(ctx.template(props.key || "")));
			if (value === null || value === undefined) {
				return props["default"] === undefined ? null : ctx.input({ value: props["default"] });
			}
			return String(value);
		}
	};
}())
