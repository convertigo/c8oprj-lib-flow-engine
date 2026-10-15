const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:form-textbox-password",
  "tags": [
    "password",
    "security",
    "account",
    "hash",
  ],
  "summary": "hash password",
  "description": "Hashes a password for storage with PBKDF2-HMAC-SHA256 (210 000 iterations, 32 byte random salt): returns { hash: \"pbkdf2-sha256$210000$...\", salt }. Store both with the account and check a sign-in with password.verify. The format is the one of the Convertigo lib_UserManager accounts. An empty password is a Flow error.",
  "uses": [
    "password",
  ],
  "properties": {
    "password": {
      "label": "Password",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Password typed by the user.",
    },
    "iterations": {
      "label": "Iterations",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 210000,
      "description": "PBKDF2 iterations, between 100 000 and 500 000.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "hash": {
          "type": "string",
        },
        "salt": {
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
			try {
				return ctx.lib("password").hash({
					password: text(ctx, props.password),
					iterations: value(ctx, props.iterations)
				});
			} catch (e) {
				if (e && e.code) {
					return ctx.throwFlow({ code: e.code, message: "password.hash: " + e.message, status: 400 }, node);
				}
				throw e;
			}
		}
	};
}())
