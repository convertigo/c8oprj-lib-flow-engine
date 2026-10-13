const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:shield-key-outline",
  "tags": [
    "jwt",
    "security",
    "openid",
    "oauth",
  ],
  "description": "Verifies a JWT signed with an asymmetric algorithm (RS256/384/512, ES256/384/512; none and HS* are always refused) with a key of an inline JWKS, a JWKS URL or an OpenID discovery document, then its issuer, audience, exp / nbf / iat, required claims and optional at_hash. Never throws: out.ok tells whether the token is trusted, out.error why not.",
  "summary": [
    "verify JWT {{token}} with {{discovery}}",
    "verify JWT {{token}} with {{jwksUri}}",
    "verify JWT {{token}}",
  ],
  "uses": [
    "jwt-verify",
  ],
  "properties": {
    "token": {
      "label": "Token",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Compact JWT (header.payload.signature) to verify.",
    },
    "discovery": {
      "label": "Discovery URL",
      "kind": "template",
      "type": "string",
      "description": "OpenID discovery document URL (.../.well-known/openid-configuration). Gives the JWKS and the expected issuer; a {tenantid} issuer template is resolved with the token tid.",
    },
    "jwksUri": {
      "label": "JWKS URL",
      "kind": "template",
      "type": "string",
      "description": "JWKS URL, when there is no discovery document.",
    },
    "jwks": {
      "label": "JWKS",
      "category": "Expert",
      "kind": "value",
      "type": "object",
      "description": "Inline JWKS ({ keys: [...] }) for static keys, instead of a URL.",
    },
    "issuer": {
      "label": "Issuer",
      "kind": "value",
      "type": "unknown",
      "description": "Accepted issuer, or list of issuers. With a discovery URL, its issuer must be one of them. Without issuer nor discovery, the issuer is not checked.",
    },
    "clientId": {
      "label": "Client id",
      "kind": "template",
      "type": "string",
      "description": "ID token audience rule (OpenID Connect): aud contains the client id, and azp is the client id when there are several audiences.",
    },
    "audience": {
      "label": "Audience",
      "kind": "value",
      "type": "unknown",
      "description": "Accepted audience, or list of audiences: aud must contain one of them. Without client id nor audience, the audience is not checked.",
    },
    "algorithms": {
      "label": "Algorithms",
      "category": "Expert",
      "kind": "value",
      "type": "array",
      "default": [
        "RS256",
      ],
      "description": "Accepted signature algorithms, among RS256, RS384, RS512, ES256, ES384 and ES512.",
    },
    "accessToken": {
      "label": "Access token",
      "kind": "template",
      "type": "string",
      "description": "Access token returned with an ID token: its hash must be the token at_hash.",
    },
    "requiredClaims": {
      "label": "Required claims",
      "kind": "value",
      "type": "array",
      "description": "Claims that must be present, for example [\"sub\", \"iat\"]. exp is always required.",
    },
    "clockSkewSeconds": {
      "label": "Clock skew (s)",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 300,
      "description": "Tolerance applied to exp, nbf and iat.",
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
			return ctx.lib("jwt-verify").verify({
				token: text(ctx, props.token),
				discovery: text(ctx, props.discovery),
				jwksUri: text(ctx, props.jwksUri),
				jwks: value(ctx, props.jwks),
				issuer: value(ctx, props.issuer),
				clientId: text(ctx, props.clientId),
				audience: value(ctx, props.audience),
				algorithms: value(ctx, props.algorithms),
				accessToken: text(ctx, props.accessToken),
				requiredClaims: value(ctx, props.requiredClaims),
				clockSkewSeconds: value(ctx, props.clockSkewSeconds)
			});
		}
	};
}())
