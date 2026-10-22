var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var moduleFile = new java.io.File(engineDir, "modules/runtime-handle-utils.js");
var moduleSource = String(Packages.org.apache.commons.io.FileUtils.readFileToString(moduleFile, "UTF-8"));
var runtimeHandles = eval(moduleSource);
var env = {
	raise: function (code, message) {
		var error = new Error(message);
		error.code = code;
		throw error;
	},
	NativeJavaObject: Packages.org.mozilla.javascript.NativeJavaObject,
	JavaObject: Packages.java.lang.Object,
	JavaString: Packages.java.lang.String,
	JavaBoolean: Packages.java.lang.Boolean,
	JavaNumber: Packages.java.lang.Number
};

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var value = runtimeHandles.sanitizeSerializable({
	plainString: "plain",
	plainBoolean: true,
	plainNumber: 12.5,
	javaString: new Packages.java.lang.String("boxed"),
	javaBoolean: new Packages.java.lang.Boolean(true),
	javaInteger: new Packages.java.lang.Integer(7),
	javaDouble: new Packages.java.lang.Double(8.5)
}, "result", env);

assertTrue(value.plainString === "plain", "Plain string changed.");
assertTrue(value.plainBoolean === true, "Plain boolean changed.");
assertTrue(value.plainNumber === 12.5, "Plain number changed.");
assertTrue(typeof value.javaString === "string" && value.javaString === "boxed", "Java string was not normalized.");
assertTrue(typeof value.javaBoolean === "boolean" && value.javaBoolean === true, "Java boolean was not normalized.");
assertTrue(typeof value.javaInteger === "number" && value.javaInteger === 7, "Java integer was not normalized.");
assertTrue(typeof value.javaDouble === "number" && value.javaDouble === 8.5, "Java double was not normalized.");

// Normalization owns its containers: later hook edits must not alter a
// published schema, including nested arrays, shared branches and JSON keys.
var shared = { type: "string" };
var source = JSON.parse('{"__proto__":{"type":"number"},"properties":{}}');
source.properties.first = shared;
source.properties.second = shared;
source.values = [undefined, null, false, 0, "", NaN, -0];
source.sparse = new Array(3);
source.sparse[1] = "present";
var mapCalls = 0;
source.sparse.map = function (callback) { mapCalls++; return Array.prototype.map.call(this, callback); };
source.boxed = {
	text: new Packages.java.lang.String("boxed"),
	bool: new Packages.java.lang.Boolean(false),
	integer: new Packages.java.lang.Integer(7),
	double: new Packages.java.lang.Double(8.5)
};
source.handle = { __flowHandle: true, __flowHandleType: "test", __flowHandleId: "h1", __flowHandleClosed: true };
var normalized = runtimeHandles.normalize(source, env);
assertTrue(normalized !== source && normalized.properties !== source.properties, "Normalization reused a mutable container.");
assertTrue(normalized.properties.first !== shared && normalized.properties.first !== normalized.properties.second, "Normalization shared a mutable branch.");
shared.type = "boolean";
normalized.properties.first.type = "integer";
assertTrue(normalized.properties.second.type === "string", "A published snapshot changed through an alias.");
assertTrue(Object.getPrototypeOf(normalized) === Object.prototype && Object.prototype.hasOwnProperty.call(normalized, "__proto__"), "A JSON key changed the prototype.");
assertTrue(normalized.__proto__.type === "number" && normalized.__proto__ !== source.__proto__, "A special JSON key was not copied.");
assertTrue(normalized.values[0] === undefined && normalized.values[1] === null && normalized.values[2] === false && normalized.values[3] === 0 && normalized.values[4] === "", "A primitive leaf changed.");
assertTrue(isNaN(normalized.values[5]) && 1 / normalized.values[6] === -Infinity, "A numeric primitive changed.");
assertTrue(normalized.sparse.length === 3 && !(0 in normalized.sparse) && normalized.sparse[1] === "present" && !(2 in normalized.sparse), "Sparse array holes changed.");
assertTrue(mapCalls === 1, "Normalization bypassed the array's map implementation.");
assertTrue(normalized.boxed.text === "boxed" && normalized.boxed.bool === false && normalized.boxed.integer === 7 && normalized.boxed.double === 8.5, "Nested Java values changed.");
assertTrue(JSON.stringify(normalized.handle) === '{"handle":"test","id":"h1","state":"closed"}', "A handle leaked instead of its summary.");
assertTrue(runtimeHandles.normalize(new Packages.java.lang.Integer(9), env) === 9, "A root Java value was not converted.");

