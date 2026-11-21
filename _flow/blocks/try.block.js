const _meta = {
  "sourceVersion": 2,
  "version": 3,
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
      "description": "Scope path receiving { code, message, status, hint } when try fails, details when the error has some (the details of a throw, as JavaScript reads e.details), and the other fields of the thrown object (throw { code, message, field: \"amount\" } gives e.field). The error itself stays attached to that value, hidden: throw({ error: path }) raises it again unchanged.",
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
	// { code, message, status, hint } of a Flow error (throw, raise) or a Java exception, and its details when it has some:
	// in catch (e), e.details reads the details of the thrown error as in JavaScript (absent, so undefined, when it has none).
	// The other fields of the thrown object (throw { code, message, field: "amount" }) stay on it, as in JavaScript:
	// e.field reads "amount". The envelope names (path, stack, operation, __*, convertigo.*) are never fields.
	function errorValue(error) {
		var value = error && (error.flowError || error.error || error) || {};
		var message = value.message !== undefined ? value.message
			: error && error.javaException ? error.javaException.getMessage() : String(error);
		var out = {
			code: String(value.code || (error && error.javaException ? "JAVA_EXCEPTION" : "FLOW_ERROR")),
			message: String(message === undefined || message === null ? "" : message),
			status: value.status === undefined || value.status === null ? null : Number(value.status),
			hint: value.hint === undefined || value.hint === null ? "" : String(value.hint)
		};
		if (value.details !== undefined) out.details = value.details;
		var fields = value.fields;
		if (fields && typeof fields === "object") Object.keys(fields).forEach(function (key) {
			if (!Object.prototype.hasOwnProperty.call(out, key) && fields[key] !== undefined) out[key] = fields[key];
		});
		return out;
	}

	// The caught error stays on the value written to the error path, hidden (not enumerable: never in a result, a trace or
	// a comparison), so that throw({ error }) raises it again unchanged: code, message, details, status, and whether it
	// is an application error (answered 200 with its envelope) or a failure of the Flow (500).
	function caughtValue(error) {
		var value = errorValue(error);
		if (error !== null && error !== undefined) Object.defineProperty(value, "__flowCaughtError", { value: error });
		return value;
	}

	function runTry(ctx, node, errorPath) {
		try {
			return ctx.runNodes(node["try"] || []);
		} catch (error) {
			ctx.write(errorPath || "local.error", caughtValue(error));
			return ctx.runNodes(node["catch"] || []);
		}
	}

	return {
		stateless: true,
		prepareNode: function (node, helpers) {
			var errorPath = helpers.props.error || "local.error";
			var runner = function (ctx, runNode) { return runTry(ctx, runNode, errorPath); };
			return helpers.debug ? helpers.debug(runner,
				function () { return { error:errorPath }; },
				function (ctx,runNode,args) { return runTry(ctx,runNode,args.error); }) : runner;
		},
		run: function (ctx, node) {
			var props = ctx.props(node);
			return runTry(ctx, node, props.error || "local.error");
		}
	};
}())
