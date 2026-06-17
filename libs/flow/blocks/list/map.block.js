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
  "description": "Builds a new array by evaluating one expression for each current item.",
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
      "description": "Array to transform, for example local.pods.items after k8s.pod.get."
    },
    "select": {
      "label": "Select value",
      "kind": "expression",
      "type": "unknown",
      "default": "current",
      "description": "Expression evaluated for each item. Use current to read the item, for example current.name to extract pod names."
    },
    "out": {
      "label": "Output",
      "kind": "path",
      "mode": "write",
      "category": "Output",
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
