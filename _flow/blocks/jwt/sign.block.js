const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:signature-freehand",
  "tags": [
    "jwt",
    "security",
    "token",
    "session",
  ],
  "summary": "sign JWT {{algorithm}}",
  "description": "Issues a compact JWT signed with a shared secret (HS256, HS384 or HS512), for tokens this server verifies itself with jwt.verify and the same secret: remember-me tokens, links, API tokens. iat is set now, exp from Expires in unless the claims carry one. Read the secret from config (a .secret symbol), never write it in the Flow. An invalid request (no secret, claims not an object) is a Flow error.",
  "uses": [
    "jwt-verify",
  ],
  "properties": {
    "claims": {
      "label": "Claims",
      "kind": "value",
      "type": "object",
      "description": "Payload of the token, for example { sub: input.user, scope: \"app\" }.",
    },
    "secret": {
      "label": "Secret",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Shared secret of the signature, at least as long as the hash (32 characters for HS256). Read it from config.",
    },
    "expiresInSeconds": {
      "label": "Expires in (s)",
      "kind": "value",
      "type": "integer",
      "description": "Lifetime of the token from now; empty issues a token without exp unless the claims carry one.",
    },
    "algorithm": {
      "label": "Algorithm",
      "category": "Expert",
      "kind": "literal",
      "type": "string",
      "enum": [
        "HS256",
        "HS384",
        "HS512",
      ],
      "default": "HS256",
      "description": "HMAC algorithm of the signature.",
    },
    "header": {
      "label": "Header fields",
      "category": "Expert",
      "kind": "value",
      "type": "object",
      "description": "Extra header fields such as { kid: \"2026\" }; alg and typ are set by the block.",
    },
  },
  "outputs": {
    "out": {
      "type": "string",
    },
  },
  "runtime": "rhino",
}

(function () {
	function text(ctx, value) {
		var rendered = value === undefined || value === null ? "" : ctx.template(value);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	function value(ctx, raw) {
		return raw === undefined || raw === null || raw === "" ? undefined : ctx.input({ value: raw });
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			try {
				return ctx.lib("jwt-verify").sign({
					claims: value(ctx, props.claims),
					secret: text(ctx, props.secret),
					expiresInSeconds: value(ctx, props.expiresInSeconds),
					algorithm: props.algorithm,
					header: value(ctx, props.header)
				});
			} catch (e) {
				if (e && e.message && !(e instanceof Error)) {
					return ctx.throwFlow({ code: "JWT_SIGN_INVALID", message: "jwt.sign: " + e.message, status: 500 }, node);
				}
				throw e;
			}
		}
	};
}())
