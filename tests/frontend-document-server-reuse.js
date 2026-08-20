var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var start = source.indexOf("function startFrontendDocumentServer(resourceRoot)");
var end = source.indexOf("function frontendRunDocumentServer", start);
var implementation = source.substring(start, end);
var reuse = implementation.indexOf("if (existing && existing.process.isAlive() && existing.providerKey === selection.key)");
var dependencies = implementation.indexOf("ensureFrontendDocumentDependencies(toolRoot)");

assertTrue(start >= 0 && end > start, "frontend document server implementation was not found");
assertTrue(reuse >= 0 && dependencies > reuse,
	"live frontend document servers must be reused only while their validated provider selection is unchanged");

print("frontend-document-server-reuse OK");
