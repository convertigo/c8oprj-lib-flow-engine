(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var reader = ctx.handleValue(ctx.expr(props.reader || "local.reader"), "file.reader");
			var raw = reader.readLine();
			var eof = raw === null;
			var result = {
				line: eof ? null : String(raw),
				eof: eof
			};
			if (props.line) {
				ctx.write(props.line, result.line);
			}
			if (props.eof) {
				ctx.write(props.eof, result.eof);
			}
			return result;
		}
	};
}())
