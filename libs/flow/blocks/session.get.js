(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
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
