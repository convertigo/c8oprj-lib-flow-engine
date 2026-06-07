(function () {
	return {
		displayName: function () {
			return "requestable.list";
		},

		analyze: function (ctx, node) {
			var out = ctx.props(node).out;
			if (out) {
				ctx.addPath(out);
			}
		}
	};
}())
