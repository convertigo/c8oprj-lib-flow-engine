(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function sessionString(value) {
		if (value === undefined || value === null) {
			return "";
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	return {
		name: "session.set",

		catalog: function () {
			return {
				name: "session.set",
				icon: "mdi:account-key-outline",
				props: {
					key: { label: "key", kind: "template", type: "string", "default": "", description: "HTTP session attribute name." },
					value: { label: "value", kind: "value", type: "unknown", "default": "", description: "Value stored in the session. Non-string values are stored as JSON text." },
					out: { label: "out", kind: "path", mode: "write", description: "Optional scope path receiving the stored value." }
				},
				description: "Writes a value into the current HTTP session."
			};
		},

		displayName: function (node) {
			return flowSummary.output(node, flowSummary.text((prop(node, "key") || "session key") + " = " + flowSummary.value(prop(node, "value"))));
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			var value = sessionString(ctx.input(props));
			ctx.convertigoContext().httpSession.setAttribute(String(ctx.template(props.key || "")), value);
			return value;
		}
	};
}())
