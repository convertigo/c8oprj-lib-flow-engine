const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:account-key-outline",
  "tags": [
    "ldap",
    "directory",
    "active directory",
    "authentication",
    "login",
    "security",
  ],
  "summary": "LDAP authenticate {login}",
  "description": "Signs a user in against an LDAP or Active Directory directory by search and bind: the entry of the login is found under the base with the service account (bind DN and password read from config), then its DN is bound with the password typed by the user. The login is escaped in the filter and an empty password is refused. Returns { ok: true, dn, attributes } or { ok: false, reason: loginRequired | passwordRequired | notFound | ambiguous | invalidCredentials, error }: branch on ok, then call session.authenticate with the id you keep. A directory that cannot be reached or a refused service account is a Flow error. Groups: read them with ldap.search ((member={dn}) or (uniqueMember={dn})), or from the memberOf attribute of Active Directory.",
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
    "serviceDn": {
      "label": "Service account",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Account used to find the entry of the user (DN, user@domain or DOMAIN\\user). Read it from config.",
    },
    "servicePassword": {
      "label": "Service password",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Password of the service account. Read it from config (a .secret symbol), never write it in the Flow.",
    },
    "base": {
      "label": "Base",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "DN under which the users are searched, for example ou=users,dc=example,dc=org.",
    },
    "login": {
      "label": "Login",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Login typed by the user, matched against the login attribute.",
    },
    "password": {
      "label": "Password",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Password typed by the user. Empty is refused (unauthenticated bind).",
    },
    "loginAttribute": {
      "label": "Login attribute",
      "kind": "template",
      "type": "string",
      "default": "uid",
      "description": "Attribute holding the login: uid, mail, sAMAccountName or userPrincipalName for Active Directory.",
    },
    "attributes": {
      "label": "Attributes",
      "kind": "value",
      "type": "array",
      "description": "Names of the attributes of the user to return (array or comma separated). Empty returns every attribute.",
    },
    "filter": {
      "label": "Filter",
      "category": "Expert",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Filter finding the user instead of (loginAttribute={login}), with the {login} placeholder, for example (&(objectClass=person)(|(uid={login})(mail={login}))).",
    },
    "scope": {
      "label": "Scope",
      "category": "Expert",
      "kind": "literal",
      "type": "string",
      "enum": [
        "sub",
        "one",
      ],
      "default": "sub",
      "description": "sub searches the whole subtree of the base, one its direct children only.",
    },
    "anonymous": {
      "label": "Anonymous search",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Finds the entry of the user without credentials when the directory allows it; the service account is then not needed.",
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
        "dn": {
          "type": "string",
        },
        "attributes": {
          "type": "object",
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
				return ctx.lib("ldap").authenticate({
					url: text(ctx, props.url),
					serviceDn: text(ctx, props.serviceDn),
					servicePassword: text(ctx, props.servicePassword),
					anonymous: value(ctx, props.anonymous) === true,
					base: text(ctx, props.base),
					login: text(ctx, props.login),
					password: text(ctx, props.password),
					loginAttribute: text(ctx, props.loginAttribute),
					filter: text(ctx, props.filter),
					scope: props.scope,
					attributes: value(ctx, props.attributes),
					referral: props.referral,
					connectTimeoutMs: value(ctx, props.connectTimeoutMs),
					readTimeoutMs: value(ctx, props.readTimeoutMs),
					canContinue: function () { return ctx.canContinue(); }
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
