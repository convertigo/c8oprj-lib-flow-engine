// F-08: the session blocks read and write the session of the request that runs the Flow, never one kept from another
// request. One engine serves the requests of two HTTP sessions in turn, its global context bound for each call as the
// Java bridge does (FlowEngineBridge.invokePrepared): an anonymous session sees nobody after another one signed in,
// through a Flow called by flow.call too, and session.authenticate and session.set write their own session only.
// The CurrentUser of the trial nevertheless answered "Bernard Durand" to a new session, before any sign-in and after a
// logout: the cause is in the Flow, reproduced below. session.authenticatedUser gives null to an anonymous session,
// `local.email == ""` is false for null, toLowerCase() on null gives "", and a query whose filter is
// `(:email = '' OR EMAIL = :email)` then returns every user, Durand first by name. The engine now reports both steps:
// code-check warns on the comparison and on the method call, and the run returns the method called on null as a warning.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-session-identity").toFile().getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	FileUtils.writeStringToFile(file, text, "UTF-8");
}

// The users table of the trial, behind the same filter as its usersWithActiveItems query: an empty email selects all.
write("_flow/blocks/directory/users.block.js", [
	"const _meta = { sourceVersion: 2, runtime: \"rhino\", properties: { email: { kind: \"template\", type: \"string\", default: \"\" } },",
	"  outputs: { out: { type: \"object\", properties: { rows: { type: \"array\", items: { type: \"object\" } } } } } };",
	"(function () {",
	"  var users = [{ nom: \"Root\", prenom: \"Admin\", email: \"admin@example.test\" }, { nom: \"Martin\", prenom: \"Alice\", email: \"alice.martin@example.test\" },",
	"    { nom: \"Durand\", prenom: \"Bernard\", email: \"bernard.durand@example.test\" }, { nom: \"Test\", prenom: \"Claire\", email: \"claire.test@example.test\" }];",
	"  return { run: function (ctx, node) {",
	"    var email = String(ctx.template(ctx.props(node).email || \"\"));",
	"    var rows = users.filter(function (u) { return email === \"\" || u.email === email; }).sort(function (a, b) { return a.nom < b.nom ? -1 : 1; });",
	"    return { rows: rows.slice(0, 1) };",
	"  } };",
	"}())"
].join("\n"));
write("_flow/flows/Who.flow.js", "const _flow = { sourceVersion: 2 }\nfunction Who({ input, config, result }) {\n  result.user = session.authenticatedUser({})\n}\n");

var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));

// A Convertigo context as AbstractContext: the authenticated user is an attribute of its HTTP session.
function httpContext(id) {
	var attributes = new java.util.HashMap();
	return {
		id: id,
		attributes: attributes,
		httpSession: {
			getId: function () { return id; },
			getAttribute: function (key) { return attributes.get(String(key)); },
			setAttribute: function (key, value) { attributes.put(String(key), value); },
			removeAttribute: function (key) { attributes.remove(String(key)); }
		},
		getAuthenticatedUser: function () { return attributes.get("authenticatedUser"); },
		setAuthenticatedUser: function (user) { if (user !== null) attributes.put("authenticatedUser", user); },
		removeAuthenticatedUser: function () { attributes.remove("authenticatedUser"); }
	};
}
var global = this;
function call(convertigoContext, code, input) {
	global.context = convertigoContext;
	try {
		var out = JSON.parse(engine.run(JSON.stringify({ flowSource: code, input: input || {}, includeTrace: false })));
		assert(out.ok === true, "the Flow runs: " + JSON.stringify(out).substring(0, 600));
		return out;
	} finally {
		delete global.context;
	}
}
function flow(name, body, inputs) {
	return "const _flow = { sourceVersion: 2" + (inputs ? ", inputs: " + inputs : "") + " }\nfunction " + name +
		"({ input, config, result }) {\n" + body + "\n}\n";
}
var WHO = flow("Who", "  result.user = session.authenticatedUser({})");
var LOGIN = flow("Login", "  session.authenticate({user: input.user})\n  result.user = session.authenticatedUser({})", "{ user: { type: \"string\" } }");
var LOGOUT = flow("Logout", "  result.user = session.authenticate({user: \"\"})");
var NESTED = flow("Nested", "  local.who = flow.call({flow: \"Who\", input: {}})\n  result.user = local.who.user");
var REMEMBER = flow("Remember", "  session.set({key: \"basket\", value: input.basket})", "{ basket: { type: \"string\" } }");
var RECALL = flow("Recall", "  result.basket = session.get({key: \"basket\", default: \"none\"})");

var alice = httpContext("A"), anonymous = httpContext("B");
assert(call(alice, LOGIN, { user: "alice.martin@example.test" }).result.user === "alice.martin@example.test", "A signs in");
assert(String(alice.attributes.get("authenticatedUser")) === "alice.martin@example.test" && anonymous.attributes.isEmpty(),
	"session.authenticate writes the session of its request only");
assert(call(anonymous, WHO).result.user === null, "another session, anonymous, sees nobody");
assert(call(anonymous, NESTED).result.user === null, "nor through a Flow it calls with flow.call");
assert(call(alice, WHO).result.user === "alice.martin@example.test" && call(alice, NESTED).result.user === "alice.martin@example.test",
	"the signed-in session still sees its user, called Flows too");
