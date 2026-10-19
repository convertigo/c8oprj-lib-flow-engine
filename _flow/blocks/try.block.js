const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:shield-alert-outline",
  "tags": [
    "control",
  ],
  "description": "Runs try; when a block in it fails (throw, a failed call, an email that cannot be sent), writes the error to the error path and runs catch instead of failing the Flow.",
  "summary": [
    "try -> {{error}}",
    "try",
  ],
  "slots": [
    {
      "name": "try",
      "label": "Try",
      "acceptsFrom": "parentSlot",
      "scope": "caller",
      "description": "Runs in the caller scope; its first error stops it and goes to catch.",
    },
    {
      "name": "catch",
      "label": "Catch",
      "acceptsFrom": "parentSlot",
      "scope": "caller",
      "description": "Runs in the caller scope when try failed, with the error at the error path.",
    },
  ],
  "properties": {
    "error": {
      "label": "Error",
      "kind": "path",
      "mode": "write",
      "default": "local.error",
      "description": "Scope path receiving { code, message, status, hint } when try fails.",
    },
  },
  "runtime": "rhino",
  "outputs": { "out": { "type": "unknown", "hidden": true } },
  "hooks": {
    "file": "try.hooks.js",
  },
  "children": [
    "try",
    "catch",
  ],
}

(function () {
	// { code, message, status, hint } of a Flow error (throw, raise) or a Java exception
	function errorValue(error) {
		var value = error && (error.flowError || error.error || error) || {};
		var message = value.message !== undefined ? value.message
			: error && error.javaException ? error.javaException.getMessage() : String(error);
		return {
			code: String(value.code || (error && error.javaException ? "JAVA_EXCEPTION" : "FLOW_ERROR")),
			message: String(message === undefined || message === null ? "" : message),
			status: value.status === undefined || value.status === null ? null : Number(value.status),
			hint: value.hint === undefined || value.hint === null ? "" : String(value.hint)
		};
	}

	function runTry(ctx, node, errorPath) {
		try {
			return ctx.runNodes(node["try"] || []);
		} catch (error) {
			ctx.write(errorPath || "local.error", errorValue(error));
			return ctx.runNodes(node["catch"] || []);
		}
	}

	return {
		prepareNode: function (node, helpers) {
			var errorPath = helpers.props.error || "local.error";
			return function (ctx, runNode) {
				return runTry(ctx, runNode, errorPath);
			};
		},
		run: function (ctx, node) {
			var props = ctx.props(node);
			return runTry(ctx, node, props.error || "local.error");
		}
	};
}())
