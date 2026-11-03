const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:key-chain-variant",
  "tags": [
    "jwt",
    "security",
    "openid",
    "oauth",
  ],
  "description": "Reads the header and claims of a compact JWT without verifying it. Never trust these claims: use jwt.verify before using them, decode only helps choosing how to verify.",
  "summary": "decode JWT {{token}}",
  "uses": [
    "jwt-verify",
  ],
  "properties": {
    "token": {
      "label": "Token",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Compact JWT (header.payload.signature).",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
        },
        "header": {
          "type": "object",
        },
        "claims": {
          "type": "object",
        },
        "error": {
          "type": "string",
        },
      },
    },
  },
  "runtime": "rhino",
}

(function () {
	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.lib("jwt-verify").decode(String(ctx.template(props.token || "") || ""));
		},
		debug: {
			resolve: function (ctx, node) {
				var p = ctx.props(node),
					receiver = ctx.lib("jwt-verify"),
					method = receiver.decode,
					args = { token: String(ctx.template(p.token || "") || "") };
				Object.defineProperties(args, { __receiver: { value: receiver }, __method: { value: method } });
				return args;
			},
			run: function (ctx, node, args) {
				return args.__method.call(args.__receiver, args.token);
			}
		}
	};
}())
