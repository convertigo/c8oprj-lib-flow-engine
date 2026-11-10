// A Java object reaching the handle guard or a normalization (a java.io.File put in an action response) made Rhino
// walk its bean properties down to Class.getConstructors(), whose Java array answers the read of __flowHandle with
// 'Java class "[Ljava.lang.reflect.Constructor;" has no public instance field or method named "__flowHandle"'.
// The guard tests the member before reading it, and a Java object is a leaf written as its text.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var runtimeHandles = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/runtime-handle-utils.js"), "UTF-8")));
var env = {
	raise: function (code, message) { var error = new Error(message); error.code = code; throw error; },
	NativeJavaObject: Packages.org.mozilla.javascript.NativeJavaObject,
	JavaObject: Packages.java.lang.Object,
	JavaString: Packages.java.lang.String,
	JavaBoolean: Packages.java.lang.Boolean,
	JavaNumber: Packages.java.lang.Number
};
var checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
function attempt(label, fn) {
	try { return fn(); }
	catch (e) { throw new Error(label + " threw: " + (e && e.message || e)); }
}

var file = new java.io.File("/tmp/flow-model/+page.flow.svelte");
var map = new java.util.HashMap(); map.put("key", "value");
var strings = java.lang.reflect.Array.newInstance(java.lang.String, 2); strings[0] = "a"; strings[1] = "b";
var hosts = {
	file: file,
	map: map,
	date: new java.util.Date(0),
	object: new java.lang.Object(),
	strings: strings,
	constructors: new java.lang.Object().getClass().getConstructors(),
	javaClass: java.lang.String
};
Object.keys(hosts).forEach(function (name) {
	var host = hosts[name];
	assert(attempt(name + " isHandle", function () { return runtimeHandles.isHandle(host); }) === false, name + " is not a handle");
	assert(attempt(name + " contains", function () { return runtimeHandles.contains({ nested: [host] }, env); }) === false, name + " holds no handle");
	attempt(name + " normalize", function () { return runtimeHandles.normalize({ nested: { value: host } }, env); });
	attempt(name + " sanitize", function () { return runtimeHandles.sanitizeSerializable({ nested: [host] }, "result", env); });
	attempt(name + " snapshot", function () { return runtimeHandles.snapshot({ value: host }, env); });
});

// A Java object is written as its text; Java scalars, a Java List and JavaScript data keep their conversions.
var normalized = runtimeHandles.normalize({ modelPath: file, map: map, strings: strings }, env);
assert(normalized.modelPath === String(file.getPath()), "a File is written as its path: " + JSON.stringify(normalized));
assert(normalized.map === "{key=value}", "a Map is written as its text: " + JSON.stringify(normalized));
assert(typeof normalized.strings === "string", "a Java array is a leaf: " + JSON.stringify(normalized));
assert(JSON.stringify(runtimeHandles.sanitize({ details: { modelPath: file } }, env)) === JSON.stringify({ details: { modelPath: String(file.getPath()) } }),
	"a diagnostic keeps the path of a File");
var list = new java.util.ArrayList(); list.add("x");
assert(JSON.stringify(runtimeHandles.normalize({ list: list }, env)) === '{"list":{"0":"x"}}', "a Java List keeps its index walk");
var boxed = runtimeHandles.normalize({ text: new java.lang.String("t"), number: new java.lang.Integer(3), flag: new java.lang.Boolean(true) }, env);
assert(boxed.text === "t" && boxed.number === 3 && boxed.flag === true, "Java scalars keep their conversion");
var handle = { __flowHandle: true, __flowHandleType: "test", __flowHandleId: "h1" };
assert(runtimeHandles.isHandle(handle) && runtimeHandles.contains({ nested: [map, handle] }, env), "a handle next to a Java object is still found");
assert(JSON.stringify(runtimeHandles.normalize({ handle: handle }, env).handle) === '{"handle":"test","id":"h1","state":"open"}', "a handle keeps its summary");
var rejected = false;
try { runtimeHandles.sanitizeSerializable({ host: file, handle: handle }, "result", env); }
catch (e) { rejected = e.code === "RUNTIME_HANDLE_IN_RESULT"; }
assert(rejected, "a handle next to a Java object is still refused at the result boundary");
var plain = JSON.parse('{"constructor":"own","__flowHandle":false,"nested":{"getClass":"text"}}');
assert(!runtimeHandles.isHandle(plain) && JSON.stringify(runtimeHandles.normalize(plain, env)) === JSON.stringify(plain), "JavaScript data is unchanged");

print("runtime-handle-host-values OK (" + checks + " checks)");
