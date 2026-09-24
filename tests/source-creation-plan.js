var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var planner = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/source-creation-plan.js"), "UTF-8")));
var root = java.nio.file.Files.createTempDirectory("flow-source-plan-").toFile().getCanonicalFile();
var env = { File: java.io.File, raise: function (code, message) { throw new Error(code + ": " + message); } };
var context = { root: String(root), builder: "custom", drafts: {} };
function assert(value, message) { if (!value) throw new Error(message); }
function plan(recipe, overrides) { return planner.plan(recipe, Object.assign({}, context, overrides || {}), env); }
function rejects(code, recipe, overrides) {
	var caught;
	try { plan(recipe, overrides); } catch (error) { caught = String(error); }
	assert(caught && caught.indexOf(code) >= 0, "Expected " + code + ", got " + caught);
}
var document = { baseId: "document", directory: "documents", fileName: "${localName}.json", source: "" };
var first = plan(document);
assert(first.sourceChanges[String(new java.io.File(root, "documents/document.json"))] === "", "Empty source remains a real creation");
assert(!new java.io.File(root, "documents").exists(), "No directory is written");
var drafts = first.sourceChanges;
assert(plan(document, { drafts: drafts }).sourceId === "document2", "Draft file collision");
assert(plan(document, { usedIds: ["document", "document2"] }).sourceId === "document3", "Declared identity collision");
var real = new java.io.File(root, "documents/document.json");
real.getParentFile().mkdirs(); files.writeStringToFile(real, "saved", "UTF-8");
assert(plan(document).sourceId === "document2", "Saved file collision");
var fixed = Object.assign({}, document, { fileName: "document.json" });
rejects("SOURCE_ALREADY_EXISTS", fixed);
var alternate = Object.assign({}, document, { fileName: "document.yaml", exclusiveFileNames: ["document.json"] });
rejects("SOURCE_ALREADY_EXISTS", alternate);
var alternateDrafts = {}; alternateDrafts[String(new java.io.File(root, "unsaved/document.json"))] = "";
rejects("SOURCE_ALREADY_EXISTS", Object.assign({}, alternate, { directory: "unsaved" }), { drafts: alternateDrafts });
rejects("INVALID_SOURCE_CREATION_RECIPE", Object.assign({}, document, { exclusiveFileNames: ["../external"] }));
rejects("INVALID_SOURCE_CREATION_RECIPE", Object.assign({}, document, { exclusiveFileNames: "document.json" }));
assert(plan(Object.assign({}, document, { fileName: "${localName}.yaml", exclusiveFileNames: ["${localName}.json"] })).sourceId === "document2",
	"Allocation considers alternate representations without interpreting their formats");
var directory = { baseId: "folder", directory: "documents/${localName}", directoryOnly: true, markerFile: ".marker.json", markerSource: "{}" };
var nestedDraft = {}; nestedDraft[String(new java.io.File(root, "documents/folder/nested.json"))] = "value";
assert(plan(directory, { drafts: nestedDraft }).sourceId === "folder2", "Inferred unsaved directory collision");
rejects("SOURCE_CREATION_PARENT_NOT_DIRECTORY", Object.assign({}, document, { directory: "documents/document.json/children" }));
var parentDraft = {}; parentDraft[String(new java.io.File(root, "unsaved.json"))] = "";
rejects("SOURCE_CREATION_PARENT_NOT_DIRECTORY", Object.assign({}, document, { directory: "unsaved.json/children" }), { drafts: parentDraft });
rejects("INVALID_SOURCE_CREATION_PATH", Object.assign({}, document, { directory: "../outside" }));
rejects("INVALID_SOURCE_CREATION_RECIPE", Object.assign({}, document, { fileName: "../file.json" }));
rejects("INVALID_SOURCE_CREATION_RECIPE", Object.assign({}, document, { directory: "${unknown}" }));
assert(Object.keys(parentDraft).length === 1 && parentDraft[String(new java.io.File(root, "unsaved.json"))] === "", "Rejected plans do not change drafts");
assert(String(files.readFileToString(real, "UTF-8")) === "saved", "Planning never changes saved source");
print("source-creation-plan OK");
