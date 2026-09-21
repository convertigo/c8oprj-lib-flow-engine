(function () {
	return {
		displayName: function () {
			return "requestable.list";
		},

		analyze: function (ctx, node) {
			var out = ctx.outputPath(node);
			if (out) {
				ctx.addPath(out);
			}
		}
	};
}())
