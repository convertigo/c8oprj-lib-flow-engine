(function () {
	return {
		run: function (ctx, node) {
			return ctx.blockCodeGet(ctx.props(node));
		}
	};
}())
