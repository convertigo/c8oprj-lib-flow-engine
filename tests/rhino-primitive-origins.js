// Rhino stays a full Java bridge for the developers of a project: a block of an ordinary project may use Java
// libraries, whatever the project name, and a referenced project keeps the tolerance it had (origin !== "project").
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var File = java.io.File;
var root = java.nio.file.Files.createTempDirectory('flow-rhino-origins-').toFile().getCanonicalFile();
var app = new File(root, 'App');
var referenced = new File(root, 'OtherApp');
var library = new File(root, 'lib_flow_example');
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(app.getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, source) {
	files.forceMkdir(file.getParentFile());
	files.writeStringToFile(file, source, 'UTF-8');
}
try {
	write(new File(app, 'c8oProject.yaml'), '↓App [core.Project]:\n  projectName: OtherApp\n  projectName: lib_flow_example\n');
	write(new File(referenced, 'c8oProject.yaml'), '↓OtherApp [core.Project]:\n');
	write(new File(library, 'c8oProject.yaml'), '↓lib_flow_example [core.Project]:\n');
	var primitive = 'const _meta={runtime:"rhino",description:"Primitive HTTP implementation."};\n' +
		'(function(){return {run:function(){return new java.net.URL("http://example.invalid").openConnection();}};}())';
	write(new File(referenced, '_flow/blocks/proof/direct.block.js'), primitive);
	write(new File(library, '_flow/blocks/proof/trusted.block.js'), primitive);
	var engine = eval(String(files.readFileToString(new File(engineDir, 'Engine.js'), 'UTF-8')));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request || {}))); }

	// A referenced project, application or library, keeps its primitive Rhino blocks: no rule by project name.
	var direct = api('blockGet', {name:'proof.direct'});
	assert(direct.ok !== false && direct.name === 'proof.direct', 'referenced application block refused: ' + JSON.stringify(direct));
	var trusted = api('blockGet', {name:'proof.trusted'});
	assert(trusted.ok !== false && trusted.name === 'proof.trusted', 'referenced library block refused: ' + JSON.stringify(trusted));

	// A bridge block of the ordinary project uses Java: accepted by code-set (setProjectBlockCode) and by blockCreate.
	var bridgeImplementation = '(function () { return { run: function () {\n' +
		'  var uuid = java.util.UUID.nameUUIDFromBytes(new java.lang.String("bridge").getBytes("UTF-8"));\n' +
		'  return { id: String(uuid), separator: String(Packages.java.io.File.separator) };\n' +
		'} }; }())';
	var bridgeCode = 'const _meta = {runtime:"rhino",description:"Java bridge.",outputs:{out:{type:"object"}}}\n' + bridgeImplementation;
	var set = api('blockCodeSet', {projectDir: __flowProjectDir, name: 'proof.bridge', code: bridgeCode});
	assert(set.ok, 'code-set refused a Java bridge block: ' + JSON.stringify(set.error || set));
	var created = api('blockCreate', {projectDir: __flowProjectDir, name: 'proof.legacyBridge',
		descriptor: {description: 'Java bridge, legacy write.', implementation: {runtime: 'rhino'}, outputs: {out: {type: 'object'}}},
		implementationSource: bridgeImplementation});
	assert(created && !created.error, 'blockCreate refused a Java bridge block: ' + JSON.stringify(created));
	var expected = String(java.util.UUID.nameUUIDFromBytes(new java.lang.String("bridge").getBytes("UTF-8")));
	['proof.bridge', 'proof.legacyBridge'].forEach(function (block) {
		var run = api('flowCodeRun', {name: 'UseBridge', includeTrace: false,
			code: 'function UseBridge({ input, config, result }) {\n  local.out = ' + block + '({})\n  result.id = local.out.id\n}\n'});
		assert(run.ok && run.result && run.result.id === expected, block + ' did not run: ' + JSON.stringify(run).substring(0, 600));
	});
	print('Rhino primitive origins OK (' + checks + ' checks)');
} finally { new java.lang.ProcessBuilder('/usr/bin/trash', '-s', String(root.getAbsolutePath())).start().waitFor(); }
