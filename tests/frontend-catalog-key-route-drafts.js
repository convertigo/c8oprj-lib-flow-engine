// The catalog cache key ignores the drafts of the routes (the catalog reads no page): a page edit reuses the catalog
// in the mutation, the description and the generation. A component draft still changes the key.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}
var activeRequestFallback = null;
eval(source.substring(source.indexOf("\tvar ROUTE_SOURCE_PATH"), source.indexOf("\n", source.indexOf("\tvar ROUTE_SOURCE_PATH"))));
var currentActiveRequest = extract("currentActiveRequest");
var withActiveRequest = extract("withActiveRequest");
var withoutRouteDrafts = extract("withoutRouteDrafts");
function draftsOf(request) {
	return JSON.stringify(Object.keys(request && request.sourceDrafts || {}).sort()) + JSON.stringify(request && request.sourceRemovals || []);
}
function frontendCatalogFingerprintForRequest(request) { return "catalog " + draftsOf(request); }
function blocksCacheKey() { return "blocks " + draftsOf(currentActiveRequest()); }
function sha256Hex(text) { return text; }
var frontendCatalogCacheKey = extract("frontendCatalogCacheKey");

var page = "/workspace/projects/App/_flow/frontbuilder/svelte/model/App/src/routes/+page.flow.svelte";
var layout = "C:\\workspace\\App\\model\\App\\src\\routes\\shop\\+layout.flow.svelte";
var component = "/workspace/projects/App/_flow/frontbuilder/svelte/components/Badge.flow.svelte";
function drafts(paths) {
	var out = {};
	paths.forEach(function (path) { out[path] = "draft of " + path; });
	return out;
}
var saved = frontendCatalogCacheKey({});
assert(frontendCatalogCacheKey({ sourceDrafts: drafts([page, layout]) }) === saved, "page and layout drafts keep the key");
assert(frontendCatalogCacheKey({ sourceRemovals: [page] }) === saved, "a removed page keeps the key");
var withComponent = frontendCatalogCacheKey({ sourceDrafts: drafts([page, component]) });
assert(withComponent !== saved, "a component draft changes the key");
assert(withComponent === frontendCatalogCacheKey({ sourceDrafts: drafts([component]) }), "whatever the pages");
assert(currentActiveRequest() === null, "the active request is restored");
var request = { sourceDrafts: drafts([page]), other: 1 };
withoutRouteDrafts(request);
assert(Object.keys(request.sourceDrafts).length === 1, "the request itself is not changed");
print("frontend-catalog-key-route-drafts OK");
