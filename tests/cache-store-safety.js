var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function implementation(name) {
	var file = new java.io.File(engineDir, "blocks/cache/" + name + ".block.js");
	var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(file, "UTF-8"));
	return eval(source.substring(source.indexOf("\n(function ()")));
}

var preventStore = implementation("preventStore");
var preventContext = { isCacheEnabled: true };
var preventResult = preventStore.run({
	convertigoContext: function () { return preventContext; }
});
assertTrue(preventResult === false, "cache.preventStore did not return the disabled state");
assertTrue(preventContext.isCacheEnabled === false, "cache.preventStore did not disable CacheManager storage");

var protect = implementation("protect");
var healthyContext = { isCacheEnabled: true };
var healthyResult = protect.run({
	convertigoContext: function () { return healthyContext; },
	runNodes: function () { return { value: "healthy" }; }
}, { nodes: [{ block: "set" }] });
assertTrue(healthyResult.value === "healthy", "cache.protect did not preserve its child result");
assertTrue(healthyContext.isCacheEnabled === true, "cache.protect disabled storage for a healthy child result");

var failedContext = { isCacheEnabled: true };
var originalError = new Error("network failed");
var thrown = null;
try {
	protect.run({
		convertigoContext: function () { return failedContext; },
		runNodes: function () { throw originalError; }
	}, { nodes: [{ block: "http.request" }] });
} catch (error) {
	thrown = error;
}
assertTrue(thrown === originalError, "cache.protect did not rethrow the original child error");
assertTrue(failedContext.isCacheEnabled === false, "cache.protect did not disable storage after a child exception");

print("cache-store-safety OK");
