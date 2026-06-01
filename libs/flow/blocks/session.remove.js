(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "session.remove",

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
