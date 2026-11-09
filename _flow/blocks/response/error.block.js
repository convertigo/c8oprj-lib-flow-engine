const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:alert-outline",
  "description": "Writes the standard error structure { code, message, details } at a path, result.error by default, without stopping the Flow and without HTTP status.",
  "longDescription": "A rare, explicit choice: by default write throw { code, message }, which stops the Flow and gives the SDK 200 with the error envelope. Like the error step of a sequence, response.error adds an error beside what the Flow already answers: the rest of result stays, the Flow goes on. A later call at the same path replaces the earlier one. With a local path (local.error), the structure is only a value for the next blocks, as an error step whose output is false.",
  "summary": "response error {{code}}: {{message}}",
  "properties": {
    "code": {
      "label": "Error code",
      "kind": "text",
      "type": "string",
      "default": "FLOW_ERROR",
      "description": "Structured error code.",
    },
    "message": {
      "label": "Message",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Error message template.",
    },
    "details": {
      "label": "Details",
      "category": "Expert",
      "kind": "template",
      "type": "unknown",
      "description": "Optional error details: a text or an object whose values are evaluated. Empty text when omitted, as the error step of a sequence.",
    },
    "path": {
      "label": "Destination",
      "category": "Expert",
      "kind": "path",
      "mode": "write",
      "default": "result.error",
      "description": "Scope path receiving { code, message, details }: result.error by default, local.error for a value kept out of the response.",
    },
  },
  "runtime": "rhino",
  "targets": ["backend"],
  "outputs": { "out": { "type": "unknown", "hidden": true } },
  "hooks": {
    "file": "error.hooks.js",
  },
}

(function () {
	function argumentsFor(ctx, node) {
		var props = ctx.props(node);
		return {
			code: props.code || "FLOW_ERROR",
			message: ctx.template(props.message === undefined ? "" : props.message),
			details: props.details === undefined ? "" : ctx.template(props.details),
			path: props.path || "result.error"
		};
	}
	// The structure of the error step of a sequence: code, message and details (empty text when omitted, which the SDK
	// reads as an error), written at its path beside what is already there.
	function respond(ctx, node, args) {
		var details = args.details === undefined || args.details === null ? "" : args.details;
		ctx.write(args.path || "result.error", {
			code: String(args.code || "FLOW_ERROR"),
			message: args.message === undefined || args.message === null ? "" : String(args.message),
			details: details
		});
	}
	return {
		stateless: true,
		debug: { resolve: argumentsFor, run: respond },
		run: function (ctx, node) { respond(ctx, node, argumentsFor(ctx, node)); }
	};
}())
