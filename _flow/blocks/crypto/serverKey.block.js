const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:fingerprint",
  "tags": [
    "crypto",
    "security",
    "secret",
    "token",
  ],
  "summary": "server key for {{purpose}}",
  "description": "A secret derived from the passphrase of this server (engine property Crypto passphrase) for one purpose, as 64 hex characters: HMAC-SHA256 of the purpose keyed by the passphrase. Use it as the secret of jwt.sign / jwt.verify or crypto.hmac when the application has no dedicated .secret symbol: the passphrase itself is never exposed, two purposes give two unrelated keys, and the servers of a cluster share it. Prefer a dedicated secret symbol when the application configures one. Outside a Convertigo server (tests) it is a Flow error (CRYPTO_SERVER_KEY_UNAVAILABLE).",
  "properties": {
    "purpose": {
      "label": "Purpose",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Name of the use of the key, for example lib_UserManager.secureToken; it must not change once tokens are issued with it.",
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
	function passphrase() {
		try {
			var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
			var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
			var value = EnginePropertiesManager.getProperty(PropertyName.CRYPTO_PASSPHRASE);
			return value == null ? "" : String(value);
		} catch (e) {
			return "";
		}
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var rendered = props.purpose === undefined || props.purpose === null ? "" : ctx.template(props.purpose);
			var purpose = (rendered === undefined || rendered === null ? "" : String(rendered)).trim();
			if (purpose === "") {
				return ctx.throwFlow({ code: "CRYPTO_PURPOSE_REQUIRED", message: "crypto.serverKey: the purpose is empty", status: 400 }, node);
			}
			var secret = passphrase();
			if (secret === "") {
				return ctx.throwFlow({ code: "CRYPTO_SERVER_KEY_UNAVAILABLE", message: "crypto.serverKey: the passphrase of the server is not available", status: 500 }, node);
			}
			var mac = javax.crypto.Mac.getInstance("HmacSHA256");
			mac.init(new javax.crypto.spec.SecretKeySpec(new java.lang.String(secret).getBytes("UTF-8"), "HmacSHA256"));
			var bytes = mac.doFinal(new java.lang.String("convertigo-flow:" + purpose).getBytes("UTF-8"));
			var hex = "";
			for (var i = 0; i < bytes.length; i++) {
				hex += ("0" + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
			}
			return hex;
		}
	};
}())
