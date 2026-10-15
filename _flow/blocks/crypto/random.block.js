const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:dice-5-outline",
  "tags": [
    "crypto",
    "random",
    "security",
    "token",
  ],
  "summary": "random {{bytes}} bytes",
  "description": "Cryptographically secure random value (java.security.SecureRandom) of the given number of bytes, as base64url (default, safe in URLs), hex or base64: keys sent by email, one-time codes, session or API tokens. Store the crypto.hash of a key sent out, never the key itself.",
  "properties": {
    "bytes": {
      "label": "Bytes",
      "kind": "value",
      "type": "integer",
      "default": 32,
      "description": "Number of random bytes, from 8 to 1024.",
    },
    "encoding": {
      "label": "Encoding",
      "kind": "literal",
      "type": "string",
      "enum": [
        "base64url",
        "hex",
        "base64",
      ],
      "default": "base64url",
      "description": "Encoding of the value.",
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
	function encode(bytes, encoding) {
		if (encoding === "base64") {
			return String(java.util.Base64.getEncoder().encodeToString(bytes));
		}
		if (encoding === "hex") {
			var hex = "";
			for (var i = 0; i < bytes.length; i++) {
				hex += ("0" + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
			}
			return hex;
		}
		return String(java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var count = props.bytes === undefined || props.bytes === null || props.bytes === "" ? 32 : Number(ctx.input({ value: props.bytes }));
			if (!isFinite(count) || count < 8 || count > 1024) {
				return ctx.throwFlow({ code: "CRYPTO_RANDOM_SIZE_INVALID", message: "crypto.random: bytes must be between 8 and 1024", status: 400 }, node);
			}
			var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, Math.floor(count));
			new java.security.SecureRandom().nextBytes(bytes);
			return encode(bytes, String(props.encoding || "base64url"));
		}
	};
}())
