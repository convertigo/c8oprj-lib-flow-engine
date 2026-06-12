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
  "properties": {
    "overrides": {
      "label": "Overrides",
      "kind": "configOverrides",
      "type": "object",
      "default": {},
      "description": "Config branches active only while the Then slot runs."
    }
  },
  "additionalProperties": {
    "kind": "configOverrides",
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

	function putBranch(out, name, value) {
		var parts = String(name || "").split(".").filter(function (part) {
			return part;
		});
		if (!parts.length) {
			return out;
		}
		var cursor = out;
		for (var i = 0; i < parts.length - 1; i++) {
			var part = parts[i];
			if (!isPlainObject(cursor[part])) {
				cursor[part] = {};
			}
			cursor = cursor[part];
		}
		var leaf = parts[parts.length - 1];
		cursor[leaf] = isPlainObject(cursor[leaf]) && isPlainObject(value) ? mergeDeep(cursor[leaf], value) : clone(value);
		return out;
	}

	function mergeBranches(out, branches) {
		Object.keys(branches || {}).forEach(function (key) {
			putBranch(out, key, branches[key]);
		});
		return out;
	}

	function configOverrides(ctx, props) {
		var out = {};
		var reserved = {
			id: true,
			comment: true,
			out: true,
			overrides: true
		};
		Object.keys(props || {}).forEach(function (key) {
			if (reserved[key]) {
				return;
			}
			putBranch(out, key, ctx.template(props[key]));
		});
		mergeBranches(out, ctx.template(props && props.overrides || {}));
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
