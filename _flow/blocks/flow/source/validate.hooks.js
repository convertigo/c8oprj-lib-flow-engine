(function () {
	return {
		displayName: function () {
			return "source.validate";
		},

		analyze: function (ctx, node) {
			var out = ctx.outputPath(node);
			if (out) {
				ctx.addPath(out);
			}
		}
	};
}())
