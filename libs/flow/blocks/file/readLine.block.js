const _meta = {
  "version": 1,
  "icon": "mdi:file-find-outline",
  "tags": [
    "resource"
  ],
  "description": "Reads one line from a file reader handle.",
  "properties": {
    "reader": {
      "label": "reader",
      "kind": "expression",
      "type": "handle<file.reader>",
      "default": "local.reader",
      "description": "Reader handle produced by file.withReader."
    },
    "line": {
      "label": "line",
      "kind": "path",
      "mode": "write",
      "description": "Optional scope path receiving the line or null at EOF."
    },
    "eof": {
      "label": "eof",
      "kind": "path",
      "mode": "write",
      "description": "Optional scope path receiving true when the reader reached EOF."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Optional scope path receiving {line, eof}."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "readLine.hooks.js"
  }
}

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
