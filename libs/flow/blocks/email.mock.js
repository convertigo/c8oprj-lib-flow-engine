(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
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
