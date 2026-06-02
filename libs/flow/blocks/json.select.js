(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = ctx.expr(props.source);
			return ctx.readObjectPath(source, props.path);
		}
	};
}())
