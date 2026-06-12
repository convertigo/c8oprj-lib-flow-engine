const _meta = {
  "version": 1,
  "icon": "mdi:format-list-numbered",
  "tags": [
    "list",
    "array",
    "take",
    "slice",
    "limit",
    "top"
  ],
  "description": "Returns a slice of an array, typically the first N items.",
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
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array expression to slice."
    },
    "count": {
      "kind": "expression",
      "type": "integer",
      "default": "5",
      "description": "Maximum number of items to return. Leave empty to keep all items after offset."
    },
    "offset": {
      "kind": "expression",
      "type": "integer",
      "default": "0",
      "description": "Zero-based index of the first item to keep."
    },
    "out": {
      "kind": "path",
      "mode": "write",
      "default": "local.items",
      "description": "Scope path receiving the sliced array."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "take.hooks.js"
  }
}

(function () {
	function numberOr(value, fallback) {
		var number = Number(value);
		return isNaN(number) ? fallback : number;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var offset = Math.max(0, numberOr(props.offset === undefined ? 0 : ctx.expr(props.offset), 0));
			var hasCount = props.count !== undefined && props.count !== null && String(props.count).trim() !== "";
			var count = hasCount ? Math.max(0, numberOr(ctx.expr(props.count), 0)) : Number.MAX_SAFE_INTEGER || 9007199254740991;
			var out = [];
			for (var i = offset; i < items.length && out.length < count; i++) {
				out.push(items[i]);
			}
			return out;
		}
	};
}())
