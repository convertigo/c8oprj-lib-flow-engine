(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.template(props.template || "");
		}
	};
}())
