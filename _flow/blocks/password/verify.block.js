const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:form-textbox-password",
  "tags": [
    "password",
    "security",
    "account",
    "login",
  ],
  "summary": "verify password",
  "description": "Checks a password against the hash and salt stored by password.hash, in constant time: returns { ok, upgrade }. upgrade is true when the stored hash is a former SHA-1 one (hex of SHA-1(password + \"+\" + salt), as old Convertigo lib_UserManager accounts) or uses fewer iterations than today, so the Flow can store a fresh password.hash after a successful sign-in. A malformed hash or an empty value is a refusal, never an error.",
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
    "hash": {
      "label": "Stored hash",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Hash stored with the account.",
    },
    "salt": {
      "label": "Stored salt",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Salt stored with the account.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
        },
        "upgrade": {
          "type": "boolean",
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

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return ctx.lib("password").verify({
				password: text(ctx, props.password),
				hash: text(ctx, props.hash),
				salt: text(ctx, props.salt)
			});
		}
	};
}())
