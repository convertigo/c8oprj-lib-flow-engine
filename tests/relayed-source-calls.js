// ctx.callBlock relays values by default. A call that relays source instead ({ source: true }) must be one of the
// reviewed relays below, each with the reason why its properties are source.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var reviewed = {
	// a projection block of list.map is a node of the definition that holds the list.map
	"blocks/list/map.block.js": 1
};
function callText(text, start) {
	var depth = 0, quote = "";
	for (var i = start; i < text.length; i++) {
		var ch = text.charAt(i);
		if (quote) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = "";
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
		else if (ch === "(") depth++;
		else if (ch === ")" && --depth === 0) return text.substring(start, i + 1);
	}
	return text.substring(start);
}
var found = {};
var all = files.listFiles(engineDir, ["js"], true).toArray();
all.forEach(function (file) {
	var path = String(engineDir.toPath().relativize(file.toPath())).replace(/\\/g, "/");
	var text = String(files.readFileToString(file, "UTF-8"));
	var pattern = /\bcallBlock\s*\(/g, match;
	while ((match = pattern.exec(text))) {
		var call = callText(text, match.index + match[0].length - 1);
		if (/\bsource\s*:\s*(?!false\b)[^,}\s]/.test(call)) {
			found[path] = (found[path] || 0) + 1;
		}
	}
});
Object.keys(found).forEach(function (path) {
	if (reviewed[path] !== found[path]) {
		throw new Error("ctx.callBlock with { source } in " + path + " (" + found[path] + " call(s)): relay values, or review the call and list it here with its reason");
	}
});
Object.keys(reviewed).forEach(function (path) {
	if (found[path] !== reviewed[path]) {
		throw new Error("The reviewed source relay of " + path + " changed: " + (found[path] || 0) + " call(s)");
	}
});
print("relayed-source-calls OK (" + Object.keys(found).length + " reviewed file(s))");
