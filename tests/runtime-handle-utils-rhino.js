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

print("runtime-handle-utils-rhino OK");
