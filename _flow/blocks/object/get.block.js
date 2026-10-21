const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:key-arrow-right",
  "description": "Reads one value from an object by key or nested path.",
  "summary": "{{source}} [ {{key}} ]",
  "targets": [
    "backend",
    "frontend",
  ],
  "effects": [],
  "implementations": {
    "backend": {
      "runtime": "rhino",
    },
    "frontend": {
      "runtime": "browser",
      "file": "get.browser.js",
      "version": 1,
    },
  },
  "properties": {
    "source": {
      "label": "Object",
      "kind": "expression",
      "type": "object",
      "default": "local.object",
      "description": "Object expression to read from.",
    },
    "key": {
      "label": "Key",
      "kind": "value",
      "type": "string",
      "default": "${local.key}",
      "description": "Literal key or dotted path to read. Quote arbitrary keys such as display name or x-y; use a source such as current.code for a dynamic key.",
    },
    "defaultValue": {
      "label": "Default value",
      "category": "Expert",
      "kind": "value",
      "type": "unknown",
      "default": null,
      "expert": true,
      "description": "Fallback value used when the key is missing.",
    },
  },
  "outputs": {
    "out": {
      "type": "unknown",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "get.hooks.js",
  },
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
		return /\$\{|\{\{/.test(text) ||
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
		if (/\$\{|\{\{/.test(text)) {
			var rendered = ctx.template(text);
			return rendered === undefined || rendered === null ? "" : String(rendered);
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
		prepareNode: function (node, helpers) {
			var props = helpers.props, rawSource = props.source;
			var source = typeof rawSource === "string" ? helpers.compileExpression(rawSource) : helpers.compileValue(rawSource == null ? {} : rawSource);
			var rawKey = props.key, key;
			if (typeof rawKey !== "string") {
				var value = helpers.compileValue(rawKey);
				key = function (ctx) { return rawKey == null ? "" : String(value(ctx)); };
			} else {
				var text = rawKey.trim();
				if (/\$\{|\{\{/.test(text)) {
					var render = helpers.compileValue(text);
					key = function (ctx) { var v = render(ctx); return v == null ? "" : String(v); };
				} else if (!looksDynamic(text)) key = function () { return text; };
				else {
					var expression = null;
					try { expression = helpers.compileExpression(text); } catch (_literalKey) { }
					key = function (ctx) { if (!expression) return text; try { return String(expression(ctx)); } catch (_literalKey) { return text; } };
				}
			}
			var fallback;
			return function (ctx) {
				var object = source(ctx), name = key(ctx), value = readDirect(object, name);
				if (value === undefined && name.indexOf(".") !== -1) value = ctx.readObjectPath(object, name);
				if (value !== undefined || props.defaultValue === undefined) return value;
				if (!fallback) fallback = helpers.compileValue(props.defaultValue);
				return fallback(ctx);
			};
		},
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
