const _meta = {
  "version": 1,
  "icon": "mdi:cog-transfer-outline",
  "tags": [
    "config",
    "control",
    "scope"
  ],
  "description": "Runs child nodes with temporary config overrides.",
  "longDescription": "Override config branches for the child slot only. Root keys in the argument object are config branches; then is the child slot. Overrides are deep-merged and the previous config is restored after execution.",
  "slots": [
    {
      "name": "then",
      "label": "Then",
      "scope": "caller",
      "description": "Runs in the caller scope while the merged config is active."
    }
  ],
  "properties": {},
  "additionalProperties": {
    "kind": "template",
    "type": "object",
    "description": "Config branch override. Example: http: { timeout: 30000 }."
  },
  "runtime": "rhino",
  "children": [
    "then"
  ]
}

(function () {
	function clone(value) {
		if (value === undefined || value === null || typeof value !== "object") {
			return value;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(clone);
		}
		var out = {};
		Object.keys(value).forEach(function (key) {
			out[key] = clone(value[key]);
		});
		return out;
	}

	function isPlainObject(value) {
		return value !== null && value !== undefined && typeof value === "object" &&
			Object.prototype.toString.call(value) === "[object Object]";
	}

	function mergeDeep(base, override) {
		var out = clone(base || {});
		Object.keys(override || {}).forEach(function (key) {
			var value = override[key];
			if (isPlainObject(out[key]) && isPlainObject(value)) {
				out[key] = mergeDeep(out[key], value);
			} else {
				out[key] = clone(value);
			}
		});
		return out;
	}

	function configOverrides(ctx, props) {
		var out = {};
		var reserved = {
			id: true,
			comment: true,
			out: true
		};
		Object.keys(props || {}).forEach(function (key) {
			if (reserved[key]) {
				return;
			}
			out[key] = ctx.template(props[key]);
		});
		return out;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var previous = ctx.scopes.config;
			ctx.scopes.config = mergeDeep(previous || {}, configOverrides(ctx, props));
			try {
				return ctx.runNodes(node.then || []);
			} finally {
				ctx.scopes.config = previous;
			}
		}
	};
}())
