(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return JSON.stringify(ctx.input(props), null, props.pretty === true ? 2 : 0);
		}
	};
}())
