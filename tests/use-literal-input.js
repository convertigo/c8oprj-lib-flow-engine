// A quoted text in use.input is data; expressions and templates still resolve.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("use-literal-input").toFile().getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	FileUtils.writeStringToFile(file, text, "UTF-8");
}
write("_flow/flows/Echo.flow.js", "const _flow = { sourceVersion: 2 }\nfunction Echo({ input, config, result }) {\n  result.got = input\n}\n");
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function run(source, input) {
	return JSON.parse(engine.run(JSON.stringify({ flowSource: source, input: input || {}, includeTrace: false })));
}
function caller(body) {
	return "const _flow = { sourceVersion: 2 }\nfunction Caller({ input, config, result }) {\n" + body + "\n}\n";
}

var out = run(caller([
	"  local.id = 7",
	"  local.r = use({ contract: \"echo@1\", implementation: \"Echo\", input: { name: \"  Test X \", status: \"AVAILABLE\",",
	"    id: local.id, label: `id-${local.id}`, tags: [\"a b\", local.id], nested: { site: \"A\" } } })",
	"  result.got = local.r.got"
].join("\n")));
assert(out.ok === true, "the use block runs: " + JSON.stringify(out).substring(0, 650));
var got = out.result.got;
assert(got.name === "  Test X " && got.status === "AVAILABLE", "quoted texts remain data: " + JSON.stringify(got));
assert(got.id === 7 && got.label === "id-7", "expressions and templates resolve: " + JSON.stringify(got));
assert(JSON.stringify(got.tags) === "[\"a b\",7]" && got.nested.site === "A", "nested lists and objects resolve: " + JSON.stringify(got));

out = run(caller("  local.in = { name: \"Z\" }\n  local.r = use({ contract: \"echo@1\", implementation: \"Echo\", input: local.in })\n  result.got = local.r.got"));
assert(out.ok === true && out.result.got.name === "Z", "whole input expression still resolves: " + JSON.stringify(out).substring(0, 400));

out = run(["version: 1", "nodes:", "  - id: child", "    block: use", "    props:", "      contract: echo@1",
	"      implementation: Echo", "      input:", "        name: \"${input.name}\"", "    out: result.child", ""].join("\n"), { name: "Hello" });
assert(out.ok === true && out.result.child.got.name === "Hello", "a tree input map reads its ${} expressions: " + JSON.stringify(out).substring(0, 400));

print("use-literal-input: " + checks + " checks passed");
