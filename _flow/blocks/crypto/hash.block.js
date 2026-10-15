const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:fingerprint",
  "tags": [
    "crypto",
    "hash",
    "security",
    "digest",
  ],
  "summary": "{{algorithm}} of {{text}}",
  "description": "Digest of a text (SHA-256 by default, SHA-1, SHA-384, SHA-512 or MD5 for legacy checksums), as hex, base64 or base64url. Use it for fingerprints and for keys sent by email whose hash only is stored; never for passwords (password.hash) nor for signatures (crypto.hmac).",
  "properties": {
    "text": {
      "label": "Text",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Text to digest (UTF-8).",
    },
    "algorithm": {
      "label": "Algorithm",
      "kind": "literal",
      "type": "string",
      "enum": [
        "sha256",
        "sha1",
        "sha384",
        "sha512",
        "md5",
      ],
      "default": "sha256",
      "description": "Digest algorithm.",
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
      "description": "Encoding of the digest.",
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
	var ALGORITHMS = { sha256: "SHA-256", sha1: "SHA-1", sha384: "SHA-384", sha512: "SHA-512", md5: "MD5" };

	function encode(bytes, encoding) {
		if (encoding === "base64") {
			return String(java.util.Base64.getEncoder().encodeToString(bytes));
		}
		if (encoding === "base64url") {
			return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
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
			var rendered = props.text === undefined || props.text === null ? "" : ctx.template(props.text);
			var text = rendered === undefined || rendered === null ? "" : String(rendered);
			var algorithm = ALGORITHMS[String(props.algorithm || "sha256")];
			if (!algorithm) {
				return ctx.throwFlow({ code: "CRYPTO_ALGORITHM_INVALID", message: "crypto.hash: unknown algorithm " + props.algorithm, status: 400 }, node);
			}
			var digest = java.security.MessageDigest.getInstance(algorithm).digest(new java.lang.String(text).getBytes("UTF-8"));
			return encode(digest, String(props.encoding || "hex"));
		}
	};
}())
