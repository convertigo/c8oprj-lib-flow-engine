// flow.call({ flow, input: { name: "Test X", status: "AVAILABLE" } }): a quoted text written in the input object is that
// text, as everywhere else in FlowScript. It used to be read again as an expression at run time ("Unknown expression
// identifier: Test"), so agents had to build the object in a local first. Expressions of the object (local.x, `a-${x}`)
// are still evaluated. A tree follows the same value notation: name: "${input.name}" is the value, name: input.name the
// text (nested-input-text.js).
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-call-literal-input").toFile().getAbsolutePath());
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
	"  local.r = flow.call({ flow: \"Echo\", input: { name: \"  Test X \", status: \"AVAILABLE\", quote: 'IN_USE', tick: `plain`,",
	"    id: local.id, label: `id-${local.id}`, count: 3, on: true, tags: [\"a b\", local.id], nested: { site: \"A\" } } })",
	"  result.got = local.r.got"
].join("\n")));
assert(out.ok === true, "the Flow runs: " + JSON.stringify(out).substring(0, 600));
var got = out.result.got;
assert(got.name === "  Test X " && got.status === "AVAILABLE", "quoted texts are passed as they are: " + JSON.stringify(got));
assert(got.quote === "IN_USE" && got.tick === "plain", "single quotes and a plain template literal too: " + JSON.stringify(got));
assert(got.id === 7 && got.label === "id-7", "expressions and template literals are evaluated: " + JSON.stringify(got));
assert(got.count === 3 && got.on === true, "numbers and booleans stay: " + JSON.stringify(got));
assert(JSON.stringify(got.tags) === "[\"a b\",7]" && got.nested.site === "A", "arrays and nested objects too: " + JSON.stringify(got));

// A whole input given as an expression is unchanged.
out = run(caller("  local.in = { name: \"Z\" }\n  local.r = flow.call({ flow: \"Echo\", input: local.in })\n  result.got = local.r.got"));
assert(out.ok === true && out.result.got.name === "Z", "input: local.in still works: " + JSON.stringify(out).substring(0, 400));

// A tree input map gives its expressions as ${...}.
out = run(["version: 1", "nodes:", "  - id: child", "    block: flow.call", "    props:", "      flow: Echo", "      input:",
	"        name: \"${input.name}\"", "    out: result.child", ""].join("\n"), { name: "Hello" });
assert(out.ok === true && out.result.child.got.name === "Hello", "a tree input map reads its ${} expressions: " + JSON.stringify(out).substring(0, 400));

print("flow-call-literal-input: " + checks + " checks passed");
