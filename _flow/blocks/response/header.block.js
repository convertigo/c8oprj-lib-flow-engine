const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:format-header-pound",
  "description": "Sets an HTTP header of the response of the Flow called by the requester.",
  "longDescription": "A rare, explicit choice for a client outside the SDK. Only the Flow requested over HTTP sets it: a Flow called by another one (flow.call, requestable.call), an MCP tool or a schedule leaves the response of its caller unchanged. The name is an HTTP token and the value has no CR or LF. The headers the engine owns are refused: framing (Content-Length, Transfer-Encoding, Connection, Content-Type, Content-Encoding), cookies (Set-Cookie), security (Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options...), CORS (Access-Control-*) and X-Convertigo-*.",
  "summary": "response header {{name}}",
  "properties": {
    "name": {
      "label": "Header name",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "HTTP header name, an HTTP token; the headers the engine owns are refused.",
    },
    "value": {
      "label": "Header value",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Header value, without CR or LF.",
    },
  },
  "runtime": "rhino",
  "targets": ["backend"],
  "outputs": { "out": { "type": "unknown", "hidden": true } },
}

(function () {
	// The headers the engine sets or the servlet container owns: a Flow cannot replace them.
	var PROTECTED = ["content-length", "transfer-encoding", "connection", "keep-alive", "upgrade", "trailer", "te",
		"content-type", "content-encoding", "content-range", "set-cookie", "set-cookie2", "content-security-policy",
		"content-security-policy-report-only", "strict-transport-security", "x-frame-options", "x-content-type-options",
		"x-xss-protection", "referrer-policy", "permissions-policy", "cross-origin-opener-policy",
		"cross-origin-embedder-policy", "cross-origin-resource-policy", "x-xsrf-token", "server"];
	var PROTECTED_PREFIXES = ["access-control-", "x-convertigo-", "proxy-", "sec-"];
	var TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

	function isProtected(name) {
		var lower = name.toLowerCase();
		return PROTECTED.indexOf(lower) >= 0 || PROTECTED_PREFIXES.some(function (prefix) { return lower.indexOf(prefix) === 0; });
	}
	function argumentsFor(ctx, node) {
		var props = ctx.props(node);
		return { name: ctx.template(props.name), value: ctx.template(props.value) };
	}
	function apply(ctx, node, args) {
		var name = args.name === undefined || args.name === null ? "" : String(args.name);
		var value = args.value === undefined || args.value === null ? "" : String(args.value);
		if (!TOKEN.test(name)) {
			ctx.throwFlow({ code: "RESPONSE_HEADER_INVALID", message: "response.header needs a header name made of an HTTP token, without CR or LF." }, node);
		}
		if (/[\r\n\u0000]/.test(value)) {
			ctx.throwFlow({ code: "RESPONSE_HEADER_INVALID", message: "The value of header " + name + " cannot contain CR, LF or NUL." }, node);
		}
		if (isProtected(name)) {
			ctx.throwFlow({ code: "RESPONSE_HEADER_PROTECTED", message: "Header " + name + " is owned by the engine: a Flow cannot set it.",
				details: { header: name } }, node);
		}
		var response = ctx.httpResponse();
		if (response) response.setResponseHeader(name, value);
	}
	return {
		stateless: true,
		debug: { resolve: argumentsFor, run: apply },
		run: function (ctx, node) { apply(ctx, node, argumentsFor(ctx, node)); }
	};
}())
