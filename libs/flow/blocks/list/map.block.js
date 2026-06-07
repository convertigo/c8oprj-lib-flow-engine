const _meta = {
  "version": 1,
  "icon": "mdi:vector-polyline",
  "tags": [
    "list",
    "array",
    "map",
    "iterate",
    "transform",
    "current"
  ],
  "description": "Maps an array to a new array while exposing each item as current.",
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "unknown"
      }
    }
  },
  "properties": {
    "items": {
      "label": "items",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array expression to map."
    },
    "select": {
      "label": "select",
      "kind": "expression",
      "type": "unknown",
      "default": "current",
      "description": "Expression evaluated for each current item."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.mapped",
      "description": "Scope path receiving the mapped array."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "map.hooks.js"
  }
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var mapped = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				mapped.push(ctx.expr(props.select === undefined ? "current" : props.select));
			}
			ctx.scopes.current = previous;
			return mapped;
		}
	};
}())
