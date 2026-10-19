// An array or object literal given to an expression property of a project block evaluates its ${...} elements
// ([local.row]), and an unknown expression function or method is reported when the Flow is checked, not at run time.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectRoot = java.nio.file.Files.createTempDirectory("lib-flow-engine-expression-literals");
var blocksDir = projectRoot.resolve("_flow/blocks/probe");
java.nio.file.Files.createDirectories(blocksDir);
java.nio.file.Files.writeString(blocksDir.resolve("echo.block.js"), [
	"const _meta = {", "  \"sourceVersion\": 2,", "  \"version\": 1,", "  \"description\": \"Echoes names.\",",
	"  \"properties\": { \"rows\": { \"kind\": \"expression\", \"type\": \"array\", \"default\": [], \"description\": \"Rows.\" } },",
	"  \"outputs\": { \"out\": { \"type\": \"array\" } },", "}", "",
	"function probe_echo({ input, config, local }) {",
	"  local.out = list.map({ items: input.rows, select: { n: current.name } })",
	"}", ""].join("\n"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectRoot.toFile().getAbsolutePath());
var engine = eval(source);

function flow(body) {
	return "const _flow = { sourceVersion: 2, inputs: { q: { type: \"string\" }, items: { type: \"array\" } } }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
}
function assertTrue(condition, message) {
	if (!condition) throw new Error(message);
}

var out = JSON.parse(engine.run(JSON.stringify({ flowSource: flow([
	"  local.row = { name: input.q }",
	"  local.a = probe.echo({ rows: [local.row, { name: \"Bob\" }] })",
	"  return { a: local.a }"].join("\n")), input: { q: "Ada" }, includeTrace: false })));
assertTrue(out.ok === true && JSON.stringify(out.result.a) === JSON.stringify([{ n: "Ada" }, { n: "Bob" }]),
	"an array literal given to a project block evaluates its elements: " + JSON.stringify(out).substring(0, 400));

[["Strin(current) == \"a\"", "Strin"], ["current.frob() == \"a\"", "current.frob"]].forEach(function (pair) {
	var checked = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Probe",
		code: flow("  local.x = list.filter({ items: input.items, where: " + pair[0] + " })\n  return { x: local.x }") })));
	assertTrue(checked.ok === false && JSON.stringify(checked).indexOf(pair[1]) !== -1,
		"an unknown expression function is reported at check time: " + JSON.stringify(checked).substring(0, 300));
});
var valid = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Probe",
	code: flow("  local.x = list.filter({ items: input.items, where: String(current).trim() == \"a\" })\n  return { x: local.x }") })));
assertTrue(valid.ok === true, "known functions and methods pass the check: " + JSON.stringify(valid).substring(0, 300));
print("expression literals and checks: ok");
