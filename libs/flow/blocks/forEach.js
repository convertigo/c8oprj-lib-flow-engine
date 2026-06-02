(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			for (var i = 0; i < items.length; i++) {
				if (ctx.stopped) {
					break;
				}
				ctx.scopes.current = items[i];
				ctx.runNodes(node.nodes || []);
			}
			ctx.scopes.current = null;
			return items;
		}
	};
}())
