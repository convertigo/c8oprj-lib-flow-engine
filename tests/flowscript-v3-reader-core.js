var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-reader-core-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
function check(source) {
	var oracle = JSON.parse(String(engine.flowSourceValidate(JSON.stringify({ name: "Example", code: source, skipAnalysis: true }))));
	if (!oracle.ok) throw new Error("Oracle refused: " + JSON.stringify(oracle).substring(0, 1000));
	var direct = JSON.parse(String(Reader.read(source, null)));
	if (direct.diagnostics.length) throw new Error("Reader refused: " + JSON.stringify(direct.diagnostics));
	var expected = codeService.comparable(oracle.definition), actual = codeService.comparable(direct.definition);
	if (actual !== expected) throw new Error("Definition mismatch\nexpected " + expected + "\nactual " + actual);
}
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let x = 1\n  x += 2\n  return { x }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  result.ok = true\n  return\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let x\n  x = "hello"\n  x += " world"\n  return x\n}');
print('flowscript-v3-reader-core OK');
