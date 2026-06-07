const _meta = {
  "version": 1,
  "icon": "mdi:filter-outline",
  "tags": [
    "list",
    "array",
    "filter",
    "where",
    "current"
  ],
  "description": "Filters an array using a pure expression evaluated with current.*.",
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
      "description": "Array expression to filter."
    },
    "where": {
      "label": "where",
      "kind": "expression",
      "type": "boolean",
      "default": "true",
      "description": "Boolean expression evaluated for each current item."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.filtered",
      "description": "Scope path receiving the filtered array."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "filter.hooks.js"
  }
}

(function () {
	function shouldKeep(ctx, props) {
		return !!ctx.expr(props.where);
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var filtered = [];
			for (var i = 0; i < items.length; i++) {
				ctx.scopes.current = items[i];
				if (shouldKeep(ctx, props)) {
					filtered.push(items[i]);
				}
			}
			ctx.scopes.current = previous;
			return filtered;
		}
	};
}())
