const _meta = {
  "version": 1,
  "icon": "mdi:key-arrow-right",
  "description": "Reads one value from an object by key or nested path.",
  "properties": {
    "source": {
      "label": "source",
      "kind": "expression",
      "type": "object",
      "default": "local.object",
      "description": "Object expression to read from."
    },
    "key": {
      "label": "key",
      "kind": "expression",
      "type": "string",
      "default": "local.key",
      "description": "Key or path to read. Use a literal string such as EUR or a dynamic expression such as current.code."
    },
    "defaultValue": {
      "label": "default",
      "kind": "value",
      "type": "unknown",
      "default": null,
      "expert": true,
      "description": "Fallback value used when the key is missing."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.value",
      "description": "Scope path receiving the selected value."
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js"
  }
}

(function () {
	function sourceValue(ctx, value) {
		if (value === undefined || value === null) {
			return {};
		}
		return typeof value === "string" ? ctx.expr(value) : ctx.template(value);
	}

	function looksDynamic(value) {
		var text = String(value || "").trim();
		return text.indexOf("{{") !== -1 ||
			/^(input|config|local|result|current|request|trace)(\.|\[|$)/.test(text) ||
			/[()?:+\-*\/<>!=&|]/.test(text);
	}

	function keyValue(ctx, value) {
		if (value === undefined || value === null) {
			return "";
		}
		if (typeof value !== "string") {
			return String(ctx.template(value));
		}
		var text = String(value).trim();
		if (text === "") {
			return "";
		}
		if (!looksDynamic(text)) {
			return text;
		}
		try {
			return String(ctx.expr(text));
		} catch (e) {
			return text;
		}
	}

	function readDirect(value, key) {
		if (value === undefined || value === null) {
			return undefined;
		}
		if (value[key] !== undefined) {
			return value[key];
		}
		if (typeof value.get === "function") {
			var mapped = value.get(key);
			if (mapped !== undefined) {
				return mapped;
			}
		}
		return undefined;
	}

	function defaultValue(ctx, props) {
		return props.defaultValue === undefined ? undefined : ctx.input({ value: props.defaultValue });
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var source = sourceValue(ctx, props.source);
			var key = keyValue(ctx, props.key);
			var value = readDirect(source, key);
			if (value === undefined && key.indexOf(".") !== -1) {
				value = ctx.readObjectPath(source, key);
			}
			return value === undefined ? defaultValue(ctx, props) : value;
		}
	};
}())
