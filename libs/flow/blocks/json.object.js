(function () {
	return {
		run: function (ctx, node) {
			var previous = ctx.scopes.local.__jsonTarget;
			var object = {};
			ctx.scopes.local.__jsonTarget = object;
			try {
				ctx.runNodes(node.fields || []);
			} finally {
				ctx.scopes.local.__jsonTarget = previous;
			}
			return object;
		}
	};
}())
