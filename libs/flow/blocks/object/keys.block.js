const _meta = {
  "version": 1,
  "icon": "mdi:key-chain",
  "description": "Returns the keys of an object as an array of strings.",
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
      "default": "local.keys",
      "description": "Scope path receiving the key array."
    }
  },
  "outputs": {
    "out": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "keys.hooks.js"
  }
}

(function () {
	function sourceValue(ctx, value) {
		if (value === undefined || value === null) {
			return {};
		}
		return typeof value === "string" ? ctx.expr(value) : ctx.template(value);
	}

	function javaKeys(value) {
		var out = [];
		if (!value || typeof value.keySet !== "function") {
			return out;
		}
		var iterator = value.keySet().iterator();
		while (iterator.hasNext()) {
			out.push(String(iterator.next()));
		}
		return out;
	}

	function objectKeys(value) {
		if (!value) {
			return [];
		}
		var fromJava = javaKeys(value);
		if (fromJava.length > 0) {
			return fromJava;
		}
		return Object.keys(value).map(function (key) {
			return String(key);
		});
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return objectKeys(sourceValue(ctx, props.source));
		}
	};
}())
