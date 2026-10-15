const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:account-search-outline",
  "tags": [
    "ldap",
    "directory",
    "active directory",
    "search",
    "groups",
  ],
  "summary": [
    "LDAP search {{filter}} under {{base}}",
    "LDAP search under {{base}}",
  ],
  "description": "Reads the entries of an LDAP or Active Directory directory matching a filter under a base, with a service account (bind DN and password read from config) or anonymously. Put the values coming from users in the filter through {name} placeholders and the Values map: they are escaped (RFC 4515), so a login cannot change the filter. Returns { entries: [{ dn, attributes: { name: [values] } }], count, incomplete }; incomplete is true when the size limit stopped the read, when referrals were skipped or when the execution was cancelled. Binary attributes (objectGUID, objectSid) are base64. A directory that cannot be reached, a refused service account or a missing base are Flow errors.",
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
    "bindDn": {
      "label": "Bind DN",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Service account used to read the directory (DN, user@domain or DOMAIN\\user). Read it from config.",
    },
    "password": {
      "label": "Password",
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
      "description": "DN under which the entries are searched, for example ou=users,dc=example,dc=org.",
    },
    "filter": {
      "label": "Filter",
      "kind": "template",
      "type": "string",
      "default": "(objectClass=*)",
      "description": "LDAP filter (RFC 4515). A {name} placeholder takes the escaped value of the same name in Values, for example (&(objectClass=person)(uid={login})).",
    },
    "values": {
      "label": "Values",
      "kind": "value",
      "type": "object",
      "description": "Values of the {name} placeholders of the filter, escaped before insertion, for example { login: input.user }.",
    },
    "scope": {
      "label": "Scope",
      "kind": "literal",
      "type": "string",
      "enum": [
        "sub",
        "one",
        "base",
      ],
      "default": "sub",
      "description": "sub reads the whole subtree of the base, one its direct children only, base the entry of the base itself.",
    },
    "attributes": {
      "label": "Attributes",
      "kind": "value",
      "type": "array",
      "description": "Names of the attributes to return (array or comma separated). Empty returns every attribute of the entries.",
    },
    "sizeLimit": {
      "label": "Size limit",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 1000,
      "description": "Maximum number of entries; 0 means the limit of the directory only.",
    },
    "pageSize": {
      "label": "Page size",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 0,
      "description": "Reads the entries page by page (simple paged results, RFC 2696) for large directories whose server limit is lower than the expected count; 0 reads in one answer.",
    },
    "anonymous": {
      "label": "Anonymous",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": false,
      "description": "Reads without credentials when the directory allows it; the bind DN and password are then not needed.",
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
      "description": "What to do with the referrals of the directory; ignored referrals mark the result incomplete.",
    },
    "timeLimitMs": {
      "label": "Time limit (ms)",
      "category": "Expert",
      "kind": "value",
      "type": "integer",
      "default": 0,
      "description": "Time limit of the search on the directory side; 0 means none.",
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
    "binaryAttributes": {
      "label": "Binary attributes",
      "category": "Expert",
      "kind": "value",
      "type": "array",
      "description": "Attributes returned as base64 besides objectGUID, objectSid and the usual binary ones (certificates, photos).",
    },
  },
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "entries": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "dn": {
                "type": "string",
              },
              "attributes": {
                "type": "object",
              },
            },
          },
        },
        "count": {
          "type": "integer",
        },
        "incomplete": {
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

	function value(ctx, raw) {
		return raw === undefined || raw === null || raw === "" ? undefined : ctx.input({ value: raw });
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			try {
				return ctx.lib("ldap").search({
					url: text(ctx, props.url),
					bindDn: text(ctx, props.bindDn),
					password: text(ctx, props.password),
					anonymous: value(ctx, props.anonymous) === true,
					base: text(ctx, props.base),
					filter: text(ctx, props.filter),
					values: value(ctx, props.values),
					scope: props.scope,
					attributes: value(ctx, props.attributes),
					sizeLimit: value(ctx, props.sizeLimit),
					pageSize: value(ctx, props.pageSize),
					timeLimitMs: value(ctx, props.timeLimitMs),
					referral: props.referral,
					connectTimeoutMs: value(ctx, props.connectTimeoutMs),
					readTimeoutMs: value(ctx, props.readTimeoutMs),
					binaryAttributes: value(ctx, props.binaryAttributes),
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
