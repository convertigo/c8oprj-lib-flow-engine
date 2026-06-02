(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.returnValue(ctx.input(props, ctx.read("result")));
		}
	};
}())