// Sanitization must preserve the observable traversal contract, not just JSON
// text: isolated aliases, own special keys, sparse arrays and map overrides.
var cleanSource = JSON.parse('{"__proto__":{"safe":true},"constructor":"own","text":"é☃"}');
var branch = { value: 7 };
cleanSource.left = branch;
cleanSource.right = branch;
cleanSource.boxed = source.boxed;
cleanSource.sparse = source.sparse;
cleanSource.values = source.values;
cleanSource.self = cleanSource;
var reads = [];
Object.defineProperty(cleanSource, "first", { enumerable: true, get: function () { reads.push("first"); return 1; } });
Object.defineProperty(cleanSource, "second", { enumerable: true, get: function () { reads.push("second"); return 2; } });
var sanitized = runtimeHandles.sanitizeSerializable(cleanSource, "result", env);
assertTrue(sanitized !== cleanSource && sanitized.left !== branch && sanitized.left !== sanitized.right, "Sanitization leaked mutable aliases.");
assertTrue(Object.getPrototypeOf(sanitized) === Object.prototype && Object.prototype.hasOwnProperty.call(sanitized, "__proto__") && sanitized.__proto__.safe === true, "Sanitization changed an own special key or prototype.");
assertTrue(sanitized.constructor === "own" && sanitized.text === "é☃", "An ordinary JSON property changed.");
assertTrue(sanitized.self === "[Circular]" && cleanSource.self === cleanSource, "Object cycles or source state changed.");
assertTrue(reads.join(",") === "first,second", "Enumerable accessors changed order or multiplicity.");
assertTrue(sanitized.sparse.length === 3 && !(0 in sanitized.sparse) && sanitized.sparse[1] === "present" && !(2 in sanitized.sparse) && mapCalls === 2, "Sanitization changed map overrides or holes.");
assertTrue(sanitized.boxed.text === "boxed" && sanitized.boxed.bool === false && sanitized.boxed.integer === 7 && sanitized.boxed.double === 8.5, "Sanitization changed Java scalar conversions.");
assertTrue(sanitized.values[0] === undefined && sanitized.values[1] === null && sanitized.values[2] === false && sanitized.values[3] === 0 && sanitized.values[4] === "" && isNaN(sanitized.values[5]) && 1 / sanitized.values[6] === -Infinity, "Sanitization changed primitive leaves.");
assertTrue(!runtimeHandles.contains(cleanSource, env), "A cycle or ordinary JSON property was mistaken for a handle.");
var guarded = { first: { nested: [source.handle] } };
var lateRead = false;
Object.defineProperty(guarded, "later", { enumerable: true, get: function () { lateRead = true; throw new Error("must short circuit"); } });
assertTrue(runtimeHandles.contains(guarded, env) && !lateRead, "Handle detection did not short circuit.");
var rejected = false;
try { runtimeHandles.sanitizeSerializable({ nested: [source.handle] }, "result", env); }
catch (e) { rejected = e.code === "RUNTIME_HANDLE_IN_RESULT"; }
assertTrue(rejected, "Nested handle escaped the output boundary.");
assertTrue(runtimeHandles.sanitize({ nested: [source.handle] }, env).nested[0].handle === "test", "Diagnostic sanitization lost a handle summary.");

// Primitive JSON leaves must not invoke a boxed String/Number prototype accessor.
// Rhino allocates the complete native wrapper (including method slots) for that access.
var boxedReads = 0;
Object.defineProperty(String.prototype, "__flowHandle", { configurable: true, get: function () { boxedReads++; return true; } });
Object.defineProperty(Number.prototype, "__flowHandle", { configurable: true, get: function () { boxedReads++; return true; } });
try {
	var primitiveData = { text: "payload", integer: 42, flag: true };
	assertTrue(JSON.stringify(runtimeHandles.normalize(primitiveData, env)) === JSON.stringify(primitiveData), "Normalization interpreted a primitive as a handle.");
	assertTrue(JSON.stringify(runtimeHandles.sanitizeSerializable(primitiveData, "result", env)) === JSON.stringify(primitiveData), "Serialization interpreted a primitive as a handle.");
	assertTrue(!runtimeHandles.contains(primitiveData, env), "Primitive reported as handle.");
	assertTrue(!runtimeHandles.isHandle("payload") && !runtimeHandles.isHandle(42), "Primitive handle detection changed.");
	assertTrue(boxedReads === 0, "Runtime traversals boxed primitive leaves.");
} finally {
	delete String.prototype.__flowHandle;
	delete Number.prototype.__flowHandle;
}

print("runtime-handle-utils-rhino OK");

// Keep the Java conversion protocol for user-defined and inherited getClass.
var classReads = 0;
var customClass = {};
Object.defineProperty(customClass, "getClass", { get: function () { classReads++; throw new Error("expected"); } });
assertTrue(runtimeHandles.jsValue(customClass, env) === customClass && classReads === 1, "getClass accessor fallback changed.");
var customScalar = Object.create({ getClass: function () { return { getName: function () { return "java.lang.String"; } }; } });
customScalar.toString = function () { return "custom"; };
assertTrue(runtimeHandles.jsValue(customScalar, env) === "custom", "Inherited Java conversion protocol changed.");
var noPrototype = Object.create(null); noPrototype.value = 4;
assertTrue(runtimeHandles.normalize(noPrototype, env).value === 4, "Null prototype container changed.");
var javaArray = java.lang.reflect.Array.newInstance(java.lang.String, 1); javaArray[0] = "array";
assertTrue(runtimeHandles.jsValue(javaArray, env) === javaArray, "Java array identity changed.");
assertTrue(runtimeHandles.jsValue(function () {}, env) instanceof Function, "Callable identity changed.");
