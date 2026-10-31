// A route group or segment of a frontend model is a folder marked by .flow-route.json. Its pages could be deleted with
// flow-resource-delete, but its marker was refused (RESOURCE_PATH_NOT_ALLOWED) and the folder stayed a route of the tree
// that no tool removed: an author whose route group held a page at the same route as the home page could only delete
// the folder by hand. The marker is now a resource like the sources of the folder (read, deleted, patched as JSON), and
// a route folder left empty by a deletion is removed with the empty route folders above it, the routes folder kept.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-route-folder-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var routes = "_flow/frontbuilder/svelte/model/Shop/src/routes";
	function write(path, text) { files.writeStringToFile(new java.io.File(project, path), text, "UTF-8"); }
	function exists(path) { return new java.io.File(project, path).exists(); }
	var page = '<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="page"><Structure /></FlowComponent>\n';
	write(routes + "/+page.flow.svelte", page);
	write(routes + "/(shop)/.flow-route.json", '{\n  "kind": "group"\n}\n');
	write(routes + "/(shop)/+page.flow.svelte", page);
	write(routes + "/(shop)/orders/.flow-route.json", '{\n  "kind": "segment"\n}\n');
	write(routes + "/(shop)/orders/+page.flow.svelte", page);
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }

	var marker = api("resourceGet", { path: routes + "/(shop)/.flow-route.json" });
	assert(marker.ok && JSON.parse(marker.content).kind === "group", "The marker of a route folder is readable: " + JSON.stringify(marker));
	var badMarker = api("resourcePatch", { path: routes + "/(shop)/.flow-route.json", baseHash: marker.hash, patch: "@@ -1,3 +1,3 @@\n {\n-  \"kind\": \"group\"\n+  \"kind\": group\n }\n" });
	assert(!badMarker.ok, "A marker that is not JSON is refused: " + JSON.stringify(badMarker));

	// The page of the group and its marker deleted, the group keeps its segment: the folder stays.
	assert(api("resourceDelete", { path: routes + "/(shop)/+page.flow.svelte" }).ok, "The page of the group is deleted");
	var groupMarker = api("resourceDelete", { path: routes + "/(shop)/.flow-route.json" });
	assert(groupMarker.ok && groupMarker.deleted === true, "The marker of the group is deleted: " + JSON.stringify(groupMarker));
	assert(exists(routes + "/(shop)/orders/+page.flow.svelte"), "A folder holding a segment stays");

	// The last sources of the segment deleted: the segment, then the group left empty, are removed; routes stays.
	assert(api("resourceDelete", { path: routes + "/(shop)/orders/+page.flow.svelte" }).ok, "The page of the segment is deleted");
	assert(exists(routes + "/(shop)/orders"), "A folder still holding its marker stays");
	assert(api("resourceDelete", { path: routes + "/(shop)/orders/.flow-route.json" }).ok, "The marker of the segment is deleted");
	assert(!exists(routes + "/(shop)/orders") && !exists(routes + "/(shop)"), "The empty segment and the empty group are removed");
	assert(exists(routes + "/+page.flow.svelte"), "The routes folder and the home page stay");

	// A dry run deletes nothing.
	write(routes + "/archive/.flow-route.json", '{\n  "kind": "segment"\n}\n');
	var dry = api("resourceDelete", { path: routes + "/archive/.flow-route.json", dryRun: true });
	assert(dry.ok && dry.deleted === false && exists(routes + "/archive/.flow-route.json"), "A dry run deletes nothing");

	print("OK route-folder-removal (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
