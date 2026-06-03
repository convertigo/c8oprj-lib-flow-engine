(function () {
	function argsFrom(ctx, props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = typeof props[key] === "string" ? ctx.template(props[key]) : props[key];
			}
		});
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.resourceList(argsFrom(ctx, ctx.props(node)));
		}
	};
}())
