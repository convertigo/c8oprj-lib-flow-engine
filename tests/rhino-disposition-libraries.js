var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var layout = engineDir.getParentFile().getParentFile();
var files = Packages.org.apache.commons.io.FileUtils;
var File = java.io.File;
var root = java.nio.file.Files.createTempDirectory('flow-disposition-libraries-').toFile().getCanonicalFile();
var app = new File(root, 'App');
var names = ['lib_flow_mcp', 'lib_flow_frontbuilder_svelte', 'lib_flow_sql', 'lib_flow_crud_data', 'lib_flow_entity'];
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(app.getAbsolutePath());
try {
	app.mkdirs();
	var yaml = '↓App [core.Project]:\n';
	names.forEach(function (name) {
		var source = new File(layout, name).getCanonicalFile();
		if (!source.isDirectory()) throw new Error('Missing disposition library: ' + name);
		java.nio.file.Files.createSymbolicLink(new File(root, name).toPath(), source.toPath());
		yaml += '  projectName: ' + name + '\n';
	});
	files.writeStringToFile(new File(app, 'c8oProject.yaml'), yaml, 'UTF-8');
	var engine = eval(String(files.readFileToString(new File(engineDir, 'Engine.js'), 'UTF-8')));
	var result = JSON.parse(engine.catalog(JSON.stringify({detail:'compact', includeIcons:false})));
	if (result.ok !== true) throw new Error('Disposition libraries did not load: ' + JSON.stringify(result.error));
	['sample.formatGreeting', 'browser.preference', 'sql.configCheck', 'data.nameValid', 'entity.fetch'].forEach(function (name) {
		var block = JSON.parse(engine.blockGet(JSON.stringify({name:name})));
		if (block.ok !== true) throw new Error('Disposition block did not materialize: ' + name + ' ' + JSON.stringify(block.error));
	});
	print('Disposition libraries loaded OK (' + names.length + ' references)');
} finally { new java.lang.ProcessBuilder('/usr/bin/trash', '-s', String(root.getAbsolutePath())).start().waitFor(); }
