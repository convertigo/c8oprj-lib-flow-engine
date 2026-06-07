(function () {
	return {
		displayName: function (node) {
			return node && node.out ? "object -> " + node.out : "object";
		},

		analyze: function (ctx, node) {
			if (node && node.out) {
				ctx.addPath(node.out);
			}
			ctx.visitNodes(node.fields || []);
		}
	};
}())
