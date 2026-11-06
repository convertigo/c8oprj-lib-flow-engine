// In the shared runtime of the server (one scope for every call, a frame per call), what an expression of one call tries
// on the functions of expressions, on prototypes or on the global objects reaches nothing, and changes nothing for the
// next call of another project: each attempt is refused, the shared scope and the prototypes of the standard objects keep
// their own properties, and the functions of expressions still give their results. It runs Engine.run in the real
// FlowRuntimeApi of the engine, the way FlowEngineBridge does: it needs the engine classes (CONVERTIGO_DEPENDENCIES_JAR).
var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0, failures = [];
function witness(name, ok, detail) {
	checks++;
	if (!ok) failures.push(name);
	print((ok ? "PASS " : "FAIL ") + name + (ok ? "" : ": " + JSON.stringify(detail).substring(0, 400)));
}
var Context = java.lang.Class.forName("org.mozilla.javascript.Context");
var Scriptable = java.lang.Class.forName("org.mozilla.javascript.Scriptable");
var FlowRuntimeApi = Packages.com.twinsoft.convertigo.engine.flow.FlowRuntimeApi;
if (typeof FlowRuntimeApi !== "function") throw new Error("expression-isolation-shared-runtime needs the engine classes (CONVERTIGO_DEPENDENCIES_JAR)");

var cx = Packages.org.mozilla.javascript.Context.getCurrentContext();
var api = new FlowRuntimeApi(cx);
var shared = api.sharedScope();
var layout = String(Packages.com.twinsoft.convertigo.engine.flow.FlowSourceLayout.current().key());
shared.__flowEngineDir = String(engineDir.getPath());
shared.__flowSourceLayout = layout;
Object.defineProperty(shared, "__flowRuntimeApi", { value: api, writable: false, enumerable: false, configurable: false });
var engineFile = new java.io.File(engineDir, "Engine.js");
var engine = cx.evaluateString(shared, String(files.readFileToString(engineFile, "UTF-8")), String(engineFile.getPath()), 1, null);
java.lang.Class.forName("org.mozilla.javascript.ScriptableObject").getMethod("sealObject").invoke(shared);

function accessible(member) { member.setAccessible(true); return member; }
var enter = accessible(java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowRuntimeApi").getDeclaredMethod("enter", Context));
var Frame = java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowRuntimeApi$Frame");
var frameScope = accessible(Frame.getDeclaredField("scope"));
var frameClose = accessible(Frame.getDeclaredMethod("close"));
var FlowPackages = java.lang.Class.forName("com.twinsoft.convertigo.engine.flow.FlowPackages");
var initializeChildScope = accessible(FlowPackages.getDeclaredMethod("initializeChildScope", Scriptable, Scriptable));
var bind = accessible(FlowPackages.getDeclaredMethod("bind", Context, Scriptable, java.lang.Class.forName("java.lang.ClassLoader")));
var loader = java.lang.Thread.currentThread().getContextClassLoader();

// one call of a project in a frame of its own
function call(project, body) {
	var frame = enter.invoke(api, cx);
	try {
		var scope = frameScope.get(frame);
		initializeChildScope.invoke(null, scope, shared);
		scope.__flowEngineDir = String(engineDir.getPath());
		scope.__flowSourceLayout = layout;
		scope.__flowProjectDir = String(project.getPath());
		scope.context = {};
		bind.invoke(null, cx, scope, loader);
		var flowSource = "const _flow = { sourceVersion: 2 }\n\nfunction Probe({ input, config, result }) {\n  local.s = \"abc\"\n  local.o = { a: \"x\" }\n" + body + "\n}\n";
		return JSON.parse(String(engine.run(JSON.stringify({ flowSource: flowSource, input: {}, includeTrace: false }))));
	} finally {
		frameClose.invoke(frame);
	}
}
// the own properties of the shared scope and of the prototypes of its standard objects, with the type of their values,
// read by a script of the shared scope (its own standard objects)
var SNAPSHOT = "(function (global) { var out = {}; function own(label, object) { out[label] = Object.getOwnPropertyNames(object).sort().map(function (name) { " +
	"var value; try { value = object[name]; } catch (e) { value = '?'; } return name + ':' + typeof value; }); } " +
	"out.globals = ['Object', 'Function', 'String', 'Array', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'RegExp', 'Error', 'parseInt', " +
	"'parseFloat', 'isNaN', 'encodeURIComponent', 'flowProbe'].map(function (name) { var d = Object.getOwnPropertyDescriptor(global, name); " +
	"return name + ':' + typeof global[name] + (d && (d.get || d.set) ? ':accessor' : ''); }); " +
	"['Object', 'Function', 'String', 'Array', 'Number'].forEach(function (name) { own(name + '.prototype', global[name].prototype); }); " +
	"return JSON.stringify(out); })(this)";
function snapshot() {
	return String(cx.evaluateString(shared, SNAPSHOT, "snapshot", 1, null));
}
var first = java.nio.file.Files.createTempDirectory("expression-isolation-a").toFile();
var second = java.nio.file.Files.createTempDirectory("expression-isolation-b").toFile();
var warm = call(second, "  return { v: lower(\"A\") }");
witness("a call runs in the shared runtime (control)", warm.ok === true && warm.result.v === "a", warm);
var before = snapshot();

// The first project tries every way it could reach the runtime: each attempt is refused.
var attempts = [
	"local.v = 0 || __defineGetter__(\"Math\", local.s.constructor)",
	"local.v = 0 || __defineGetter__(\"flowProbe\", local.s.constructor)",
	"local.v = 0 || __defineSetter__(\"JSON\", local.s.constructor)",
	"local.v = 0 || constructor(local.o)",
	"local.v = 0 || toString()",
	"local.v = local.s.constructor",
	"local.v = local.o.__proto__",
	"local.v = local.o[\"constructor\"]",
	"local.v = (1).constructor"
];
attempts.forEach(function (attempt) {
	var r = call(first, "  " + attempt + "\n  return { v: typeof local.v }");
	witness("refused in the first call: " + attempt, r.ok === false && /Unknown expression function|cannot be read in an expression/.test(JSON.stringify(r.error)), r);
});

// The second project, in another frame: the shared scope and the prototypes are unchanged, the functions still work.
witness("the shared scope and the standard prototypes keep their properties", snapshot() === before, { before: before.length, after: snapshot().length });
var after = call(second, "  return { round: round(2.5), min: min(3, 1), lower: lower(\"A\"), json: json(local.o), field: local.o.a, length: length(local.s) }");
witness("the functions of expressions and the globals work for the next call", after.ok === true &&
	JSON.stringify(after.result) === JSON.stringify({ round: 3, min: 1, lower: "a", json: "{\"a\":\"x\"}", field: "x", length: 3 }), after);

print(JSON.stringify({ passed: failures.length === 0, checks: checks, failures: failures }));
if (failures.length) throw new Error("expression isolation: " + failures.length + " failed: " + failures.join("; "));
print("expression isolation in the shared runtime: ok");