call(anonymous, REMEMBER, { basket: "b-42" });
assert(call(alice, RECALL).result.basket === "none" && call(anonymous, RECALL).result.basket === "b-42",
	"session.set and session.get keep to the session of the request");
assert(call(alice, LOGOUT).result.user === null && !alice.attributes.containsKey("authenticatedUser"), "A signs out");
assert(call(alice, WHO).result.user === null && call(anonymous, WHO).result.user === null, "nobody is seen after the logout");

// The CurrentUser of the trial, its sql.query on usersWithActiveItems replaced by directory.users (same filter on email).
function currentUser(condition) {
	return [
		"const _flow = { sourceVersion: 2, outputs: { authenticated: { type: \"boolean\" }, user: { type: \"object\" } } }",
		"function CurrentUser({ input, config, result }) {",
		"  local.email = session.authenticatedUser({})",
		"  if({",
		"    $$id: \"whenAnonymous\",",
		"    condition: " + condition + ",",
		"    $$then: function () {",
		"      result.authenticated = false",
		"    },",
		"    $$else: function () {",
		"      local.rows = directory.users({email: local.email.toLowerCase()})",
		"      result.authenticated = true",
		"      result.user = local.rows.rows[0]",
		"    },",
		"  })",
		"}"
	].join("\n") + "\n";
}
var trial = currentUser("local.email == \"\"");
var fresh = httpContext("C");
var leaked = call(fresh, trial);
assert(leaked.result.authenticated === true && leaked.result.user.prenom === "Bernard",
	"the trial Flow answers Bernard Durand to a new anonymous session: " + JSON.stringify(leaked.result));
var warning = (leaked.warnings || [])[0] || {};
assert(leaked.warnings && leaked.warnings.length === 1 && warning.code === "EXPRESSION_METHOD_ON_ABSENT_VALUE" &&
	warning.path === "local.email" && warning.method === "toLowerCase" && warning.value === "null" && warning.count === 1 &&
	/toLowerCase\(\) is called on local\.email, which is null: the expression gives ""/.test(warning.message) && /!local\.email/.test(warning.hint),
	"the run reports toLowerCase() called on the null email: " + JSON.stringify(leaked.warnings));
assert(call(alice, LOGIN, { user: "alice.martin@example.test" }) && call(alice, trial).result.user.prenom === "Alice" &&
	call(alice, trial).warnings === undefined, "a signed-in session gets its own user, without warning");

var check = JSON.parse(engine.flowSourceValidate(JSON.stringify({ code: trial, name: "CurrentUser" })));
function diagnostic(code) {
	return (check.diagnostics || []).filter(function (item) { return item.code === code; })[0];
}
var comparison = diagnostic("FLOWSCRIPT_NULLABLE_COMPARED_TO_EMPTY_TEXT");
assert(comparison && comparison.severity === "warning" && comparison.path === "local.email" && comparison.line > 0 &&
	/local\.email can be null \(session\.authenticatedUser gives null\): local\.email == "" is false for null/.test(comparison.message) &&
	/Write !local\.email/.test(comparison.next), "code-check warns on the comparison of the nullable email with \"\": " + JSON.stringify(check.diagnostics));
var method = diagnostic("FLOWSCRIPT_METHOD_ON_NULLABLE_VALUE");
assert(method && method.path === "local.email" && method.method === "toLowerCase" && method.line > 0 &&
	/toLowerCase\(\) on null gives ""/.test(method.message), "and on toLowerCase() called on it: " + JSON.stringify(method));

// The Flow written to test the absence: the anonymous session is anonymous, and code-check has nothing to say.
var fixed = currentUser("!local.email");
var anonymousRun = call(httpContext("D"), fixed);
assert(anonymousRun.result.authenticated === false && anonymousRun.result.user === undefined && anonymousRun.warnings === undefined,
	"with condition !local.email a new session is anonymous: " + JSON.stringify(anonymousRun));
var fixedCheck = JSON.parse(engine.flowSourceValidate(JSON.stringify({ code: fixed, name: "CurrentUser" })));
assert(!(fixedCheck.diagnostics || []).some(function (item) { return item.code === "FLOWSCRIPT_NULLABLE_COMPARED_TO_EMPTY_TEXT"; }),
	"no comparison warning once the absence is tested: " + JSON.stringify(fixedCheck.diagnostics));

// code-run returns them after the warnings of the source.
global.context = httpContext("F");
try {
	var codeRun = JSON.parse(engine.flowCodeRun(JSON.stringify({ name: "CurrentUser", code: trial })));
} finally {
	delete global.context;
}
assert(codeRun.ok === true && (codeRun.warnings || []).some(function (item) { return item.code === "EXPRESSION_METHOD_ON_ABSENT_VALUE"; }),
	"code-run keeps the warnings of the run: " + JSON.stringify(codeRun).substring(0, 1200));

// A Flow calling the trial Flow gets its warnings, named after it.
write("_flow/flows/CurrentUser.flow.js", trial);
var caller = call(httpContext("E"), flow("Home", "  local.me = flow.call({flow: \"CurrentUser\", input: {}})\n  result.me = local.me"));
assert(caller.warnings && caller.warnings[0].code === "EXPRESSION_METHOD_ON_ABSENT_VALUE" && caller.warnings[0].flow === "CurrentUser",
	"flow.call passes the warnings of the called Flow on: " + JSON.stringify(caller.warnings));
print("session-identity-per-request OK (" + checks + " checks)");
