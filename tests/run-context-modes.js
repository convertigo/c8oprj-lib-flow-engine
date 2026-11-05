// Every run context created by the engine has relayedValues, the mode of the values it evaluates: a run starts on its
// source (the default of its prototype), a lane takes the mode of the block that opens it. A new kind of run context
// must state its mode, and be listed here with where it takes it from.
// This guard is textual: it finds the contexts created by var x = Object.create(runContextPrototype) or
// Object.create(laneContextPrototype). A run context created any other way (copied, assigned a prototype later, built by
// another module or by Java) is not detected and needs its own review.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var reviewed = {
	// a run, a called Flow included, starts on the source of its definition: the mode of the prototype of its context
	"modules/flow-runtime-service.js:createRunContext": { file: "Object.defineProperty(runContextPrototype, \"relayedValues\"" },
	// a lane, on the calling thread or on its own, takes the mode of the block that opens it
	"modules/flow-runtime-service.js:createLaneContext": { body: "lane.relayedValues = template.relayedValues" }
};
var found = {};
files.listFiles(engineDir, ["js"], true).toArray().forEach(function (file) {
	var path = String(engineDir.toPath().relativize(file.toPath())).replace(/\\/g, "/");
	var text = String(files.readFileToString(file, "UTF-8"));
	var pattern = /var\s+([A-Za-z_$][\w$]*)\s*=\s*Object\.create\(\s*(runContextPrototype|laneContextPrototype)\s*\)/g, match;
	while ((match = pattern.exec(text))) {
		if (match[1] === "laneContextPrototype") continue;
		var before = text.substring(0, match.index), start = before.lastIndexOf("\n\t\tfunction ");
		var name = start < 0 ? "?" : /function\s+([A-Za-z_$][\w$]*)/.exec(text.substring(start))[1];
		var next = text.indexOf("\n\t\tfunction ", match.index), body = text.substring(match.index, next < 0 ? text.length : next);
		var key = path + ":" + name;
		if (!reviewed[key]) {
			throw new Error("A run context is created in " + key + " without a reviewed mode: set " + match[1] + ".relayedValues and list it here");
		}
		var expected = reviewed[key].body !== undefined ? reviewed[key].body : reviewed[key].file;
		if ((reviewed[key].body !== undefined ? body : text).indexOf(expected) < 0) {
			throw new Error("The run context of " + key + " no longer sets its mode (" + expected + ")");
		}
		found[key] = true;
	}
});
Object.keys(reviewed).forEach(function (key) {
	if (!found[key]) throw new Error("The reviewed run context " + key + " was not found");
});
print("run-context-modes OK (" + Object.keys(found).length + " run contexts)");
