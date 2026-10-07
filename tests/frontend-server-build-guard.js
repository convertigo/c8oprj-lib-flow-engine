// A server runs Node.js, npm and npx only when its configuration allows the builds (allow_server_build); an engine
// before this setting always builds.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

/** @return the guard, which sees the given Packages */
function guardWith(Packages) {
	return eval(functionSource("frontendCheckServerBuild"));
}

function engineWith(engine) {
	return { com: { twinsoft: { convertigo: { engine: { Engine: engine } } } } };
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

function errorOf(fn) {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return null;
}

var asked = 0;
var allowed = false;
var guard = guardWith(engineWith({
	isServerBuildAllowed: function () {
		asked++;
		return allowed;
	}
}));

assertTrue(errorOf(function () { guard("rsvg-convert"); }) === null, "another command is not a build");
assertTrue(asked === 0, "and does not ask the engine");

["node", "npm", "npx"].forEach(function (name) {
	var error = errorOf(function () { guard(name); });
	assertTrue(error && error.code === "FRONTBUILDER_SERVER_BUILD_NOT_ALLOWED", name + " is refused when the server does not allow the builds");
	assertTrue(/allow_server_build/.test(error.hint), "the hint names the setting");
});

allowed = true;
assertTrue(errorOf(function () { guard("npm"); }) === null, "npm runs when the server allows the builds");

var older = guardWith(engineWith({}));
assertTrue(errorOf(function () { older("npm"); }) === null, "an engine without the setting builds");

// frontendExecutable checks before looking for the command
var frontendExecutable = (function () {
	function frontendCheckServerBuild(name) {
		var error = new Error("refused " + name);
		error.code = "FRONTBUILDER_SERVER_BUILD_NOT_ALLOWED";
		throw error;
	}
	return eval(functionSource("frontendExecutable"));
})();
var refused = errorOf(function () { frontendExecutable("node"); });
assertTrue(refused && refused.code === "FRONTBUILDER_SERVER_BUILD_NOT_ALLOWED", "frontendExecutable applies the guard");

print("frontend-server-build-guard OK");
