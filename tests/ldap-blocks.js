// ldap.bind, ldap.search, ldap.authenticate and ldap.escape against a minimal LDAPv3 directory
// served by this test (127.0.0.1): simple bind, search with filters, unbind. Proves the
// credential rules (no unauthenticated bind, escaped logins), the search contract and the
// errors of an unreachable or misconfigured directory.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-ldap-test").getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

// ---- the directory ------------------------------------------------------------------------
var USERS = "ou=users,dc=example,dc=org";
var ADA = "cn=Ada Lovelace," + USERS;
var ALAN = "cn=Alan Turing," + USERS;
var GRACE = "cn=Grace Hopper," + USERS;
var SERVICE = "cn=service,dc=example,dc=org";
var entries = [
	{ dn: "dc=example,dc=org", attributes: { objectClass: ["dcObject", "organization"], dc: ["example"], o: ["Example"] } },
	{ dn: USERS, attributes: { objectClass: ["organizationalUnit"], ou: ["users"] } },
	{ dn: ADA, attributes: { objectClass: ["inetOrgPerson"], cn: ["Ada Lovelace"], sn: ["Lovelace"], uid: ["ada"], mail: ["ada@example.org"] } },
	{ dn: ALAN, attributes: { objectClass: ["inetOrgPerson"], cn: ["Alan Turing"], sn: ["Turing"], uid: ["alan"], mail: ["alan@example.org", "shared@example.org"] } },
	{ dn: GRACE, attributes: { objectClass: ["inetOrgPerson"], cn: ["Grace Hopper"], sn: ["Hopper"], uid: ["grace"], mail: ["shared@example.org"] } },
	{ dn: "ou=groups,dc=example,dc=org", attributes: { objectClass: ["organizationalUnit"], ou: ["groups"] } },
	{ dn: "cn=admins,ou=groups,dc=example,dc=org", attributes: { objectClass: ["groupOfUniqueNames"], cn: ["admins"], uniqueMember: [ADA] } },
	{ dn: "cn=staff,ou=groups,dc=example,dc=org", attributes: { objectClass: ["groupOfUniqueNames"], cn: ["staff"], uniqueMember: [ADA, ALAN] } },
	{ dn: SERVICE, attributes: { objectClass: ["applicationProcess"], cn: ["service"] } }
];
var passwords = {};
passwords[normalizeDn(SERVICE)] = "service-secret";
passwords[normalizeDn(ADA)] = "ada-pass";
passwords[normalizeDn(ALAN)] = "alan-pass";
passwords[normalizeDn(GRACE)] = "grace-pass";
var binds = [];
var directory = { acceptUnauthenticatedBind: false };

function normalizeDn(dn) {
	return String(dn).toLowerCase().replace(/\s*,\s*/g, ",").replace(/\s*=\s*/g, "=").trim();
}

// ---- BER ------------------------------------------------------------------------------------
function unsigned(b) {
	return b < 0 ? b + 256 : b;
}

function decode(bytes, start, end) {
	var items = [];
	var pos = start;
	while (pos < end) {
		var tag = unsigned(bytes[pos++]);
		var length = unsigned(bytes[pos++]);
		if (length & 0x80) {
			var count = length & 0x7f;
			length = 0;
			for (var i = 0; i < count; i++) {
				length = (length << 8) | unsigned(bytes[pos++]);
			}
		}
		var item = { tag: tag, value: [] };
		if (tag & 0x20) {
			item.children = decode(bytes, pos, pos + length);
		} else {
			for (var j = 0; j < length; j++) {
				item.value.push(unsigned(bytes[pos + j]));
			}
		}
		items.push(item);
		pos += length;
	}
	return items;
}

function toJavaBytes(values) {
	var array = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, values.length);
	for (var i = 0; i < values.length; i++) {
		array[i] = values[i] > 127 ? values[i] - 256 : values[i];
	}
	return array;
}

