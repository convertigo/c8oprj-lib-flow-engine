(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		name: "email.mock",

		displayName: function (node) {
			var to = prop(node, "to");
			return to ? "to " + flowSummary.text(to) : "email.mock";
		},

		analyze: function (ctx, node) {
			var props = ctx.props(node);
			ctx.addPath(props.out);
		},

		run: function (ctx, node) {
			var props = ctx.props(node);
			return {
				sent: true,
				to: ctx.template(props.to),
				subject: ctx.template(props.subject),
				body: ctx.template(props.body)
			};
		}
	};
}())
