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
	var denied = api('blockGet', {name:'proof.direct'});
	assert(denied.error && denied.error.code === 'RHINO_REIMPLEMENTS_HTTP', 'referenced application loaded primitive Rhino: ' + JSON.stringify(denied));
	var allowed = api('blockGet', {name:'proof.trusted'});
	assert(allowed.ok !== false && allowed.name === 'proof.trusted', 'library primitive failed to load: ' + JSON.stringify(allowed));
	assert((allowed.warnings || []).some(function (warning) { return warning.code === 'RHINO_REIMPLEMENTS_HTTP'; }),
		'library primitive warning missing: ' + JSON.stringify(allowed));
	var loader = eval(String(files.readFileToString(new File(engineDir, 'modules/block-file-loader-service.js'), 'UTF-8')));
	assert(loader.primitiveRhinoAllowed('core', 'lib_flow_engine'), 'core primitive not tolerated');
	assert(loader.primitiveRhinoAllowed('reference', 'lib_flow_example'), 'library primitive not tolerated');
	assert(!loader.primitiveRhinoAllowed('reference', 'OtherApp'), 'referenced application primitive tolerated');
	print('Rhino primitive origins OK (' + checks + ' checks)');
} finally { new java.lang.ProcessBuilder('/usr/bin/trash', '-s', String(root.getAbsolutePath())).start().waitFor(); }
