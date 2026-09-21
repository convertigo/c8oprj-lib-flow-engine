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
		displayName: function () {
			return "analyze flow";
		},

		analyze: function (ctx, node) {
			var out = ctx.outputPath(node);
			if (out) {
				ctx.addPath(out);
			}
		}
	};
}())
