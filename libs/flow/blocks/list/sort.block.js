const _meta = {
  "version": 1,
  "icon": "mdi:sort",
  "tags": [
    "list",
    "array",
    "sort",
    "order",
    "current"
  ],
  "description": "Sorts an array copy by a current.* expression.",
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
      "description": "Array expression to sort."
    },
    "by": {
      "kind": "expression",
      "type": "unknown",
      "default": "current",
      "description": "Expression evaluated as the sort key for each current item."
    },
    "direction": {
      "kind": "text",
      "type": "string",
      "default": "asc",
      "description": "Sort direction: asc or desc."
    },
    "out": {
      "kind": "path",
      "mode": "write",
      "default": "local.sorted",
      "description": "Scope path receiving the sorted array."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "sort.hooks.js"
  }
}

(function () {
	function comparable(value) {
		if (typeof value === "string" && value.trim() !== "") {
			var number = Number(value);
			if (!isNaN(number)) {
				return number;
			}
		}
		return value === undefined || value === null ? "" : value;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = (ctx.expr(props.items || props["in"]) || []).slice(0);
			var previous = ctx.scopes.current;
			var direction = String(props.direction || props.order || "asc").toLowerCase() === "desc" ? -1 : 1;
			var by = props.by === undefined ? "current" : props.by;
			items.sort(function (a, b) {
				ctx.scopes.current = a;
				var left = comparable(ctx.expr(by));
				ctx.scopes.current = b;
				var right = comparable(ctx.expr(by));
				if (left < right) {
					return -1 * direction;
				}
				if (left > right) {
					return direction;
				}
				return 0;
			});
			ctx.scopes.current = previous;
			return items;
		}
	};
}())
