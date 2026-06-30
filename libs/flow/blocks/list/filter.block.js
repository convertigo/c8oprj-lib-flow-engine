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
      "current": "item",
      "sourceProperty": "items",
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
	function comparable(value) {
		if (typeof value === "string" && value.trim() !== "") {
			var number = Number(value);
			if (!isNaN(number)) {
				return number;
			}
		}
		return value;
	}

	function literal(value) {
		value = String(value || "").trim();
		if (/^-?(?:\d+|\d*\.\d+)$/.test(value)) {
			return { ok: true, value: Number(value) };
		}
		if (value === "true") {
			return { ok: true, value: true };
		}
		if (value === "false") {
			return { ok: true, value: false };
		}
		if (value === "null") {
			return { ok: true, value: null };
		}
		if (value === "undefined") {
			return { ok: true, value: undefined };
		}
		if (value.charAt(0) === "\"" && value.charAt(value.length - 1) === "\"") {
			try {
				return { ok: true, value: JSON.parse(value) };
			} catch (e) {
			}
		}
		if (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
			return { ok: true, value: value.substring(1, value.length - 1) };
		}
		return { ok: false };
	}

	function operand(ctx, source) {
		source = String(source || "").trim();
		if (source === "current") {
			return { ok: true, current: true, path: "" };
		}
		if (source.indexOf("current.") === 0) {
			return { ok: true, current: true, path: source.substring("current.".length) };
		}
		var parsed = literal(source);
		if (parsed.ok) {
			return { ok: true, value: parsed.value };
		}
		if (/^(request|input|config|local|result|trace)(?:\.[A-Za-z_$][\w$]*|\.\d+)*$/.test(source)) {
			return { ok: true, value: ctx.read(source) };
		}
		return { ok: false };
	}

	function valueOf(ctx, spec, item) {
		return spec.current ? ctx.readObjectPath(item, spec.path) : spec.value;
	}

	function compare(left, op, right) {
		if (op === "==" || op === "!=") {
			return op === "!=" ? left != right : left == right;
		}
		left = comparable(left);
		right = comparable(right);
		if (op === ">") {
			return left > right;
		}
		if (op === ">=") {
			return left >= right;
		}
		if (op === "<") {
			return left < right;
		}
		return left <= right;
	}

	function predicateFor(ctx, where) {
		var match = String(where || "").match(/^\s*(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$/);
		if (!match) {
			return null;
		}
		var left = operand(ctx, match[1]);
		var right = operand(ctx, match[3]);
		if (!left.ok || !right.ok) {
			return null;
		}
		var op = match[2];
		return function (item) {
			return compare(valueOf(ctx, left, item), op, valueOf(ctx, right, item));
		};
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var items = ctx.expr(props.items || props["in"]) || [];
			var previous = ctx.scopes.current;
			var filtered = [];
			var predicate = predicateFor(ctx, props.where);
			try {
				for (var i = 0; i < items.length; i++) {
					var item = items[i];
					ctx.scopes.current = item;
					if (predicate ? predicate(item) : ctx.expr(props.where)) {
						filtered.push(items[i]);
					}
				}
				return filtered;
			} finally {
				ctx.scopes.current = previous;
			}
		}
	};
}())
