// The Convertigo global symbols of a Flow configuration, ${name} or ${name=default} (secrets in name.secret symbols),
// are resolved by the server for a running Flow only: the effective configuration shown in the Studio and the schemas
// keep the references, the sources are never changed, and an undefined symbol becomes empty and is logged once.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
function assert(value, message) { if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return source.substring(start, end);
}
var service = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/project-config-service.js"), "UTF-8")));

// The resolution itself, with the symbols of a fake server
var symbols = { "app.db.user": "reader", "app.db.password.secret": "s3cr3t" };
function compileSymbols(text) {
	return text.replace(/\$\{([^}=]+)(?:=([^}]*))?\}/g, function (all, name, def) {
		return symbols[name] !== undefined ? symbols[name] : def !== undefined ? def : "";
	});
}
var env = {
	compileSymbols: compileSymbols,
	normalizeTree: function (value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); },
	collectConfigKeys: function () { return []; },
	globalScope: null
};
var projectEngine = { version: 1, config: { sql: { connections: { lab: {
	url: "jdbc:postgresql://db:5432/app", user: "${app.db.user}", password: "${app.db.password.secret=}",
	port: 5432, readOnly: true, tags: ["${app.db.user}", "plain"], timeout: "${app.db.timeout=10}"
} } } } };
var before = JSON.stringify(projectEngine);
var runtime = service.runtimeConfig({}, { flow: {} }, projectEngine, env);
equal(runtime.sql.connections.lab, { url: "jdbc:postgresql://db:5432/app", user: "reader", password: "s3cr3t", port: 5432,
	readOnly: true, tags: ["reader", "plain"], timeout: "10" }, "a running Flow reads the resolved values, nested and in arrays, other values unchanged");
assert(JSON.stringify(projectEngine) === before, "the definition (shared caches) is never changed");
var effective = service.effectiveConfig({}, { flow: {} }, projectEngine, env);
assert(effective.sql.connections.lab.password === "${app.db.password.secret=}", "the effective configuration keeps the references");
var trace = service.effectiveConfigTrace({}, { flow: {} }, projectEngine, env);
assert(trace.config.sql.connections.lab.password === "${app.db.password.secret=}", "the trace shown in the Studio keeps the references");
var callConfig = service.runtimeConfig({ config: { mail: { password: "${app.db.password.secret}" } } }, { flow: {} }, projectEngine, env);
assert(callConfig.mail.password === "s3cr3t", "the configuration given by a call is resolved too");
equal(service.resolveConfigSymbols("no symbol", {}), "no symbol", "without a server, the text stays as it is");
var plain = { a: { b: [1, "x"] } };
assert(service.resolveConfigSymbols(plain, env) === plain, "a configuration without symbol is not copied");
var special = JSON.parse('{"__proto__":{"kept":true},"secret":"${app.db.password.secret}"}');
var resolvedSpecial = service.resolveConfigSymbols(special, env);
assert(Object.prototype.hasOwnProperty.call(resolvedSpecial, "__proto__") && resolvedSpecial.secret === "s3cr3t"
	&& special.secret === "${app.db.password.secret}", "a copied branch keeps its own keys, __proto__ included, and the source stays");

// The compilation by the server: the Convertigo objects of a fake engine
function UndefinedSymbolsException(names, incomplete) {
	this.undefinedSymbols = function () { return java.util.Arrays.asList(names); };
	this.incompletValue = function () { return incomplete; };
}
var warnings = [];
var compiled = { "${ok}": "value" };
var manager = {
	"getCompiledValue(java.lang.String)": function (text) {
		if (compiled[text] !== undefined) return compiled[text];
		if (text === "${broken}") throw new Error("not a symbol error");
		throw { javaException: new UndefinedSymbolsException(["missing.secret"], "") };
	}
};
var fakePackages = { com: { twinsoft: { convertigo: { engine: {
	Engine: { theApp: { databaseObjectsManager: manager }, logEngine: { warn: function (message) { warnings.push(String(message)); } } },
	UndefinedSymbolsException: UndefinedSymbolsException
} } } } };
var compileConfigSymbols = (function (Packages) {
	var sharedRuntime = null;
	var reportedUndefinedSymbols = new java.util.concurrent.ConcurrentHashMap();
	return eval("(" + extract("compileConfigSymbols") + ")");
})(fakePackages);
assert(compileConfigSymbols("${ok}") === "value", "a defined symbol is replaced by the server");
assert(compileConfigSymbols("${missing.secret}") === "" && compileConfigSymbols("${missing.secret}") === "",
	"an undefined symbol without default becomes empty");
assert(warnings.length === 1 && warnings[0].indexOf("missing.secret") > 0, "and is logged once: " + JSON.stringify(warnings));
var rethrown = false;
try { compileConfigSymbols("${broken}"); } catch (e) { rethrown = e.message === "not a symbol error"; }
assert(rethrown, "another failure is not hidden");
var standalone = (function (Packages) {
	var sharedRuntime = null;
	var reportedUndefinedSymbols = new java.util.concurrent.ConcurrentHashMap();
	return eval("(" + extract("compileConfigSymbols") + ")");
})({ com: { twinsoft: { convertigo: { engine: { Engine: { theApp: null } } } } } });
assert(standalone("${ok}") === "${ok}", "without the Convertigo engine, the text stays as it is");

// Only the running Flows read the resolved configuration
var runtimeEnv = extract("create_flowRuntimeServiceEnv");
assert(runtimeEnv.indexOf("effectiveConfig: runtimeEffectiveConfig") > 0, "the runtime service reads the resolved configuration");
var analysisEnv = extract("flowAnalysisServiceEnv");
assert(analysisEnv.indexOf("effectiveConfig: effectiveConfig,") > 0, "the analysis (schemas) keeps the references");
print("config-symbols OK");
