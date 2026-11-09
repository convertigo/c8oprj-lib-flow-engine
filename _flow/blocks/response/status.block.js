const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:numeric",
  "description": "Sets the HTTP status of the response, also from a Flow called by another one.",
  "longDescription": "A rare, explicit choice for a client outside the SDK: by default a Flow answers 200, and throw { code, message } gives the SDK 200 with the error envelope. The code is an integer from 100 to 599. As the status step of a sequence, a Flow called by another one (flow.call, requestable.call) sets the response of the HTTP request at the root of its calls; a call without HTTP request (a schedule, a FullSync listener) has no effect, without error. A later call replaces the earlier one; an internal failure still answers 500.",
  "summary": "response status {{code}}",
  "properties": {
    "code": {
      "label": "Status code",
      "kind": "value",
      "type": "integer",
      "default": 200,
      "description": "HTTP status code, an integer from 100 to 599.",
    },
  },
  "runtime": "rhino",
  "targets": ["backend"],
  "outputs": { "out": { "type": "unknown", "hidden": true } },
}

(function () {
	function argumentsFor(ctx, node) {
		return { code: ctx.template(ctx.props(node).code) };
	}
	function apply(ctx, node, args) {
		var code = typeof args.code === "string" && /^\d{3}$/.test(args.code) ? Number(args.code) : args.code;
		if (typeof code !== "number" || !Number.isSafeInteger(code) || code < 100 || code > 599) {
			ctx.throwFlow({ code: "RESPONSE_STATUS_INVALID", message: "response.status needs an integer code from 100 to 599." }, node);
		}
		var response = ctx.httpResponse();
		if (response) response.setResponseStatus(code, "");
	}
	return {
		stateless: true,
		debug: { resolve: argumentsFor, run: apply },
		run: function (ctx, node) { apply(ctx, node, argumentsFor(ctx, node)); }
	};
}())
