(function () {
	function shouldKeep(ctx, props) {
		return !!ctx.expr(props.where);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var filtered = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				if (shouldKeep(ctx, props)) {
					filtered.push(items[i]);
				}
			}
			ctx.scopes.current = previous;
			return filtered;
		}
	};
}())
