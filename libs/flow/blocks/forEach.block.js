const _meta = {
  "version": 1,
  "icon": "mdi:repeat",
  "tags": [
    "control",
    "loop",
    "each",
    "iterate",
    "array",
    "current"
  ],
  "description": "Runs child nodes once per item and exposes the item as current.",
  "slots": [
    {
      "name": "nodes",
      "label": "Flow",
      "inline": true,
      "scope": "caller",
      "current": "item",
      "description": "Runs in the caller scope and exposes each iterated item as current."
    }
  ],
  "properties": {
    "items": {
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array expression iterated by this block."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "forEach.hooks.js"
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
			var items = ctx.expr(props.items || props["in"]) || [];
			var previousCurrent = ctx.scopes.current;
			try {
				for (var i = 0; i < items.length; i++) {
					if (ctx.stopped) {
						break;
					}
					ctx.scopes.current = items[i];
					ctx.runNodes(node.nodes || []);
				}
			} finally {
				ctx.scopes.current = previousCurrent;
			}
			return items;
		}
	};
}())
