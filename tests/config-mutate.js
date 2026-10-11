// config.mutate changes a value of a named configuration of a project, for an administrator (POST with the session
// XSRF token) or an authenticated MCP call only, dry runs included. The revision is the one of the source as edited;
// a dry run tells before and after, a draft is the working copy, save writes engine.yaml alone; secrets are refused.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-config-mutate-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
function assert(value, message) { if (!value) throw new Error(message); }
function refused(code, fn) {
	try { fn(); } catch (e) { return e.code === code ? e : null; }
	return null;
}
try {
	var engine = eval(source);
	var service = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/authoring-primitive-service.js"), "UTF-8")));
	function sha(text) { return String(Packages.org.apache.commons.codec.digest.DigestUtils.sha256Hex(String(text))); }
	var yaml = new Packages.com.fasterxml.jackson.databind.ObjectMapper(new Packages.com.fasterxml.jackson.dataformat.yaml.YAMLFactory());
	var json = new Packages.com.fasterxml.jackson.databind.ObjectMapper();

	// a FlowEngine bean: its working copy, its unsaved state
	function flowEngineOf(text) {
		return {
			text: text, dirty: false, drafts: 0,
			getEngineSource: function () { return this.text; },
			setEngineSource: function (value) { this.text = String(value); this.dirty = true; this.drafts++; },
			isEngineSourceDirty: function () { return this.dirty; }
		};
	}
	var engines = {};
	var logs = [];
	var saved = [];
	var studio = false;
	var env = {
		raise: function (code, message) { var e = new Error(message); e.code = code; throw e; },
		log: function (message) { logs.push(String(message)); },
		studioMode: function () { return studio; },
		isInternalRequest: function (request) { return request.internal === true; },
		isWebAdmin: function (session) { return session.admin === true; },
		xsrfToken: function (session) { return session.token || ""; },
		sessionUser: function (session) { return session.user || ""; },
		projectFlowEngine: function (name) { return engines[name] || null; },
		sha256Hex: sha,
		parseYamlSource: function (text, fallback) { return JSON.parse(String(json.writeValueAsString(yaml.readTree(String(text).trim() ? String(text) : fallback)))); },
		applyEngineMutation: function (text, mutation) {
			var response = JSON.parse(engine.applyMutation(JSON.stringify({ target: "engine", engineSource: text, mutations: [mutation], includeTree: false })));
			assert(response.ok, "mutation: " + JSON.stringify(response));
			return response.source;
		},
		draftEngineSource: function (flowEngine, before, after, onConflict) {
			if (flowEngine.getEngineSource() !== before) onConflict();
			flowEngine.setEngineSource(after);
		},
		saveEngineSource: function (flowEngine, name, before, after, onConflict) {
			if (flowEngine.isEngineSourceDirty()) env.raise("CONFIG_DRAFT_EXISTS", "draft");
			if (flowEngine.getEngineSource() !== before) onConflict();
			flowEngine.text = after;
			saved.push(name);
		}
	};
	// HTTP requests as the requesters give them to the Flows on the way
	function request(options) {
		options = options || {};
		return {
			internal: options.internal === true,
			getAttribute: function (name) { return name === service.PRINCIPAL_ATTRIBUTE ? options.mcp || null : null; },
			getSession: function () { return options.session || null; },
			getMethod: function () { return options.method || "POST"; },
			getHeader: function (name) { return name === "X-XSRF-TOKEN" ? options.token || null : null; },
			getParameter: function () { return null; }
		};
	}
	function context(options) { return { httpServletRequest: request(options) }; }
	var admin = { admin: true, token: "t0k3n", user: "admin" };

	// Who may change a configuration
	studio = true;
	assert(service.principal(context({}), env).kind === "studio", "the Studio may");
	studio = false;
	assert(service.principal(null, env).kind === "internal", "a server-side origin without HTTP caller may");
	assert(service.principal(context({ internal: true }), env).kind === "internal", "an internal request may");
	assert(service.principal(context({ mcp: "mcp:agent" }), env).user === "agent", "an authenticated MCP call may");
	assert(service.principal(context({ session: admin, token: "t0k3n" }), env).kind === "admin", "an administrator with POST and the XSRF token may");
	[
		{ name: "anonymous", options: {} },
		{ name: "an ordinary session", options: { session: { admin: false } } },
		{ name: "an administrator over GET", options: { session: admin, token: "t0k3n", method: "GET" } },
		{ name: "an administrator without the XSRF token", options: { session: admin } },
		{ name: "an administrator with another token", options: { session: admin, token: "other" } },
		{ name: "a forged MCP mark", options: { mcp: "admin" } }
	].forEach(function (item) {
		var error = refused("AUTHORING_FORBIDDEN", function () { service.principal(context(item.options), env); });
		assert(error && error.message === "This operation is not allowed.", item.name + " may not, with a plain answer");
	});
	engines.App = flowEngineOf("version: 1\nconfig:\n  greeting: Hello\nconfigs:\n  lab:\n    data:\n      sources: {}\n");
	assert(refused("AUTHORING_FORBIDDEN", function () {
		service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", value: { table: "orders" }, dryRun: true }, context({}), env);
	}), "a dry run is checked the same way");

	// Dry run, then confirmation with previousRevision
	var mcp = context({ mcp: "mcp:agent" });
	var value = { provider: "sql", connection: "labPg", schema: "public", table: "orders", readOnly: true, expose: true };
	var dry = service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", value: value, dryRun: true }, mcp, env);
	assert(dry.dryRun && dry.persisted === "none" && dry.changed && dry.before === null && dry.after.table === "orders"
		&& dry.previousRevision === sha(engines.App.text) && engines.App.drafts === 0, "a dry run tells the change without writing: " + JSON.stringify(dry));
	assert(refused("CONFIG_REVISION_REQUIRED", function () {
		service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", value: value }, mcp, env);
	}), "persisting requires the revision read");
	var draft = service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", value: value, revision: dry.previousRevision }, mcp, env);
	assert(draft.persisted === "draft" && engines.App.drafts === 1 && /table: "?orders"?/.test(engines.App.text),
		"a draft is the working copy: " + engines.App.text);
	assert(draft.revision === sha(engines.App.text), "its revision is the one of the new working copy");
	assert(logs.some(function (line) { return line.indexOf("mcp agent: set App lab data.sources.orders (draft)") > 0; }) && logs.join().indexOf("labPg") === -1,
		"the log tells who changed what, never the values: " + logs);
	var stale = refused("CONFIG_REVISION_CONFLICT", function () {
		service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", op: "remove", revision: dry.previousRevision }, mcp, env);
	});
	assert(stale && stale.revision === draft.revision, "a change in between is a conflict with the current revision");

	// save writes engine.yaml alone, never over a working copy of engine.yaml
	assert(refused("CONFIG_DRAFT_EXISTS", function () {
		service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", op: "remove", revision: draft.revision, persist: "save" }, mcp, env);
	}), "save is refused over unsaved changes of engine.yaml");
	engines.App.dirty = false;
	var removedSource = service.configMutate({ project: "App", configuration: "lab", path: "data.sources.orders", op: "remove", revision: draft.revision, persist: "save" }, mcp, env);
	assert(removedSource.persisted === "saved" && saved[0] === "App" && removedSource.after === null && removedSource.before.table === "orders", "save: " + JSON.stringify(removedSource));

	// default is the config branch; a named configuration must exist
	var greeting = service.configMutate({ project: "App", path: "greeting", value: "Bonjour", dryRun: true }, mcp, env);
	assert(greeting.before === "Hello" && greeting.after === "Bonjour", "default is the config branch: " + JSON.stringify(greeting));
	assert(refused("CONFIG_CONFIGURATION_UNKNOWN", function () {
		service.configMutate({ project: "App", configuration: "prod", path: "a", value: 1, dryRun: true }, mcp, env);
	}), "a named configuration must exist");
	assert(refused("CONFIG_PATH_INVALID", function () {
		service.configMutate({ project: "App", path: "a.__proto__.b", value: 1, dryRun: true }, mcp, env);
	}), "no prototype path");

	// Secrets are references to .secret symbols with an empty default, through the whole value
	function secret(valueToSet) {
		return refused("CONFIG_SECRET_LITERAL", function () {
			service.configMutate({ project: "App", configuration: "lab", path: "data.sources.x", value: valueToSet, dryRun: true }, mcp, env);
		});
	}
	assert(secret({ password: "s3cr3t" }), "a literal password is refused");
	assert(secret({ nested: [{ apiKey: "abc" }] }), "also nested in a list");
	assert(secret({ password: "${app.db.password}" }), "a secret key references a .secret symbol");
	assert(secret({ password: "${app.db.password.secret=s3cr3t}" }), "whose default is empty");
	assert(secret({ url: "jdbc:x?pw=${app.db.password.secret=s3cr3t}" }), "anywhere");
	assert(!secret({ password: "${app.db.password.secret=}", secretFile: "/run/secrets/db.json", tokenUrl: "https://idp/token", user: "reader" }),
		"a .secret reference, a secret file path, a token URL and a user are accepted");
	print("config-mutate OK");
} finally {
	FileUtils.deleteQuietly(project);
}