function stringOf(item) {
	return String(new java.lang.String(toJavaBytes(item.value), "UTF-8"));
}

function intOf(item) {
	var value = 0;
	for (var i = 0; i < item.value.length; i++) {
		value = (value << 8) | item.value[i];
	}
	return value;
}

function encodeLength(length) {
	if (length < 128) {
		return [length];
	}
	var bytes = [];
	while (length > 0) {
		bytes.unshift(length & 0xff);
		length = Math.floor(length / 256);
	}
	return [0x80 | bytes.length].concat(bytes);
}

function tlv(tag, content) {
	return [tag].concat(encodeLength(content.length), content);
}

function octets(text) {
	var bytes = new java.lang.String(String(text)).getBytes("UTF-8");
	var out = [];
	for (var i = 0; i < bytes.length; i++) {
		out.push(unsigned(bytes[i]));
	}
	return tlv(0x04, out);
}

function integer(value) {
	var bytes = [];
	do {
		bytes.unshift(value & 0xff);
		value = Math.floor(value / 256);
	} while (value > 0);
	if (bytes[0] & 0x80) {
		bytes.unshift(0);
	}
	return tlv(0x02, bytes);
}

function enumerated(value) {
	return tlv(0x0a, [value]);
}

function sequence(tag, parts) {
	return tlv(tag, [].concat.apply([], parts));
}

function ldapResult(tag, code, message) {
	return sequence(tag, [enumerated(code), octets(""), octets(message || "")]);
}

function write(output, messageId, op) {
	output.write(toJavaBytes(sequence(0x30, [integer(messageId), op])));
	output.flush();
}

// ---- search -------------------------------------------------------------------------------
function values(entry, name) {
	var lower = String(name).toLowerCase();
	for (var key in entry.attributes) {
		if (key.toLowerCase() === lower) {
			return entry.attributes[key];
		}
	}
	return [];
}

