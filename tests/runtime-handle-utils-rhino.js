var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
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

print("runtime-handle-utils-rhino OK");
