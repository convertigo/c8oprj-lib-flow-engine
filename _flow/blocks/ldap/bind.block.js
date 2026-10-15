const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:login",
  "tags": [
    "ldap",
    "directory",
    "active directory",
    "authentication",
    "security",
  ],
  "summary": "LDAP bind {{principal}}",
  "description": "Checks a principal and its password against an LDAP or Active Directory directory with a simple bind: a DN, a user@domain or a DOMAIN\\user. Never binds without a password. Returns { ok, principal } or { ok: false, reason: principalRequired | passwordRequired | invalidCredentials, error }; a directory that cannot be reached is a Flow error (LDAP_CONNECTION_FAILED). To look the user up by login first, use ldap.authenticate.",
  "uses": [
    "ldap",
  ],
  "properties": {
    "url": {
      "label": "Directory URL",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "ldap://host[:389] or ldaps://host[:636], several separated by commas for failover. Read it from config.",
    },
    "principal": {
      "label": "Principal",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "DN (cn=John,ou=users,dc=example,dc=org), user@domain or DOMAIN\\user.",
    },
    "password": {
      "label": "Password",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Password of the principal, usually the one typed by the user. Empty is refused (unauthenticated bind).",
    },
    "anonymous": {
      "label": "Anonymous",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Binds without credentials to check that the directory answers; the principal and password are ignored.",
    },
    "referral": {
      "label": "Referrals",
      "category": "Expert",
      "kind": "literal",
      "type": "string",
      "enum": [
        "ignore",
        "follow",
      ],
      "default": "ignore",
      "description": "What to do with the referrals of the directory.",
    },
    "connectTimeoutMs": {
      "label": "Connection timeout (ms)",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 10000,
      "description": "Time to establish the connection.",
    },
    "readTimeoutMs": {
      "label": "Read timeout (ms)",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 30000,
      "description": "Time to wait for an answer of the directory.",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
        },
        "principal": {
          "type": "string",
        },
        "reason": {
          "type": "string",
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
			try {
				return ctx.lib("ldap").bind({
					url: text(ctx, props.url),
					principal: text(ctx, props.principal),
					password: text(ctx, props.password),
					anonymous: value(ctx, props.anonymous) === true,
					referral: props.referral,
					connectTimeoutMs: value(ctx, props.connectTimeoutMs),
					readTimeoutMs: value(ctx, props.readTimeoutMs)
				});
			} catch (e) {
				if (e && e.ldap) {
					return ctx.throwFlow({ code: e.code, message: e.message, status: e.status, details: e.details }, node);
				}
				throw e;
			}
		}
	};
}())
