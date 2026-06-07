const _meta = {
  "version": 1,
  "icon": "mdi:file-tree-outline",
  "tags": [
    "control"
  ],
  "description": "Runs child nodes once per line and exposes the current line as current.",
  "slots": [
    {
      "name": "nodes",
      "label": "Flow",
      "inline": true
    }
  ],
  "properties": {
    "reader": {
      "label": "reader",
      "kind": "expression",
      "type": "handle<file.reader>",
      "default": "local.reader",
      "description": "Reader handle produced by file.withReader."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "description": "Optional scope path receiving {count}."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "forEachLine.hooks.js"
  },
  "children": [
    "nodes"
  ]
}

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
