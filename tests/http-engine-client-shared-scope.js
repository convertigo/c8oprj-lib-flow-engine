// The shared runtime of the server (convertigo.javascript.stateless=true) runs a call in a scope that gets its
// standard objects from a sealed shared scope, its prototype, and owns the Java packages of the class path of its
// project (FlowPackages.bind: Packages, java, javax, org, com, edu, net). There, Rhino cannot implement a Java
// interface with "new Interface({...})": NativeJavaClass looks for JavaAdapter in the top-level scope of the class,
// the scope of the call, not in its prototype, and fails with "error instantiating (): class ... is interface or
// abstract". This runs http-engine-client.js in such a scope, where each http.request of a Convertigo context builds
// the cookie store of its HttpState.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var testFile = new java.io.File(new java.io.File(engineDir).getParentFile(), "tests/http-engine-client.js");
var cx = Packages.org.mozilla.javascript.Context.getCurrentContext();
var shared = cx.initStandardObjects(null, true);
// a NativeObject is a JavaScript object for Rhino: its Java setters are reached by reflection
var ScriptableObject = java.lang.Class.forName("org.mozilla.javascript.ScriptableObject");
var Scriptable = java.lang.Class.forName("org.mozilla.javascript.Scriptable");
var scope = java.lang.Class.forName("org.mozilla.javascript.NativeObject").getConstructor().newInstance();
ScriptableObject.getMethod("setPrototype", Scriptable).invoke(scope, shared);
ScriptableObject.getMethod("setParentScope", Scriptable).invoke(scope, java.lang.reflect.Array.newInstance(java.lang.Object, 1));
cx.evaluateString(scope, "(function (top) { var packages = new Packages(java.lang.Thread.currentThread().getContextClassLoader());"
	+ " ['Packages', 'java', 'javax', 'org', 'com', 'edu', 'net'].forEach(function (name) { top[name] = name === 'Packages' ? packages : packages[name]; }); })(this)",
	"shared-scope-packages", 1, null);
var interfaceFailure = null;
try {
	cx.evaluateString(scope, "new java.lang.Runnable({ run: function () {} })", "shared-scope", 1, null);
} catch (e) {
	interfaceFailure = String(e.message || e);
}
if (interfaceFailure === null || interfaceFailure.indexOf("interface or abstract") === -1) {
	throw new Error("the scope does not reproduce the shared runtime: " + interfaceFailure);
}
Packages.org.mozilla.javascript.ScriptableObject.putProperty(scope, "print", print);
Packages.org.mozilla.javascript.ScriptableObject.putProperty(scope, "arguments", cx.newArray(scope, [engineDir]));
cx.evaluateString(scope, String(Packages.org.apache.commons.io.FileUtils.readFileToString(testFile, "UTF-8")),
	"http-engine-client.js", 1, null);
print("http-engine-client-shared-scope OK");
