(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "session.remove",

		catalog: function () {
			return {
				name: "session.remove",
				icon: "mdi:trash-can-outline",
				props: {
					key: { label: "key", kind: "template", type: "string", "default": "", description: "HTTP session attribute name to remove." },
					out: { label: "out", kind: "path", mode: "write", description: "Optional scope path receiving true when the key was removed." }
				},
				description: "Removes a value from the current HTTP session."
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
			var key = String(ctx.template(props.key || ""));
			var existed = session.getAttribute(key) !== null;
			session.removeAttribute(key);
			return existed;
		}
	};
}())
