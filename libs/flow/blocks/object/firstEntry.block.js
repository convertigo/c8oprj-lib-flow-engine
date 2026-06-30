const _meta = {
  "version": 1,
  "icon": "mdi:format-list-bulleted-square",
  "description": "Returns the first object entry as { key, value }.",
  "properties": {
    "source": {
      "label": "source",
      "kind": "expression",
      "type": "object",
      "default": "local.object",
      "description": "Object expression to inspect."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.entry",
      "description": "Scope path receiving an object with key and value."
    }
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "value": {
          "type": "unknown"
        }
      }
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "firstEntry.hooks.js"
  }
}

(function () {
	function sourceValue(ctx, value) {
		if (value === undefined || value === null) {
			return {};
		}
		return typeof value === "string" ? ctx.expr(value) : ctx.template(value);
	}

	function firstKey(value) {
		if (!value) {
			return null;
		}
		if (typeof value.keySet === "function") {
			var iterator = value.keySet().iterator();
			return iterator.hasNext() ? String(iterator.next()) : null;
		}
		var keys = Object.keys(value);
		return keys.length > 0 ? keys[0] : null;
	}

	function readDirect(value, key) {
		if (value === undefined || value === null || key === null) {
			return undefined;
		}
		if (value[key] !== undefined) {
			return value[key];
		}
		if (typeof value.get === "function") {
			return value.get(key);
		}
		return undefined;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = sourceValue(ctx, props.source);
			var key = firstKey(source);
			return {
				key: key,
				value: readDirect(source, key)
			};
		}
	};
}())
