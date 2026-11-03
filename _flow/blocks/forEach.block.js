const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:repeat",
  "tags": [
    "control",
    "loop",
    "each",
    "iterate",
    "array",
    "current",
  ],
  "description": "Runs child nodes once per item and exposes the item as current.",
  "summary": "for each of {{items}}",
  "slots": [
    {
      "name": "nodes",
      "label": "Flow",
      "acceptsFrom": "parentSlot",
      "inline": true,
      "scope": "caller",
      "current": "item",
      "description": "Runs in the caller scope and exposes each iterated item as current.",
    },
  ],
  "properties": {
    "items": {
      "label": "Items",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "List to iterate; child nodes run once per item.",
    },
  },
  "runtime": "rhino",
  "outputs": { "out": { "type": "array", "items": { "type": "unknown" }, "hidden": true } },
  "hooks": {
    "file": "forEach.hooks.js",
  },
  "children": [
    "nodes",
  ],
}

(function () {
	function prop(node, key) {
		return node && node.props && node.props[key] !== undefined ? node.props[key] : node && node[key];
	}

	function runItems(ctx, node, items) {
			var previousCurrent = ctx.scopes.current;
			try {
				for (var i = 0; i < items.length; i++) {
					if (ctx.stopped) {
						break;
					}
					ctx.scopes.current = items[i];
					ctx.runLoopBody(node.nodes || []);
				}
			} finally {
				ctx.scopes.current = previousCurrent;
			}
			return items;
	}
	function argumentsFor(ctx, node) {
		var props = ctx.props(node);
		return { items: ctx.expr(props.items || props["in"]) || [] };
	}
	return {
		stateless: true,
		debug: { resolve: argumentsFor, run: function(ctx,node,args) { return runItems(ctx,node,args.items); } },
		run: function(ctx,node) {
			var props = ctx.props(node);
			return runItems(ctx,node,ctx.expr(props.items || props["in"]) || []);
		}
	};
}())
