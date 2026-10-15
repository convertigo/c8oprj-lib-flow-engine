/*
 * LDAP primitives of the ldap.bind, ldap.search and ldap.authenticate blocks, on JNDI
 * (javax.naming.ldap), the LDAP client of the JDK: no third-party library and none of the
 * engine legacy (TWSLDAP, LDAPAuthenticationStep).
 *
 * Rules that hold for every operation:
 * - a bind always carries a password: a DN with an empty password is an unauthenticated bind
 *   (RFC 4513 §5.1.2) that many directories accept without proving anything, so it is refused
 *   here, before anything is sent; only { anonymous: true } binds without credentials;
 * - a value placed in a filter through a {name} placeholder is escaped (RFC 4515), so a
 *   login never changes the shape of the filter;
 * - referrals are ignored unless asked to be followed;
 * - connection and read timeouts always apply (10 s / 30 s by default);
 * - ldaps:// uses the trust store of the JVM, with host name verification;
 * - a refused credential check is a result ({ ok: false, reason }); a failed connection or an
 *   invalid configuration is an error ({ ldap: true, code, status }) the blocks turn into a
 *   Flow error.
 *
 * The Java dependent parts are isolated in javaPlatform().
 */
(function () {
	var DEFAULT_CONNECT_TIMEOUT_MS = 10000;
	var DEFAULT_READ_TIMEOUT_MS = 30000;
	var DEFAULT_SIZE_LIMIT = 1000;
	var DEFAULT_BINARY_ATTRIBUTES = ["objectGUID", "objectSid", "msExchMailboxGuid"];
	var SCOPES = { base: 0, object: 0, one: 1, onelevel: 1, sub: 2, subtree: 2 };
	var REFERRALS = { ignore: true, follow: true, "throw": true };

	function LdapError(code, message, status, details) {
		this.ldap = true;
		this.code = code;
		this.message = message;
		this.status = status;
		this.details = details;
	}

	function fail(code, message, status, details) {
		throw new LdapError(code, message, status, details);
	}

	function text(value) {
		return value === undefined || value === null ? "" : String(value);
	}

	function isBlank(value) {
		return text(value).trim() === "";
	}

	function number(value, fallback) {
		if (value === undefined || value === null || value === "") {
			return fallback;
		}
		var parsed = Number(value);
		return isNaN(parsed) ? fallback : parsed;
	}

	function list(value) {
		if (value === undefined || value === null || value === "") {
			return [];
		}
		if (Array.isArray(value)) {
			return value.map(text).filter(function (item) { return item.trim() !== ""; });
		}
		return text(value).split(/[,\s]+/).filter(function (item) { return item !== ""; });
	}

	// RFC 4515: a value placed in a search filter
	function escapeFilter(value) {
		return text(value).replace(/[\\*()\u0000]/g, function (c) {
			return "\\" + ("0" + c.charCodeAt(0).toString(16)).slice(-2);
		});
	}

	// RFC 4514: a value placed in a distinguished name
	function escapeDn(value) {
		var escaped = text(value)
			.replace(/[\\,+"<>;=]/g, function (c) { return "\\" + c; })
			.replace(/\u0000/g, "\\00");
		if (escaped.charAt(0) === " " || escaped.charAt(0) === "#") {
			escaped = "\\" + escaped;
		}
		if (escaped.length > 1 && escaped.charAt(escaped.length - 1) === " " && escaped.charAt(escaped.length - 2) !== "\\") {
			escaped = escaped.substring(0, escaped.length - 1) + "\\ ";
		}
		return escaped;
	}

	// {name} placeholders of a filter replaced by the escaped values (single braces: the Flow
	// {{ expression }} templates are rendered before, unescaped); a placeholder without a value
	// is an error, never an empty assertion
	function fillFilter(filter, values) {
		var missing = [];
		var filled = text(filter).replace(/\{\s*([A-Za-z0-9_.-]+)\s*\}/g, function (all, name) {
			var value = values && Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
			if (value === undefined || value === null) {
				missing.push(name);
				return "";
			}
			return escapeFilter(value);
		});
		if (missing.length) {
			fail("LDAP_FILTER_VALUE_MISSING", "No value for the filter placeholder " + missing.join(", "), 400);
		}
		return filled;
	}

	// ldap://host[:port] or ldaps://host[:port], several separated by commas or spaces (failover)
	function parseUrl(url) {
		var raw = text(url).trim();
		var match = /^(ldaps?):\/\/([^\/\s]+)(\/.*)?$/i.exec(raw);
		if (!match) {
			fail("LDAP_URL_INVALID", "An LDAP URL is ldap://host[:port] or ldaps://host[:port]: " + raw, 500);
		}
		var scheme = match[1].toLowerCase();
		var host, port;
		var ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(match[2]);
		var plain = /^([^:\[\]]+)(?::(\d+))?$/.exec(match[2]);
		if (ipv6) {
			host = "[" + ipv6[1] + "]";
			port = ipv6[2];
		} else if (plain) {
			host = plain[1];
			port = plain[2];
		} else {
			fail("LDAP_URL_INVALID", "An LDAP URL is ldap://host[:port] or ldaps://host[:port]: " + raw, 500);
		}
		port = port ? parseInt(port, 10) : (scheme === "ldaps" ? 636 : 389);
		return { scheme: scheme, host: host, port: port, url: scheme + "://" + host + ":" + port };
	}

	function providerUrl(urls) {
		var parsed = list(urls).map(parseUrl);
		if (!parsed.length) {
			fail("LDAP_URL_REQUIRED", "The LDAP URL is required (ldap://host:389 or ldaps://host:636)", 500);
		}
		return {
			url: parsed.map(function (item) { return item.url; }).join(" "),
			secure: parsed.every(function (item) { return item.scheme === "ldaps"; })
		};
	}

	function connection(options) {
		var provider = providerUrl(options.url);
		var referral = text(options.referral || "ignore").toLowerCase();
		if (!REFERRALS[referral]) {
			fail("LDAP_REFERRAL_INVALID", "referral is ignore, follow or throw: " + referral, 500);
		}
		return {
			providerUrl: provider.url,
			secure: provider.secure,
			referral: referral,
			connectTimeoutMs: Math.max(1, number(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS)),
			readTimeoutMs: Math.max(1, number(options.readTimeoutMs, DEFAULT_READ_TIMEOUT_MS)),
			binaryAttributes: DEFAULT_BINARY_ATTRIBUTES.concat(list(options.binaryAttributes))
		};
	}

	// the credentials of a bind: { principal, password } or { anonymous: true }, never a
	// principal without a password
	function credentials(options, principalKey, passwordKey, required) {
		var principal = text(options[principalKey]).trim();
		var password = text(options[passwordKey]);
		if (principal === "") {
			if (options.anonymous === true) {
				return { anonymous: true };
			}
			if (required) {
				fail("LDAP_CREDENTIALS_REQUIRED", "Set " + principalKey + " and " + passwordKey + " (read from config), or anonymous: true", 500);
			}
			return null;
		}
		if (password === "") {
			fail("LDAP_PASSWORD_REQUIRED", "The password of " + principal + " is empty: a bind without password proves nothing (unauthenticated bind), set " + passwordKey, 500);
		}
		return { principal: principal, password: password };
	}

	var localPlatform = null;

	function javaPlatform() {
		var Context = Packages.javax.naming.Context;
		var InitialLdapContext = Packages.javax.naming.ldap.InitialLdapContext;
		var Control = Packages.javax.naming.ldap.Control;
		var PagedResultsControl = Packages.javax.naming.ldap.PagedResultsControl;
		var PagedResultsResponseControl = Packages.javax.naming.ldap.PagedResultsResponseControl;
		var SearchControls = Packages.javax.naming.directory.SearchControls;
		var Base64 = Packages.java.util.Base64;
		var Hashtable = Packages.java.util.Hashtable;
		var ReflectArray = Packages.java.lang.reflect.Array;

		function javaArray(type, values) {
			var array = ReflectArray.newInstance(type, values.length);
			for (var i = 0; i < values.length; i++) {
				array[i] = values[i];
			}
			return array;
		}

		function environment(conn, auth) {
			var env = new Hashtable();
			env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory");
			env.put(Context.PROVIDER_URL, conn.providerUrl);
			env.put(Context.REFERRAL, conn.referral);
			env.put("java.naming.ldap.version", "3");
			env.put("java.naming.ldap.attributes.binary", conn.binaryAttributes.join(" "));
			env.put("com.sun.jndi.ldap.connect.timeout", String(conn.connectTimeoutMs));
			env.put("com.sun.jndi.ldap.read.timeout", String(conn.readTimeoutMs));
			env.put("com.sun.jndi.ldap.connect.pool", "false");
			if (conn.secure) {
				env.put(Context.SECURITY_PROTOCOL, "ssl");
			}
			if (auth.anonymous) {
				env.put(Context.SECURITY_AUTHENTICATION, "none");
			} else {
				env.put(Context.SECURITY_AUTHENTICATION, "simple");
				env.put(Context.SECURITY_PRINCIPAL, auth.principal);
				env.put(Context.SECURITY_CREDENTIALS, auth.password);
			}
			return env;
		}

		function throwable(e) {
			if (e && e.javaException) {
				return e.javaException;
			}
			return e instanceof java.lang.Throwable ? e : null;
		}

		// what a Java exception means: refused credentials, a connection problem or another failure
		function classify(e) {
			var t = throwable(e);
			if (t === null) {
				throw e;
			}
			var root = t;
			while (root.getCause() != null && root.getCause() !== root) {
				root = root.getCause();
			}
			var kind = "error";
			if (t instanceof Packages.javax.naming.AuthenticationException) {
				kind = "refused";
			} else if (t instanceof Packages.javax.naming.CommunicationException
				|| t instanceof Packages.javax.naming.ServiceUnavailableException
				|| root instanceof java.io.IOException) {
				kind = "connection";
			} else if (t instanceof Packages.javax.naming.NameNotFoundException) {
				kind = "notFound";
			}
			var message = t instanceof Packages.javax.naming.NamingException && t.getExplanation() != null
				? String(t.getExplanation()) : String(t.getMessage() == null ? t : t.getMessage());
			return {
				kind: kind,
				message: message,
				details: String(root.getClass().getName()) + (root.getMessage() == null ? "" : ": " + String(root.getMessage()))
			};
		}

		function open(conn, auth) {
			return new InitialLdapContext(environment(conn, auth), null);
		}

		function close(context) {
			try {
				if (context != null) {
					context.close();
				}
			} catch (e) {
			}
		}

		function isByteArray(value) {
			try {
				var type = value.getClass();
				return type.isArray() && type.getComponentType() == java.lang.Byte.TYPE;
			} catch (e) {
				return false;
			}
		}

		function attributeValue(value) {
			if (value == null) {
				return null;
			}
			if (isByteArray(value)) {
				return String(Base64.getEncoder().encodeToString(value));
			}
			return String(value);
		}

		function entryOf(result) {
			var entry = { dn: String(result.getNameInNamespace()), attributes: {} };
			var attributes = result.getAttributes();
			var ids = attributes.getIDs();
			while (ids.hasMore()) {
				var id = String(ids.next());
				var values = [];
				var all = attributes.get(id).getAll();
				while (all.hasMore()) {
					values.push(attributeValue(all.next()));
				}
				entry.attributes[id] = values;
			}
			return entry;
		}

		function pagingCookie(context) {
			var controls = context.getResponseControls();
			if (controls == null) {
				return null;
			}
			for (var i = 0; i < controls.length; i++) {
				if (controls[i] instanceof PagedResultsResponseControl) {
					var cookie = controls[i].getCookie();
					return cookie != null && cookie.length > 0 ? cookie : null;
				}
			}
			return null;
		}

		// every entry of a search, page after page when a page size is set; incomplete when the
		// size limit stops it, when referrals are skipped or when the execution is cancelled
		function search(context, request) {
			var controls = new SearchControls();
			controls.setSearchScope(request.scope);
			controls.setCountLimit(request.sizeLimit);
			controls.setTimeLimit(request.timeLimitMs);
			controls.setReturningObjFlag(false);
			controls.setReturningAttributes(request.attributes === null ? null : javaArray(java.lang.String, request.attributes));
			var entries = [];
			var incomplete = false;
			var cookie = null;
			do {
				if (request.pageSize > 0) {
					context.setRequestControls(javaArray(Control, [new PagedResultsControl(request.pageSize, cookie, Control.CRITICAL)]));
				}
				var results = context.search(request.base, request.filter, controls);
				try {
					while (results.hasMore()) {
						entries.push(entryOf(results.next()));
						if (request.sizeLimit > 0 && entries.length >= request.sizeLimit) {
							incomplete = incomplete || results.hasMore();
							break;
						}
						if (request.canContinue && !request.canContinue()) {
							incomplete = true;
							break;
						}
					}
				} catch (e) {
					var t = throwable(e);
					if (t !== null && (t instanceof Packages.javax.naming.SizeLimitExceededException
						|| t instanceof Packages.javax.naming.PartialResultException)) {
						incomplete = true;
					} else {
						throw e;
					}
				} finally {
					try {
						results.close();
					} catch (e) {
					}
				}
				cookie = request.pageSize > 0 && !incomplete ? pagingCookie(context) : null;
			} while (cookie !== null);
			if (request.pageSize > 0) {
				context.setRequestControls(null);
			}
			return { entries: entries, incomplete: incomplete };
		}

		return { open: open, close: close, search: search, classify: classify };
	}

	function platform() {
		if (localPlatform === null) {
			localPlatform = javaPlatform();
		}
		return localPlatform;
	}

	// turns a Java failure into a result (refused credentials) or an error
	function failure(e, refusedReason) {
		var classified = platform().classify(e);
		if (classified.kind === "refused" && refusedReason) {
			return { ok: false, reason: refusedReason, error: classified.message };
		}
		if (classified.kind === "connection") {
			fail("LDAP_CONNECTION_FAILED", "Cannot reach the LDAP directory: " + classified.message, 502, classified.details);
		}
		if (classified.kind === "refused") {
			fail("LDAP_BIND_REFUSED", "The directory refused the bind: " + classified.message, 500, classified.details);
		}
		fail("LDAP_ERROR", "LDAP error: " + classified.message, 502, classified.details);
	}

	function withContext(conn, auth, refusedReason, body) {
		var context = null;
		try {
			context = platform().open(conn, auth);
		} catch (e) {
			return failure(e, refusedReason);
		}
		try {
			return body(context);
		} catch (e) {
			return failure(e, null);
		} finally {
			platform().close(context);
		}
	}

	function searchRequest(options, defaults) {
		var scope = text(options.scope || defaults.scope || "sub").toLowerCase();
		if (!Object.prototype.hasOwnProperty.call(SCOPES, scope)) {
			fail("LDAP_SCOPE_INVALID", "scope is base, one or sub: " + scope, 400);
		}
		var attributes = list(options.attributes);
		return {
			base: text(options.base).trim(),
			filter: fillFilter(isBlank(options.filter) ? defaults.filter : options.filter, options.values || defaults.values),
			scope: SCOPES[scope],
			attributes: attributes.length ? attributes : null,
			sizeLimit: Math.max(0, number(options.sizeLimit, defaults.sizeLimit === undefined ? DEFAULT_SIZE_LIMIT : defaults.sizeLimit)),
			pageSize: Math.max(0, number(options.pageSize, 0)),
			timeLimitMs: Math.max(0, number(options.timeLimitMs, 0)),
			canContinue: options.canContinue
		};
	}

	var api = {};

	api.escapeFilter = escapeFilter;
	api.escapeDn = escapeDn;
	api.fillFilter = fillFilter;
	api.parseUrl = parseUrl;

	// checks a principal (DN, user@domain or DOMAIN\user) and its password
	api.bind = function (options) {
		var conn = connection(options);
		var principal = text(options.principal).trim();
		if (options.anonymous !== true) {
			if (principal === "") {
				return { ok: false, reason: "principalRequired", error: "The principal is empty" };
			}
			if (text(options.password) === "") {
				return { ok: false, reason: "passwordRequired", error: "The password is empty: an unauthenticated bind proves nothing" };
			}
		}
		var auth = options.anonymous === true ? { anonymous: true } : { principal: principal, password: text(options.password) };
		return withContext(conn, auth, "invalidCredentials", function () {
			return { ok: true, principal: auth.anonymous ? "" : auth.principal };
		});
	};

	// the entries matching a filter under a base, read with a service account or anonymously
	api.search = function (options) {
		var conn = connection(options);
		var auth = credentials(options, "bindDn", "password", true);
		var request = searchRequest(options, { filter: "(objectClass=*)" });
		if (request.base === "") {
			fail("LDAP_BASE_REQUIRED", "The search base is required, for example ou=users,dc=example,dc=org", 500);
		}
		return withContext(conn, auth, null, function (context) {
			var found = platform().search(context, request);
			return { entries: found.entries, count: found.entries.length, incomplete: found.incomplete };
		});
	};

	// search and bind: the entry of the login is found with the service account (or
	// anonymously), then its DN is bound with the password of the user
	api.authenticate = function (options) {
		var conn = connection(options);
		var login = text(options.login).trim();
		var password = text(options.password);
		if (login === "") {
			return { ok: false, reason: "loginRequired", error: "The login is empty" };
		}
		if (password === "") {
			return { ok: false, reason: "passwordRequired", error: "The password is empty: an unauthenticated bind proves nothing" };
		}
		var service = credentials(options, "serviceDn", "servicePassword", true);
		var loginAttribute = text(options.loginAttribute).trim() || "uid";
		if (!/^[A-Za-z][A-Za-z0-9-]*(;[A-Za-z0-9-]+)*$/.test(loginAttribute)) {
			fail("LDAP_ATTRIBUTE_INVALID", "loginAttribute is an attribute name: " + loginAttribute, 500);
		}
		var request = searchRequest({
			base: options.base,
			filter: isBlank(options.filter) ? "(" + loginAttribute + "={login})" : options.filter,
			values: { login: login },
			scope: options.scope,
			attributes: options.attributes,
			sizeLimit: 2,
			timeLimitMs: options.timeLimitMs,
			canContinue: options.canContinue
		}, {});
		if (request.base === "") {
			fail("LDAP_BASE_REQUIRED", "The search base is required, for example ou=users,dc=example,dc=org", 500);
		}
		var found = withContext(conn, service, null, function (context) {
			return platform().search(context, request);
		});
		if (found.ok === false) {
			return found;
		}
		if (found.entries.length === 0) {
			return { ok: false, reason: "notFound", error: "No entry of " + loginAttribute + " " + login + " under " + request.base };
		}
		if (found.entries.length > 1) {
			return { ok: false, reason: "ambiguous", error: "Several entries match " + login + " under " + request.base };
		}
		var entry = found.entries[0];
		return withContext(conn, { principal: entry.dn, password: password }, "invalidCredentials", function () {
			return { ok: true, dn: entry.dn, attributes: entry.attributes };
		});
	};

	return api;
}())
