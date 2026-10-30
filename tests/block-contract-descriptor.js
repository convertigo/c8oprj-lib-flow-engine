// The contract of one block (flow-block-get, compact by default) is complete: its longDescription (errors, examples,
// guide) and every path of its outputs. A listing (the compact or signature catalog) stays compact: at most 20 paths per
// output, taken in turn from each branch of the output so that the rows of a page or the fields of an error are not
// hidden behind a long first branch, the number of the others, and where the rest of the contract is.
var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-block-contract-"));
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	FileUtils.writeStringToFile(file, text, "UTF-8");
}

// The shape of sql.table: a resource with many fields and capabilities first, then the page and its rows, an error.
var capabilities = {};
["read", "create", "update", "delete", "transactions", "joins", "procedures", "randomAccess", "bulkWrite", "optimisticConcurrency"].forEach(function (name) {
	capabilities[name] = { type: "boolean" };
});
var outputs = { out: { type: "object", properties: {
	resource: { type: "object", properties: {
		version: { type: "number" }, name: { type: "string" }, readOnly: { type: "boolean" },
		identity: { type: "array", items: { type: "string" } },
		fields: { type: "array", items: { type: "object", properties: { name: { type: "string" }, label: { type: "string" },
			type: { type: "string" }, nullable: { type: "boolean" }, readOnly: { type: "boolean" } } } },
		capabilities: { type: "object", properties: capabilities } } },
	page: { type: "object", properties: {
		rows: { type: "array", items: { type: "object", properties: { key: { type: "object" }, values: { type: "object" }, revision: { type: "string" } } } },
		offset: { type: "number" }, limit: { type: "number" }, hasMore: { type: "boolean" } } },
	error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } }
} } };
write("_flow/blocks/proof/table.block.js", "const _meta = " + JSON.stringify({
	sourceVersion: 2,
	runtime: "rhino",
	description: "Reads a page of a table.",
	longDescription: "Errors: PROOF_TABLE_UNKNOWN (404) when the table does not exist.\n\nExample: proof.table({ table: \"POSTE\" }).",
	properties: { table: { kind: "template", type: "string", "default": "" } },
	outputs: outputs
}, null, 2) + ";\n(function () { return { run: function () { return {}; } }; }())\n");
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function invoke(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }

var got = invoke("blockGet", { name: "proof.table" });
var block = got.block || {};
assert(got.ok === true && got.detail === "compact" && /PROOF_TABLE_UNKNOWN/.test(block.longDescription || ""),
	"flow-block-get keeps the longDescription of the block: " + JSON.stringify(got).substring(0, 600));
var paths = block.outputs && block.outputs.out && block.outputs.out.paths || [];
["page.rows[0].values", "page.rows[0].revision", "error.code", "error.message", "resource.capabilities.optimisticConcurrency"].forEach(function (path) {
	assert(paths.indexOf(path) !== -1, "the contract lists " + path + ": " + JSON.stringify(paths));
});
assert(paths.length > 20 && !block.outputs.out.pathsOmitted && !block.more, "every output path, nothing omitted: " + paths.length);
var leaves = block.outputs.out.leafPaths.map(function (entry) { return entry.path; });
assert(leaves.indexOf("error.code") !== -1 && leaves.indexOf("page.rows[0].revision") !== -1, "and every leaf: " + JSON.stringify(leaves));
var core = invoke("blockGet", { name: "set" });
assert(core.ok === true && typeof (core.block || {}).longDescription === "string" && core.block.longDescription.length > 0,
	"a core block too: " + JSON.stringify(core.block).substring(0, 300));

var listing = invoke("catalog", { detail: "compact", query: "proof.table", origin: "project", includePrivate: true, hints: false, doc: false });
var listed = (listing.blocks || []).filter(function (item) { return item.blockId === "proof.table"; })[0];
assert(listed && listed.longDescription === undefined && /flow-block-get/.test(listed.more || ""),
	"the compact catalog leaves the longDescription to flow-block-get: " + JSON.stringify(listed).substring(0, 400));
var listedOut = listed.outputs.out;
assert(listedOut.paths.length === 20 && listedOut.pathsOmitted === paths.length - 20, "a listing keeps 20 paths and counts the others: " + JSON.stringify(listedOut));
["resource", "page", "error", "page.rows", "page.rows[0]", "error.code", "error.message"].forEach(function (path) {
	assert(listedOut.paths.indexOf(path) !== -1, "the 20 paths of a listing come from every branch, " + path + " among them: " + JSON.stringify(listedOut.paths));
});
assert(listedOut.paths.indexOf("page.rows[0]") > listedOut.paths.indexOf("page") && listedOut.paths.indexOf("error") > listedOut.paths.indexOf("page.hasMore"),
	"in the order of the schema: " + JSON.stringify(listedOut.paths));
var signature = invoke("catalog", { detail: "signature", query: "proof.table", origin: "project", includePrivate: true, hints: false, doc: false });
var signed = (signature.blocks || []).filter(function (item) { return item.block === "proof.table"; })[0];
assert(signed && signed.outputs.out.paths.indexOf("error.code") !== -1 && signed.outputs.out.paths.length === 20, "the signature catalog as well: " + JSON.stringify(signed));
print("block-contract-descriptor OK (" + checks + " checks)");
