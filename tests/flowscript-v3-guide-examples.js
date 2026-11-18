var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-guides-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function check(ok, message) { if (!ok) throw new Error(message); }
var root = new java.io.File(engineDir, "../../lib_flow_mcp/_flow/resources").getCanonicalFile();
var paths = [
	"guide/authoring.md", "guide/authoring-collections.md", "guide/authoring-data.md",
	"guide/authoring-source.md", "guide/authoring-blocks.md", "guide/authoring/dialect.md",
	"guide/authoring/expressions.md", "guide/start.md", "guide/start/syntax.md",
	"skills/convertigo-flow-backend/SKILL.md", "skills/convertigo-flow-mcp/SKILL.md"
];
var found = 0, executed = 0;
paths.forEach(function (path) {
	var file = new java.io.File(root, path);
	check(file.isFile(), 'missing guide: ' + file);
	var markdown = String(files.readFileToString(file, "UTF-8"));
	var fences = /```(?:javascript|js|flowscript)\s*\n([\s\S]*?)\n```/g, match, index = 0;
	while ((match = fences.exec(markdown)) !== null) {
		index++;
		var snippet = match[1];
		if (!/sourceVersion\s*:\s*3/.test(snippet) && !/^guide\//.test(path)) continue;
		var name = 'GuideExample' + (++found);
		var code = /\bfunction\s+[\w$]+\s*\(/.test(snippet)
			? (/sourceVersion\s*:\s*3/.test(snippet) ? snippet : 'const _flow = { sourceVersion: 3 }\n' + snippet)
			: 'const _flow = { sourceVersion: 3 }\nfunction ' + name + '({ input, config, result }) {\n' + snippet + '\n}';
		var lowered = bridge.translate(code);
		check(!lowered.diagnostics.length, path + ' #' + index + ' bridge: ' + JSON.stringify(lowered.diagnostics));
		var validation = api('flowSourceValidate', { name: name, code: code });
		check(validation.ok, path + ' #' + index + ' validation: ' + JSON.stringify(validation).substring(0, 900) + '\n' + lowered.code);
		if (/\b(?:config\.mutate|config\.use|schema\.adopt|sql\.|http\.|requestable\.|email\.)/.test(snippet)) continue;
		var run = api('flowCodeRun', { name: name, code: code, input: { name: 'Ada', items: [{ label: 'A', active: true, amount: 2, field: 3 }] }, includeTrace: false });
		check(run.ok, path + ' #' + index + ' run: ' + JSON.stringify(run).substring(0, 900));
		executed++;
	}
});
check(found >= 5 && executed >= 3, 'guide coverage: ' + found + ' translated, ' + executed + ' run');
print('flowscript-v3-guide-examples OK: ' + found + ' translated, ' + executed + ' run');
