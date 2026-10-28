const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:fingerprint",
  "tags": [
    "crypto",
    "hmac",
    "security",
    "signature",
  ],
  "summary": "HMAC of {{text}}",
  "description": "Keyed digest of a text (HMAC-SHA256 by default, SHA-384 or SHA-512) with a secret read from config, as hex, base64 or base64url: signatures of webhooks, links or cookies that this server checks later with crypto.equals. For JWT use jwt.sign; an empty secret is a Flow error.",
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Text to sign (UTF-8).",
    },
    "secret": {
      "label": "Secret",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Secret of the signature. Read it from config (a .secret symbol), never write it in the Flow.",
    },
    "algorithm": {
      "label": "Algorithm",
      "kind": "literal",
      "type": "string",
      "enum": [
        "sha256",
        "sha384",
        "sha512",
      ],
      "default": "sha256",
      "description": "Hash of the HMAC.",
    },
    "encoding": {
      "label": "Encoding",
      "kind": "literal",
      "type": "string",
      "enum": [
        "hex",
        "base64",
        "base64url",
      ],
      "default": "hex",
      "description": "Encoding of the signature.",
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
	// The classes of the JDK come from the engine that evaluates the module (flowEngineClass, kept for the runtime), else
	// by their full names: through the Packages of a call, each name looked up the names of its packages as classes again.
	function javaClass(name) {
		return typeof flowEngineClass === "function" ? flowEngineClass(name) : Packages[name];
	}
	var Base64 = javaClass("java.util.Base64");
	var Mac = javaClass("javax.crypto.Mac");
	var SecretKeySpec = javaClass("javax.crypto.spec.SecretKeySpec");
	var JavaString = javaClass("java.lang.String");
	var ALGORITHMS = { sha256: "HmacSHA256", sha384: "HmacSHA384", sha512: "HmacSHA512" };

	function text(ctx, value) {
		var rendered = value === undefined || value === null ? "" : ctx.template(value);
		return rendered === undefined || rendered === null ? "" : String(rendered);
	}

	function encode(bytes, encoding) {
		if (encoding === "base64") {
			return String(Base64.getEncoder().encodeToString(bytes));
		}
		if (encoding === "base64url") {
			return String(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
		}
		var hex = "";
		for (var i = 0; i < bytes.length; i++) {
			hex += ("0" + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
		}
		return hex;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var algorithm = ALGORITHMS[String(props.algorithm || "sha256")];
			if (!algorithm) {
				return ctx.throwFlow({ code: "CRYPTO_ALGORITHM_INVALID", message: "crypto.hmac: unknown algorithm " + props.algorithm, status: 400 }, node);
			}
			var secret = text(ctx, props.secret);
			if (secret === "") {
				return ctx.throwFlow({ code: "CRYPTO_SECRET_REQUIRED", message: "crypto.hmac: the secret is empty", status: 500 }, node);
			}
			var mac = Mac.getInstance(algorithm);
			mac.init(new SecretKeySpec(new JavaString(secret).getBytes("UTF-8"), algorithm));
			return encode(mac.doFinal(new JavaString(text(ctx, props.text)).getBytes("UTF-8")), String(props.encoding || "hex"));
		}
	};
}())
