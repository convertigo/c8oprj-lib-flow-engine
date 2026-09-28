// A project block with a Studio working copy (a FlowEngine draft passed as
// frontendSourceDrafts) is not overwritten by blockCodeSet/blockCodePatch.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-block-working-copy-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	var body = '(function(){return {run:function(ctx,node){return "v1";}};}())';
	var code = 'const _meta = {runtime:"rhino", description:"Proof."}\n' + body;
	var set = api("blockCodeSet", { name: "proof.guard", code: code });
	assert(set.ok, "blockCodeSet: " + JSON.stringify(set));
	var file = new java.io.File(String(set.codeFile));
	var saved = String(files.readFileToString(file, "UTF-8"));
	var drafts = {};
	drafts[String(file.getAbsolutePath())] = saved.replace('"v1"', '"studio"');

	var refused = api("blockCodeSet", { name: "proof.guard", code: code.replace('"v1"', '"mcp"'), frontendSourceDrafts: drafts });
	assert(!refused.ok && JSON.stringify(refused).indexOf("BLOCK_SOURCE_WORKING_COPY") !== -1,
		"A block with a working copy must not be overwritten: " + JSON.stringify(refused));
	assert(String(files.readFileToString(file, "UTF-8")) === saved, "The refused write changed the saved block");

	var stale = api("blockCodePatch", { name: "proof.guard", revision: set.revision, code: code.replace('"v1"', '"patched"'), frontendSourceDrafts: drafts });
	assert(!stale.ok, "A patch from the saved revision must not replace the working copy: " + JSON.stringify(stale));
	var got = api("blockCodeGet", { name: "proof.guard", frontendSourceDrafts: drafts });
	var patched = api("blockCodePatch", { name: "proof.guard", revision: got.revision, code: code.replace('"v1"', '"patched"'), frontendSourceDrafts: drafts });
	assert(!patched.ok && JSON.stringify(patched).indexOf("BLOCK_SOURCE_WORKING_COPY") !== -1,
		"blockCodePatch must honor the working copy too: " + JSON.stringify(patched));

	var allowed = api("blockCodeSet", { name: "proof.guard", code: code.replace('"v1"', '"v2"'), frontendSourceDrafts: {} });
	assert(allowed.ok && String(files.readFileToString(file, "UTF-8")).indexOf('"v2"') !== -1, "Without a working copy the block is written");
	print("block-working-copy-guard OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
