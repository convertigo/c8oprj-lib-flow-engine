const _meta = {
  "sourceVersion": 2,
  "version": 3,
  "icon": "mdi:sort",
  "tags": [
    "list",
    "array",
    "sort",
    "order",
    "current",
  ],
  "description": "Sorts an array copy by a current.* expression.",
  "longDescription": "Without compare, keeps Flow ordering: numeric text is numeric and null is empty text. With compare, sorts a copy with Array.prototype.sort and the JavaScript comparator of the raw keys: number is keyA - keyB; locale is String(keyA).localeCompare(String(keyB)); natural is keyA < keyB ? -1 : keyA > keyB ? 1 : 0. Descending swaps the comparator operands. then adds keys, each { by, compare, direction }: the comparator is c1 || c2 || \u2026, evaluated literally, so a 0 or NaN result falls to the next key. Equal items retain their source order.",
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
      "enum": ["number", "locale", "natural"],
      "description": "Optional JavaScript comparator for the sort key: number (a - b), locale (localeCompare) or natural (a < b ? -1 : a > b ? 1 : 0); omit to keep Flow ordering.",
    },
    "then": {
      "label": "Then by",
      "kind": "value",
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "by": { "type": "unknown" },
          "compare": { "type": "string", "enum": ["number", "locale", "natural"] },
          "direction": { "type": "string", "enum": ["asc", "desc"] },
        },
      },
      "description": "Next keys, each { by: current.k, compare, direction } (by omitted: the item itself): used in order when the previous comparators give 0 or NaN, as c1 || c2 in JavaScript.",
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

	// The JavaScript comparator of one key; without compare, the Flow order of comparable keys.
	function compareKeys(compare, left, right) {
		if (compare === "number") return left - right;
		if (compare === "locale") return String(left).localeCompare(String(right));
		if (compare === "natural") return left < right ? -1 : left > right ? 1 : 0;
		if (left < right) return -1;
		if (left > right) return 1;
		return 0;
	}

	function directionOf(ctx, value) {
		return String(ctx.template(value || "asc") || "asc").toLowerCase() === "desc" ? -1 : 1;
	}

	// The keys after the first one: then entries, each { by, compare, direction }; by is read for each item.
	function thenKeys(ctx, node, then) {
		if (then === undefined || then === null) return [];
		if (Object.prototype.toString.call(then) !== "[object Array]") {
			ctx.throwFlow({ code: "LIST_SORT_THEN_INVALID", message: "list.sort then is a list of { by, compare, direction }.", status: 400 }, node);
		}
		return then.map(function (entry) {
			var compare = entry && entry.compare;
			if (!entry || typeof entry !== "object" || compare !== undefined && ["number", "locale", "natural"].indexOf(compare) < 0) {
				ctx.throwFlow({ code: "LIST_SORT_THEN_INVALID", message: "Each list.sort then entry is { by, compare, direction }, compare being number, locale or natural.", status: 400 }, node);
			}
			return { by: entry.by, template: true, compare: compare, direction: directionOf(ctx, entry.direction) };
		});
	}

	function sorted(ctx, items, keys, args) {
		var decorated = [];
		for (var index = 0; index < items.length; index++) {
			ctx.scopes.current = items[index];
			var values = [];
			for (var k = 0; k < keys.length; k++) {
				var key = keys[k].template ? (keys[k].by === undefined ? items[index] : ctx.template(keys[k].by)) : keyOf(ctx, keys[k].by);
				if (k === 0 && args) args.by = key;
				values.push(keys[k].compare ? key : comparable(key));
			}
			decorated.push({ item: items[index], keys: values });
		}
		decorated.sort(function (a, b) {
			// c1 || c2 || …: the first truthy result, else the last one
			var result = 0;
			for (var k = 0; k < keys.length; k++) {
				var left = keys[k].direction < 0 ? b.keys[k] : a.keys[k];
				var right = keys[k].direction < 0 ? a.keys[k] : b.keys[k];
				result = compareKeys(keys[k].compare, left, right);
				if (result) return result;
			}
			return result;
		});
		return decorated.map(function (entry) { return entry.item; });
	}

	function keysOf(ctx, node, props) {
		return [{ by: byFor(ctx, node, props), compare: props.compare, direction: directionOf(ctx, props.direction || props.order) }]
			.concat(thenKeys(ctx, node, props.then));
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
			var keys = keysOf(ctx, node, props);
			try {
				return sorted(ctx, items, keys);
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
				var keys = keysOf(ctx, node, props);
				var args = { items: items, by: { expression: keys[0].by, deferred: "per item" } };
				Object.defineProperty(args, "__state", {
					value: { items: items, previous: previous, keys: keys }
				});
				return args;
			},
			run: function (ctx, node, args) {
				var state = args.__state;
				var items = state.items;
				var previous = state.previous;
				try {
					return sorted(ctx, items, state.keys, args);
				} finally {
					ctx.scopes.current = previous;
				}
			}
		}
	};
}())
