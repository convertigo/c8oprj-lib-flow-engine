var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));

function assertEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message + ": " + JSON.stringify(actual));
	}
}

var start = source.indexOf("function frontendActionSteps(action)");
var end = source.indexOf("\n\tfunction ", start + 1);
var implementation = source.substring(start, end);
var frontendActionSteps = eval("(" + implementation + ")");

assertEqual(frontendActionSteps("generate"), ["installBuilder", "generate"],
	"generate must bootstrap provider dependencies before invoking the TypeScript generator");
assertEqual(frontendActionSteps("check"), ["installBuilder", "generate", "installApp", "check"],
	"check must bootstrap both provider and generated application dependencies");
assertEqual(frontendActionSteps("build"), ["installBuilder", "generate", "installApp", "build"],
	"build must bootstrap both provider and generated application dependencies");
assertEqual(frontendActionSteps("install"), ["installBuilder", "generate", "installApp"],
	"install must keep the complete bootstrap sequence");

print("frontend-action-builder-install OK");
