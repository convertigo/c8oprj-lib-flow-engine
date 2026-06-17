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
  "description": "Keeps only array items matching a boolean expression evaluated with current.*.",
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
      "label": "Input array",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array to filter, for example local.pods.items after k8s.pod.get."
    },
    "where": {
      "label": "Keep when",
      "kind": "expression",
      "type": "boolean",
      "default": "true",
      "description": "Boolean expression evaluated for each item. Use current to read the item, for example current.phase == \"Running\" or current.name.includes(\"api\")."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
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
