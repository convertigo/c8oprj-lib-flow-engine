var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

var preferred = source.indexOf("Bridge.notifySourceMutationWithReveal(");
var overloaded = source.indexOf("Bridge.notifySourceMutation(", preferred);
assertTrue(preferred >= 0,
	"Engine.js must prefer the unambiguous Rhino reveal bridge entry point");
assertTrue(overloaded > preferred,
	"Engine.js must retain the overloaded bridge as a compatibility fallback");

print("source-mutation-bridge OK");