function regexEscape(text) {
	return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matches(filter, entry) {
	var tag = filter.tag;
	if (tag === 0xa0) {
		return filter.children.every(function (child) { return matches(child, entry); });
	}
	if (tag === 0xa1) {
		return filter.children.some(function (child) { return matches(child, entry); });
	}
	if (tag === 0xa2) {
		return !matches(filter.children[0], entry);
	}
	if (tag === 0x87) {
		return values(entry, stringOf(filter)).length > 0;
	}
	if (tag === 0xa3) {
		var expected = stringOf(filter.children[1]).toLowerCase();
		return values(entry, stringOf(filter.children[0])).some(function (value) { return String(value).toLowerCase() === expected; });
	}
	if (tag === 0xa4) {
		var pattern = "^";
		var parts = filter.children[1].children;
		for (var i = 0; i < parts.length; i++) {
			var piece = regexEscape(stringOf(parts[i]));
			pattern += parts[i].tag === 0x80 ? piece : ".*" + piece;
		}
		pattern += parts.length && parts[parts.length - 1].tag === 0x82 ? "$" : ".*$";
		var regex = new RegExp(pattern, "i");
		return values(entry, stringOf(filter.children[0])).some(function (value) { return regex.test(String(value)); });
	}
	return false;
}

function inScope(entry, base, scope) {
	var dn = normalizeDn(entry.dn);
	if (scope === 0) {
		return dn === base;
	}
	if (scope === 1) {
		return dn !== base && dn.substring(dn.indexOf(",") + 1) === base;
	}
	return dn === base || dn.length > base.length && dn.substring(dn.length - base.length - 1) === "," + base;
}

function searchEntry(entry, wanted) {
	var attributes = [];
	for (var key in entry.attributes) {
		var selected = wanted.length === 0 || wanted.indexOf("*") >= 0 || wanted.indexOf(key.toLowerCase()) >= 0;
		if (selected) {
			attributes.push(sequence(0x30, [octets(key), sequence(0x31, entry.attributes[key].map(octets))]));
		}
	}
	return sequence(0x64, [octets(entry.dn), sequence(0x30, attributes)]);
}

function handleSearch(messageId, request, output) {
	var base = normalizeDn(stringOf(request.children[0]));
	var scope = intOf(request.children[1]);
	var sizeLimit = intOf(request.children[3]);
	var filter = request.children[6];
	var wanted = request.children[7].children.map(function (item) { return stringOf(item).toLowerCase(); });
	var sent = 0;
	var limited = false;
	for (var i = 0; i < entries.length; i++) {
		if (inScope(entries[i], base, scope) && matches(filter, entries[i])) {
			if (sizeLimit > 0 && sent >= sizeLimit) {
				limited = true;
				break;
			}
			write(output, messageId, searchEntry(entries[i], wanted));
			sent++;
		}
	}
	write(output, messageId, ldapResult(0x65, limited ? 4 : 0, limited ? "size limit exceeded" : ""));
}

function handleBind(messageId, request, output) {
	var name = stringOf(request.children[1]);
	var password = request.children[2].tag === 0x80 ? stringOf(request.children[2]) : null;
	binds.push({ dn: name, password: password });
	var code = 49;
	if (name === "" && password === "") {
		code = 0;
	} else if (password === "") {
		code = directory.acceptUnauthenticatedBind ? 0 : 53;
	} else if (passwords[normalizeDn(name)] === password) {
		code = 0;
	}
	write(output, messageId, ldapResult(0x61, code, code === 53 ? "unauthenticated bind (DN with no password) disallowed" : code === 49 ? "invalid credentials" : ""));
}

function serve(socket) {
	var input = new java.io.DataInputStream(new java.io.BufferedInputStream(socket.getInputStream()));
	var output = new java.io.BufferedOutputStream(socket.getOutputStream());
	try {
		while (true) {
			var tag = input.read();
			if (tag < 0) {
				break;
			}
			var length = input.read();
			if (length & 0x80) {
				var count = length & 0x7f;
				length = 0;
				for (var i = 0; i < count; i++) {
					length = (length << 8) | input.read();
				}
			}
			var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, length);
			input.readFully(bytes);
			var message = decode(bytes, 0, length);
			var messageId = intOf(message[0]);
			var op = message[1];
			if (op.tag === 0x60) {
				handleBind(messageId, op, output);
			} else if (op.tag === 0x63) {
				handleSearch(messageId, op, output);
			} else if (op.tag === 0x42) {
				break;
			} else if (op.tag !== 0x50) {
				write(output, messageId, ldapResult(0x78, 2, "unsupported operation"));
			}
		}
	} catch (e) {
	} finally {
		try {
			socket.close();
		} catch (e) {
		}
	}
}

var listener = new java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
var directoryUrl = "ldap://127.0.0.1:" + listener.getLocalPort();
function spawn(socket) {
	var worker = new java.lang.Thread(function () { serve(socket); });
	worker.setDaemon(true);
	worker.start();
}
var acceptor = new java.lang.Thread(function () {
	while (true) {
		try {
			spawn(listener.accept());
		} catch (e) {
			break;
		}
	}
});
acceptor.setDaemon(true);
acceptor.start();

// a port nothing listens on
var closed = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
var closedUrl = "ldap://127.0.0.1:" + closed.getLocalPort();
closed.close();

// ---- the tests ------------------------------------------------------------------------------
function run(nodes, input) {
	return JSON.parse(engine.run(JSON.stringify({ definition: { version: 1, nodes: nodes }, input: input || {}, includeTrace: false })));
}

function one(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === true, block + " failed: " + JSON.stringify(out).substring(0, 1500));
	return out.result.it;
}

function error(block, props) {
	var out = run([{ id: "it", block: block, props: props, out: "result.it" }]);
	assertTrue(out.ok === false && out.error, block + " should fail: " + JSON.stringify(out).substring(0, 1500));
	return out.error;
}

