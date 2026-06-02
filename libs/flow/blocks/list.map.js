(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var mapped = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				mapped.push(ctx.expr(props.select === undefined ? "current" : props.select));
			}
			ctx.scopes.current = previous;
			return mapped;
		}
	};
}())
