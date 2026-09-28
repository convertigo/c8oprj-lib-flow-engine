// Block writers always emit the v2 header first: `const _meta = { "sourceVersion": 2, ... }`
// in the canonical literal layout. Rhino blocks saved through blockCodeSet,
// blockCreate or blockEdit used to lose it.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-block-meta-version-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function stored(name) {
		var read = api("blockCodeGet", { name: name });
		assert(read.ok, "blockCodeGet " + name + ": " + JSON.stringify(read));
		return read.code;
	}
	function assertHeader(name, label) {
		var code = stored(name);
		assert(code.indexOf('const _meta = {\n  "sourceVersion": 2,\n') === 0, label + " must start with the v2 header: " + code.substring(0, 200));
		assert(/,\n}\n/.test(code), label + " must use the canonical layout (trailing commas): " + code.substring(0, 400));
		return code;
	}
	function runBlock(name) {
		return api("run", { flowSource: 'const _flow = {sourceVersion:2}\nfunction Proof() {\n' + name + '({ $$out: "result.value", text: "Ada" })\n}', includeTrace: false });
	}
	var rhinoBody = '(function(){return {run:function(ctx,node){return "Hello " + ctx.props(node).text;}};}())';

	var set = api("blockCodeSet", { name: "proof.greet", code: 'const _meta = {runtime:"rhino", description:"Greets.", properties:{text:{kind:"value",type:"string",description:"Name."}}}\n' + rhinoBody });
	assert(set.ok, "blockCodeSet rhino: " + JSON.stringify(set));
	assertHeader("proof.greet", "blockCodeSet rhino");
	var greeted = runBlock("proof.greet");
	assert(greeted.ok && greeted.result.value === "Hello Ada", "Saved Rhino block must run: " + JSON.stringify(greeted));
	var dry = api("blockCodeSet", { name: "proof.greet", code: stored("proof.greet"), dry: true });
	assert(dry.ok && dry.code === stored("proof.greet"), "Rewriting a canonical block must be stable");

	var created = api("blockCreate", { name: "proof.created", descriptor: { description: "Created.", implementation: { runtime: "rhino" }, props: { text: { kind: "value", type: "string", description: "Name." } } }, implementationSource: rhinoBody });
	assert(created.ok !== false, "blockCreate rhino: " + JSON.stringify(created));
	assertHeader("proof.created", "blockCreate rhino");
	assert(runBlock("proof.created").result.value === "Hello Ada", "Created Rhino block must run");

	var descriptor = api("blockGet", { name: "proof.created", detail: "full" }).descriptor;
	descriptor.description = "Edited.";
	var edited = api("blockEdit", { name: "proof.created", descriptor: descriptor });
	assert(edited.ok !== false, "blockEdit rhino: " + JSON.stringify(edited));
	assert(assertHeader("proof.created", "blockEdit rhino").indexOf('"description": "Edited."') !== -1, "Edit lost the description");

	var duplicated = api("blockDuplicate", { fromName: "proof.greet", toName: "proof.copy" });
	assert(duplicated.ok !== false, "blockDuplicate: " + JSON.stringify(duplicated));
	assertHeader("proof.copy", "blockDuplicate rhino");

	var flowBlock = api("blockCodeSet", { name: "proof.flowish", code: 'const _meta = {description:"Flow block."}\nfunction flowish({ input, result }) {\n  result.ok = true\n}' });
	assert(flowBlock.ok, "blockCodeSet FlowScript: " + JSON.stringify(flowBlock));
	assertHeader("proof.flowish", "blockCodeSet FlowScript");

	var rejected = api("blockCodeSet", { name: "proof.old", code: 'const _meta = {sourceVersion:1, runtime:"rhino"}\n' + rhinoBody });
	assert(!rejected.ok && JSON.stringify(rejected).indexOf("FLOW_SOURCE_VERSION_UNSUPPORTED") !== -1, "An explicit other version is still refused");

	print("block-meta-source-version OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