try {
	// ldap.bind
	var bound = one("ldap.bind", { url: directoryUrl, principal: SERVICE, password: "service-secret" });
	assertTrue(bound.ok === true && bound.principal === SERVICE, "bind of the service account: " + JSON.stringify(bound));
	var wrong = one("ldap.bind", { url: directoryUrl, principal: SERVICE, password: "nope" });
	assertTrue(wrong.ok === false && wrong.reason === "invalidCredentials" && /invalid credentials/i.test(wrong.error), "wrong password refused: " + JSON.stringify(wrong));
	var anonymous = one("ldap.bind", { url: directoryUrl, anonymous: true });
	assertTrue(anonymous.ok === true && anonymous.principal === "", "anonymous bind: " + JSON.stringify(anonymous));
	var noPrincipal = one("ldap.bind", { url: directoryUrl, password: "x" });
	assertTrue(noPrincipal.ok === false && noPrincipal.reason === "principalRequired", "principal required: " + JSON.stringify(noPrincipal));

	// never an unauthenticated bind, even against a directory that would accept it (Active Directory does)
	directory.acceptUnauthenticatedBind = true;
	var before = binds.length;
	var empty = one("ldap.bind", { url: directoryUrl, principal: ADA, password: "" });
	assertTrue(empty.ok === false && empty.reason === "passwordRequired", "empty password refused: " + JSON.stringify(empty));
	var emptyLogin = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "ada", password: "" });
	assertTrue(emptyLogin.ok === false && emptyLogin.reason === "passwordRequired", "empty password refused by authenticate: " + JSON.stringify(emptyLogin));
	assertTrue(binds.length === before, "nothing was sent to the directory for an empty password: " + JSON.stringify(binds.slice(before)));
	directory.acceptUnauthenticatedBind = false;

	// ldap.search
	var users = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, scope: "one", attributes: ["uid", "mail"] });
	assertTrue(users.count === 3 && users.entries.length === 3 && users.incomplete === false, "three users: " + JSON.stringify(users));
	var ada = users.entries.filter(function (entry) { return entry.dn === ADA; })[0];
	assertTrue(ada && ada.attributes.uid.length === 1 && ada.attributes.uid[0] === "ada" && ada.attributes.mail[0] === "ada@example.org" && ada.attributes.cn === undefined,
		"attributes are arrays, only the requested ones: " + JSON.stringify(ada));
	var all = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: "dc=example,dc=org", filter: "(objectClass=inetOrgPerson)" });
	assertTrue(all.count === 3 && all.entries[0].attributes.objectClass && all.entries[0].attributes.sn, "subtree search returns every attribute: " + JSON.stringify(all).substring(0, 600));
	var baseOnly = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, scope: "base" });
	assertTrue(baseOnly.count === 1 && baseOnly.entries[0].dn === USERS, "scope base: " + JSON.stringify(baseOnly));
	var byLogin = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, filter: "(&(objectClass=inetOrgPerson)(uid={login}))", values: { login: "ada" } });
	assertTrue(byLogin.count === 1 && byLogin.entries[0].dn === ADA, "placeholder value: " + JSON.stringify(byLogin));
	var injected = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, filter: "(uid={login})", values: { login: "*)(uid=*" } });
	assertTrue(injected.count === 0, "a placeholder value cannot change the filter: " + JSON.stringify(injected));
	var present = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, filter: "(uid=*)", attributes: "uid" });
	assertTrue(present.count === 3, "a literal filter keeps its operators: " + JSON.stringify(present));
	var groups = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: "ou=groups,dc=example,dc=org", filter: "(&(objectClass=groupOfUniqueNames)(uniqueMember={dn}))", values: { dn: ADA }, attributes: ["cn"] });
	assertTrue(groups.count === 2 && groups.entries.map(function (entry) { return entry.attributes.cn[0]; }).sort().join(",") === "admins,staff", "groups of a member: " + JSON.stringify(groups));
	var limited = one("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, scope: "one", sizeLimit: 2 });
	assertTrue(limited.count === 2 && limited.incomplete === true, "size limit marks the result incomplete: " + JSON.stringify(limited).substring(0, 300));
	var anonymousSearch = one("ldap.search", { url: directoryUrl, anonymous: true, base: USERS, filter: "(uid=grace)" });
	assertTrue(anonymousSearch.count === 1, "anonymous search: " + JSON.stringify(anonymousSearch));

	var noCredentials = error("ldap.search", { url: directoryUrl, base: USERS });
	assertTrue(noCredentials.code === "LDAP_CREDENTIALS_REQUIRED", "a search needs credentials or anonymous: " + JSON.stringify(noCredentials));
	var noPassword = error("ldap.search", { url: directoryUrl, bindDn: SERVICE, base: USERS });
	assertTrue(noPassword.code === "LDAP_PASSWORD_REQUIRED", "a bind DN without password is a configuration error: " + JSON.stringify(noPassword));
	var noValue = error("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret", base: USERS, filter: "(uid={login})" });
	assertTrue(noValue.code === "LDAP_FILTER_VALUE_MISSING", "a placeholder needs its value: " + JSON.stringify(noValue));
	var noBase = error("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "service-secret" });
	assertTrue(noBase.code === "LDAP_BASE_REQUIRED", "a search needs a base: " + JSON.stringify(noBase));
	var refusedService = error("ldap.search", { url: directoryUrl, bindDn: SERVICE, password: "wrong", base: USERS });
	assertTrue(refusedService.code === "LDAP_BIND_REFUSED", "a refused service account is an error: " + JSON.stringify(refusedService));

	// ldap.authenticate
	before = binds.length;
	var signedIn = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "ada", password: "ada-pass", attributes: ["mail", "cn"] });
	assertTrue(signedIn.ok === true && signedIn.dn === ADA && signedIn.attributes.mail[0] === "ada@example.org" && signedIn.attributes.cn[0] === "Ada Lovelace" && signedIn.attributes.uid === undefined,
		"search and bind: " + JSON.stringify(signedIn));
	var userBind = binds[binds.length - 1];
	assertTrue(userBind.dn === ADA && userBind.password === "ada-pass" && binds[before].dn === SERVICE, "the service account searches, the user DN binds with the typed password: " + JSON.stringify(binds.slice(before)));
	var badPassword = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "ada", password: "nope" });
	assertTrue(badPassword.ok === false && badPassword.reason === "invalidCredentials" && badPassword.dn === undefined, "wrong user password: " + JSON.stringify(badPassword));
	var unknown = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "nobody", password: "x" });
	assertTrue(unknown.ok === false && unknown.reason === "notFound", "unknown login: " + JSON.stringify(unknown));
	var injectedLogin = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "*", password: "x" });
	assertTrue(injectedLogin.ok === false && injectedLogin.reason === "notFound", "a login is a value, not a filter: " + JSON.stringify(injectedLogin));
	var ambiguous = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "shared@example.org", password: "x", loginAttribute: "mail" });
	assertTrue(ambiguous.ok === false && ambiguous.reason === "ambiguous", "two entries share the login: " + JSON.stringify(ambiguous));
	var byMail = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "alan@example.org", password: "alan-pass", loginAttribute: "mail" });
	assertTrue(byMail.ok === true && byMail.dn === ALAN, "login attribute: " + JSON.stringify(byMail));
	var customFilter = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: "dc=example,dc=org", login: "GRACE", password: "grace-pass", filter: "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))" });
	assertTrue(customFilter.ok === true && customFilter.dn === GRACE, "custom filter with the login placeholder: " + JSON.stringify(customFilter));
	var noLogin = one("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: " ", password: "x" });
	assertTrue(noLogin.ok === false && noLogin.reason === "loginRequired", "empty login: " + JSON.stringify(noLogin));
	var anonymousAuth = one("ldap.authenticate", { url: directoryUrl, anonymous: true, base: USERS, login: "ada", password: "ada-pass" });
	assertTrue(anonymousAuth.ok === true && anonymousAuth.dn === ADA, "anonymous search then user bind: " + JSON.stringify(anonymousAuth));
	var badService = error("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "wrong", base: USERS, login: "ada", password: "ada-pass" });
	assertTrue(badService.code === "LDAP_BIND_REFUSED", "a refused service account is an error, not a refused user: " + JSON.stringify(badService));
	var badAttribute = error("ldap.authenticate", { url: directoryUrl, serviceDn: SERVICE, servicePassword: "service-secret", base: USERS, login: "ada", password: "ada-pass", loginAttribute: "uid=*)(" });
	assertTrue(badAttribute.code === "LDAP_ATTRIBUTE_INVALID", "the login attribute is a name: " + JSON.stringify(badAttribute));

	// unreachable or invalid directory
	var unreachable = error("ldap.bind", { url: closedUrl, principal: SERVICE, password: "service-secret", connectTimeoutMs: 2000 });
	assertTrue(unreachable.code === "LDAP_CONNECTION_FAILED" && unreachable.status === 502, "a closed port is a connection error: " + JSON.stringify(unreachable));
	var badUrl = error("ldap.search", { url: "http://127.0.0.1/", bindDn: SERVICE, password: "x", base: USERS });
	assertTrue(badUrl.code === "LDAP_URL_INVALID", "only ldap:// and ldaps:// URLs: " + JSON.stringify(badUrl));
	var noUrl = error("ldap.authenticate", { serviceDn: SERVICE, servicePassword: "x", base: USERS, login: "ada", password: "x" });
	assertTrue(noUrl.code === "LDAP_URL_REQUIRED", "the URL is required: " + JSON.stringify(noUrl));
	var failover = one("ldap.bind", { url: closedUrl + ", " + directoryUrl, principal: SERVICE, password: "service-secret", connectTimeoutMs: 2000 });
	assertTrue(failover.ok === true, "the next URL of the list is tried: " + JSON.stringify(failover));

	// ldap.escape
	assertTrue(one("ldap.escape", { value: "*)(uid=*" }) === "\\2a\\29\\28uid=\\2a", "filter escaping");
	assertTrue(one("ldap.escape", { value: "a\\b\u0000" }) === "a\\5cb\\00", "backslash and NUL");
	assertTrue(one("ldap.escape", { value: "Smith, John <j>" , mode: "dn" }) === "Smith\\, John \\<j\\>", "DN escaping");
	assertTrue(one("ldap.escape", { value: " #lead", mode: "dn" }) === "\\ #lead", "DN leading space");
	assertTrue(one("ldap.escape", { value: "trail ", mode: "dn" }) === "trail\\ ", "DN trailing space");

	// catalog
	var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "ldap", detail: "full" })));
	["ldap.bind", "ldap.search", "ldap.authenticate", "ldap.escape"].forEach(function (id) {
		assertTrue(catalog.blocks.some(function (item) { return item.blockId === id; }), "catalog exposes " + id);
	});
	var searchBlock = catalog.blocks.filter(function (item) { return item.blockId === "ldap.search"; })[0];
	assertTrue(searchBlock.props.values.kind === "value" && searchBlock.props.scope.kind === "literal" && searchBlock.outputs.out.properties.entries.type === "array",
		"ldap.search contract: " + JSON.stringify(searchBlock.props.values));
	var authBlock = catalog.blocks.filter(function (item) { return item.blockId === "ldap.authenticate"; })[0];
	assertTrue(authBlock.outputs.out.properties.ok.type === "boolean" && authBlock.props.password.kind === "template", "ldap.authenticate contract");
	print("ldap blocks: ok (" + binds.length + " binds seen by the directory)");
} finally {
	listener.close();
}
