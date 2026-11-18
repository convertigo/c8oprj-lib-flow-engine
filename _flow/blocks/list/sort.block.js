const _meta = {
  "sourceVersion": 2,
  "version": 2,
  "icon": "mdi:sort",
  "tags": [
    "list",
    "array",
    "sort",
    "order",
    "current",
  ],
  "description": "Sorts an array copy by a current.* expression.",
  "longDescription": "Without compare, keeps Flow ordering: numeric text is numeric and null is empty text. With compare: number, sorts a copy using keyA - keyB; with compare: locale, uses String(keyA).localeCompare(String(keyB)). Descending reverses the comparator operands. Equal keys retain their source order.",
  "summary": "sort {{items}} by {{by}} {{direction}}",
  "outputs": {
    "out": {
      "type": "array",
      "x-flow-same-as": "items",
      "items": {
        "type": "unknown",
      },
    },
  },
  "properties": {
    "items": {
      "label": "Items",
      "kind": "expression",
      "type": "array",
      "default": "local.items",
      "description": "Array expression to sort.",
    },
    "by": {
      "label": "Sort by",
      "kind": "expression",
      "type": "unknown",
      "current": "item",
      "sourceProperty": "items",
      "default": "current",
      "description": "Expression evaluated as the sort key for each current item.",
    },
    "direction": {
      "label": "Direction",
      "kind": "value",
      "type": "string",
      "enum": [
        "asc",
        "desc",
      ],
      "default": "asc",
      "description": "Sort direction: asc or desc, a literal or an expression such as input.sortDir.",
    },
    "compare": {
      "label": "Comparator",
      "kind": "value",
      "type": "string",
      "enum": ["number", "locale"],
      "description": "Optional JavaScript comparator for the sort key; omit to keep Flow ordering.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "sort.hooks.js",
  },
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

	// The key of a call: called with values without by, the item itself. The default by, current, is the source of the
	// block, read for each item: it is not evaluated once for the whole call.
	function byFor(ctx, node, props) {
		if (ctx.relayedValues === true && (node.props || {}).by === undefined) {
			return undefined;
		}
		return props.by === undefined ? "current" : props.by;
	}

	function keyOf(ctx, by) {
		return by === undefined ? ctx.scopes.current : ctx.expr(by);
	}

	function sorted(ctx, items, by, direction, compare, args) {
		var decorated = [];
		for (var index = 0; index < items.length; index++) {
			ctx.scopes.current = items[index];
			var key = keyOf(ctx, by);
			if (args) args.by = key;
			decorated.push({ item: items[index], key: compare ? key : comparable(key) });
		}
		decorated.sort(function (a, b) {
			var left = direction < 0 ? b.key : a.key;
			var right = direction < 0 ? a.key : b.key;
			if (compare === "number") return left - right;
			if (compare === "locale") return String(left).localeCompare(String(right));
			if (a.key < b.key) return -1 * direction;
			if (a.key > b.key) return direction;
			return 0;
		});
		return decorated.map(function (entry) { return entry.item; });
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
			var direction = String(ctx.template(props.direction || props.order || "asc") || "asc").toLowerCase() === "desc" ? -1 : 1;
			var by = byFor(ctx, node, props);
			var compare = props.compare;
			try {
				return sorted(ctx, items, by, direction, compare);
			} finally {
				ctx.scopes.current = previous;
			}
		},
		debug: {
			resolve: function (ctx, node) {
				var props = ctx.props(node);
				var source = ctx.expr(props.items || props["in"]) || [];
				var items = source.slice ? source.slice(0) : [];
				if (!source.slice) {
					for (var i = 0; i < source.length; i++) {
						items.push(source[i]);
					}
				}
				var previous = ctx.scopes.current;
				var direction =
					String(ctx.template(props.direction || props.order || "asc") || "asc").toLowerCase() === "desc"
						? -1
						: 1;
				var by = byFor(ctx, node, props);
			var compare = props.compare;
				var args = { items: items, by: { expression: by, deferred: "per item" } };
				Object.defineProperty(args, "__state", {
				value: { items: items, previous: previous, direction: direction, by: by, compare: compare }
				});
				return args;
			},
			run: function (ctx, node, args) {
				var state = args.__state;
				var items = state.items;
				var previous = state.previous;
				var direction = state.direction;
				try {
					return sorted(ctx, items, state.by, direction, state.compare, args);
				} finally {
					ctx.scopes.current = previous;
				}
			}
		}
	};
}())
