(function () {
	function argsFrom(props) {
		var args = {};
		Object.keys(props || {}).forEach(function (key) {
			if (key !== "out") {
				args[key] = props[key];
			}
		});
		return args;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.analyzeFlowSource(props.flowSource || "", argsFrom(props));
		}
	};
}())
