(function () {
	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		if (!args.detail && !args.mode) {
			args.detail = "signature";
		}
		if (!args.limit) {
			args.limit = 20;
		}
		return args;
	}

	return {
		run: function (ctx, node) {
			return ctx.blockList(argsFrom(ctx.props(node)));
		}
	};
}())
