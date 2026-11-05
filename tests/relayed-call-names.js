// The blocks a library calls with ctx.callBlock under a computed name, and where each name comes from. A new site, or a
// site that changes, fails until it is reviewed here: a name that data could choose would let data pick a block to run
// (list.filter, list.map or any block that reads its properties itself). Every engine call is scanned, and the
// libraries found next to the engine checkout (the test layout of the Flow libraries) too; a missing one is reported.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var engineRoot = engineDir.getParentFile(), siblings = engineRoot.getParentFile();
var libraries = {
	lib_flow_engine: [engineRoot.getName()],
	lib_flow_crud_data: ["lib_flow_crud_data", "c8oprj-lib-flow-crud-data"],
	lib_flow_sql: ["lib_flow_sql", "c8oprj-lib-flow-sql"],
	lib_flow_entity: ["lib_flow_entity", "c8oprj-lib-flow-entity"],
	lib_flow_mcp: ["lib_flow_mcp"],
	lib_flow_baserow: ["lib_flow_baserow", "c8oprj-lib-flow-baserow"],
	lib_user_manager: ["lib_user_manager", "c8oprj-lib-user-manager"]
};
var reviewed = {
	// a projection block written in the definition of a list.map (refused in a relayed call)
	"lib_flow_engine:blocks/list/map.block.js:value.__flowBlock": 1,
	// the blocks of a rows plan, chosen by the engine from the definition; values only in that realm
	"lib_flow_engine:modules/row-producer-runtime.js:entry": 2,
	"lib_flow_engine:modules/row-producer-runtime.js:finish": 1,
	// the provider of a source, read from config.data, with the table contract (operation, source) checked
	"lib_flow_crud_data:blocks/data/invoke.block.js:implementation": 1,
	// the literal names given to the local helper checked(block, parameters) of sql.jdbc
	"lib_flow_sql:blocks/sql/jdbc.block.js:block": 1,
	// entity.<operation>, the operation checked against a closed list
	"lib_flow_entity:blocks/entity/dispatch.block.js:\"entity.\"+operation": 1,
	// the actor provider of config.entities.actorProvider
	"lib_flow_entity:blocks/entity/resolve.block.js:provider": 1,
	// the directory provider of the entity model of the project
	"lib_flow_entity:lib/entity-directory.js:e.source.provider": 1,
	// MCP tools: the authoring block of a tool kind and a checked operation, the block of a published tool, the target
	// declared by a tool block
	"lib_flow_mcp:blocks/mcp/tool/code/dispatch.block.js:internalBlock": 1,
	"lib_flow_mcp:blocks/mcp/tools/call.block.js:block": 1,
	"lib_flow_mcp:blocks/mcp/tool/run.block.js:target": 1,
	// the actor and directory providers of config.userManager, a recursive provider refused
	"lib_user_manager:blocks/userManager/actor.block.js:provider": 1,
	"lib_user_manager:blocks/userManager/directory.block.js:provider": 1
};
function firstArgument(text, start) {
	var depth = 0, quote = "";
	for (var i = start; i < text.length; i++) {
		var ch = text.charAt(i);
		if (quote) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = "";
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
		else if (ch === "(" || ch === "[" || ch === "{") depth++;
		else if (ch === ")" || ch === "]" || ch === "}") { if (depth === 0) return text.substring(start, i); depth--; }
		else if (ch === "," && depth === 0) return text.substring(start, i);
	}
	return text.substring(start);
}
var found = {}, scanned = [], missing = [];
Object.keys(libraries).forEach(function (library) {
	var root = null;
	libraries[library].forEach(function (name) {
		var candidate = new java.io.File(siblings, name + "/_flow");
		if (!root && candidate.isDirectory()) root = candidate.getCanonicalFile();
	});
	if (!root) { missing.push(library); return; }
	scanned.push(library);
	files.listFiles(root, ["js"], true).toArray().forEach(function (file) {
		var path = String(root.toPath().relativize(file.toPath())).replace(/\\/g, "/");
		if (/(^|\/)(node_modules|tests)\//.test(path) || /\.browser\.js$/.test(path)) return;
		var text = String(files.readFileToString(file, "UTF-8"));
		var pattern = /\b(?:ctx|lane|context)\.callBlock\(/g, match;
		while ((match = pattern.exec(text))) {
			var name = firstArgument(text, match.index + match[0].length).trim();
			if (/^(["'])[^"'\\]*\1$/.test(name)) continue;
			var key = library + ":" + path + ":" + name.replace(/\s+/g, "");
			found[key] = (found[key] || 0) + 1;
		}
	});
});
assert(scanned.indexOf("lib_flow_engine") >= 0, "The engine is scanned");
function assert(value, message) { if (!value) throw new Error(message); }
Object.keys(found).forEach(function (key) {
	assert(reviewed[key] === found[key], "ctx.callBlock with a computed name, not reviewed: " + key + " (" + found[key] + " call(s)); " +
		"check where the name comes from, then list it here");
});
Object.keys(reviewed).forEach(function (key) {
	var library = key.split(":")[0];
	assert(scanned.indexOf(library) < 0 || found[key] === reviewed[key], "The reviewed call " + key + " changed: " + (found[key] || 0) + " call(s)");
});
print("relayed-call-names OK (" + Object.keys(found).length + " sites in " + scanned.join(", ") + (missing.length ? "; not found here: " + missing.join(", ") : "") + ")");
