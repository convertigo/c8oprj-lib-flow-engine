var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var sandbox = java.nio.file.Files.createTempDirectory("flow-source-view-");
var root = sandbox.resolve("project").toFile();
root.mkdirs();
var linked = java.nio.file.Files.createSymbolicLink(sandbox.resolve("linked"), root.toPath()).toFile();
var old = new java.io.File(root, "old/nested/source.js");
old.getParentFile().mkdirs();
files.writeStringToFile(old, "saved", "UTF-8");
var retained = new java.io.File(root, "retained.js");
files.writeStringToFile(retained, "not empty", "UTF-8");
var moved = new java.io.File(linked, "new/nested/source.js");
var writes = {};
writes[String(moved.getAbsolutePath())] = "saved";
writes[String(retained.getAbsolutePath())] = "";
var module = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/source-working-copies.js"), "UTF-8")));
var env = { File: java.io.File, FileUtils: files, hash: function (text) { return text; } };
var view = module.create({ sourceDrafts: writes, sourceRemovals: [String(old)] }, env);
function assert(value, message) { if (!value) throw new Error(message); }
assert(view.read(moved) === "saved" && !moved.exists(), "New source is read without publication");
assert(view.read(retained) === "", "Empty text is a write");
assert(!view.isFile(old) && !view.isDirectory(old.getParentFile()), "Removed source and emptied ancestors are hidden");
assert(view.files(root).map(function (file) { return String(file.getName()); }).join(",") === "new,retained.js", "Discovery sees one effective hierarchy");
assert(view.isDirectory(moved.getParentFile()), "Draft parents need not exist");
assert(view.hasChangesUnder(old.getParentFile()) && view.hasChangesUnder(moved.getParentFile()), "Changes include removals and writes");
assert(!view.hasChangesUnder(new java.io.File(root, "other")), "Unrelated directories are unchanged");
assert(view.read(new java.io.File(root, "new/nested/source.js")) === "saved", "Canonical aliases share state");
var missing = false;
try { view.read(old); } catch (error) { missing = String(error).indexOf("FLOW_SOURCE_REMOVED") >= 0; }
assert(missing, "Removal cannot fall back to the saved file");
assert(module.create({}, env).read(old) === "saved", "Discard restores the original");
assert(String(files.readFileToString(retained, "UTF-8")) === "not empty", "No saved file changed");
var invalid = false;
try { module.create({ sourceDrafts: writes, sourceRemovals: [String(retained)] }, env); }
catch (error) { invalid = String(error).indexOf("FLOW_SOURCE_ENTRY_CONFLICT") >= 0; }
assert(invalid, "Contradictory changes are rejected");
files.deleteDirectory(sandbox.toFile());
print("source-working-copies OK");
