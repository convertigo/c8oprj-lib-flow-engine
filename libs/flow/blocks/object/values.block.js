const _meta = {
  "version": 1,
  "icon": "mdi:format-list-bulleted-square",
  "description": "Returns the values of an object as an array.",
  "targets": ["backend", "frontend"],
  "effects": [],
  "implementations": { "backend": { "runtime": "rhino" }, "frontend": { "runtime": "browser", "file": "values.browser.js" } },
  "properties": {
    "source": {
      "label": "source",
      "kind": "expression",
      "type": "object",
      "default": "local.object",
      "description": "Object expression whose values are returned."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.values",
      "description": "Scope path receiving the value array."
    }
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "unknown"
      }
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "values.hooks.js"
  }
}

(function () {
	function sourceValue(ctx, value) {
		if (value === undefined || value === null) {
			return {};
		}
		return typeof value === "string" ? ctx.expr(value) : ctx.template(value);
	}

	function objectValues(value) {
		if (!value) {
			return [];
		}
		if (typeof value.keySet === "function" && typeof value.get === "function") {
			var out = [];
			var iterator = value.keySet().iterator();
			while (iterator.hasNext()) {
				out.push(value.get(iterator.next()));
			}
			return out;
		}
		return Object.keys(value).map(function (key) {
			return value[key];
		});
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return objectValues(sourceValue(ctx, props.source));
		}
	};
}())
