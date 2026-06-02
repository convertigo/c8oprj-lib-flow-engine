(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var ok = !!ctx.expr(props.condition);
			return ctx.runNodes(ok ? (node.then || []) : (node["else"] || []));
		}
	};
}())
