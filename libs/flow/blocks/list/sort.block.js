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
      "current": "item",
      "sourceProperty": "items",
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
			var source = ctx.expr(props.items || props["in"]) || [];
			var items = source.slice ? source.slice(0) : [];
			if (!source.slice) {
				for (var i = 0; i < source.length; i++) {
					items.push(source[i]);
				}
			}
			var previous = ctx.scopes.current;
			var direction = String(props.direction || props.order || "asc").toLowerCase() === "desc" ? -1 : 1;
			var by = props.by === undefined ? "current" : props.by;
			try {
				var decorated = [];
				for (var index = 0; index < items.length; index++) {
					ctx.scopes.current = items[index];
					decorated.push({
						item: items[index],
						key: comparable(ctx.expr(by))
					});
				}
				decorated.sort(function (a, b) {
					var left = a.key;
					var right = b.key;
					if (left < right) {
						return -1 * direction;
					}
					if (left > right) {
						return direction;
					}
					return 0;
				});
				var out = [];
				for (var j = 0; j < decorated.length; j++) {
					out.push(decorated[j].item);
				}
				return out;
			} finally {
				ctx.scopes.current = previous;
			}
		}
	};
}())
