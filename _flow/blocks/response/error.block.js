const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:alert-outline",
  "description": "Answers the error envelope instead of the result, without stopping the Flow and without HTTP status.",
  "longDescription": "A rare, explicit choice: by default write throw { code, message }, which stops the Flow and gives the SDK 200 with the error envelope. response.error lets the Flow go on, then answers { error: { code, message, details } } in place of its result or return, the same envelope as a throw. A later call replaces the earlier one; a later throw still fails the Flow. A caller (flow.call, requestable.call) receives it as a result holding an error property.",
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
      "type": "object",
      "description": "Optional structured error details: each value is evaluated, a path or an expression giving its value.",
    },
  },
  "runtime": "rhino",
  "targets": ["backend"],
  "outputs": { "out": { "type": "unknown", "hidden": true } },
}

(function () {
	function argumentsFor(ctx, node) {
		var props = ctx.props(node);
		return {
			code: props.code || "FLOW_ERROR",
			message: ctx.template(props.message === undefined ? "" : props.message),
			details: props.details === undefined ? undefined : ctx.template(props.details)
		};
	}
	function respond(ctx, node, args) {
		ctx.respondError(args);
	}
	return {
		stateless: true,
		debug: { resolve: argumentsFor, run: respond },
		run: function (ctx, node) { respond(ctx, node, argumentsFor(ctx, node)); }
	};
}())
