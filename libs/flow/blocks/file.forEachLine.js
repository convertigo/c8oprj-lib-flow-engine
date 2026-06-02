(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var reader = ctx.handleValue(ctx.expr(props.reader || "local.reader"), "file.reader");
			var previous = ctx.scopes.current;
			var count = 0;
			try {
				var line;
				while ((line = reader.readLine()) !== null) {
					if (ctx.stopped) {
						break;
					}
					ctx.scopes.current = String(line);
					ctx.runNodes(node.nodes || []);
					count++;
				}
			} finally {
				ctx.scopes.current = previous;
			}
			return { count: count };
		}
	};
}())
