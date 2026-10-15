// The value notation of Flow (template-syntax.js): the content of a JavaScript template literal. FlowScript reads as
// JavaScript (a quoted string is text, ${ included; a template literal composes; an expression alone keeps its type),
// values are stored as ${expression} with \${ for a literal ${, the former {{ expression }} is still read, and the
// renderer writes values back as natural FlowScript.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-value-notation").toFile().getAbsolutePath());
var engine = eval(source);
var ts = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/template-syntax.js"), "UTF-8")));

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function eq(actual, expected, message) {
	assertTrue(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
}

// the scanner
eq(ts.parts("Bonjour ${input.name}!"), [{ literal: "Bonjour " }, { expression: "input.name" }, { literal: "!" }], "composition");
eq(ts.exactExpression(" ${ default(x, {}) } "), "default(x, {})", "an expression ends at its own closing brace");
eq(ts.exactExpression("${ \"}\" + a }"), "\"}\" + a", "braces inside strings");
eq(ts.exactExpression("{{ local.x }}"), "local.x", "former notation read");
eq(ts.literalText("a \\${b}"), "a ${b}", "\\${ is a literal ${");
eq(ts.literalText("C:\\temp"), "C:\\temp", "a backslash elsewhere is a backslash");
eq(ts.parts("C:\\\\${f}"), [{ literal: "C:\\" }, { expression: "f" }], "\\\\ before ${ is one backslash");
eq(ts.literalText(ts.literal("a\\${b}")), "a\\${b}", "literal round trip");
eq(ts.parts(ts.compose([{ literal: "C:\\" }, { expression: "f" }])), [{ literal: "C:\\" }, { expression: "f" }], "compose round trip");
eq(ts.parts("a ${b"), null, "an unclosed expression");
eq(ts.hasExpression("{{ a ? b : {} }}"), false, "a lone } in a former placeholder leaves it text, as the former notation did");
eq(ts.literalText("{{}} and ${}"), "{{}} and ${}", "empty placeholders stay text");
eq(ts.map("Hi {{ x }} ${lit}", null, true), "Hi ${x} \\${lit}", "a former quoted string: {{ }} read, ${ kept as text");

function flow(body) {
	return "const _flow = { sourceVersion: 2, inputs: { name: { type: \"string\" }, list: { type: \"array\", items: { type: \"object\" } } } }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
}

function run(body, input) {
	var out = JSON.parse(engine.run(JSON.stringify({ flowSource: flow(body), input: input || {}, includeTrace: false })));
	assertTrue(out.ok === true, "should run: " + body + "\n" + JSON.stringify(out).substring(0, 800));
	return out.result;
}

function definition(body) {
	var out = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Probe", code: flow(body) })));
	assertTrue(out.ok === true, "should validate: " + body + "\n" + JSON.stringify(out.diagnostics).substring(0, 800));
	return out.definition;
}

var body = [
	"  local.a = `Hello ${input.name}!`",
	"  local.b = \"cost ${x}\"",
	"  local.c = \"Hi {{ input.name }}\"",
	"  local.d = `C:\\\\${input.name}`",
	"  local.e = input.name",
	"  local.f = `line1\\nline2 ${input.name}`",
	"  local.g = `price \\${x}`",
	"  local.items = list.map({ items: input.list, select: { n: current.name, t: `#${current.id}`, u: \"x ${y}\" } })",
	"  return { a: local.a, b: local.b, c: local.c, d: local.d, e: local.e, f: local.f, g: local.g, items: local.items }"
].join("\n");
var out = run(body, { name: "Ada", list: [{ id: 1, name: "one" }] });
eq(out.a, "Hello Ada!", "a template literal composes");
eq(out.b, "cost ${x}", "a quoted string is text, its ${ included");
eq(out.c, "Hi Ada", "a former {{ }} placeholder is still read");
eq(out.d, "C:\\Ada", "a backslash before an expression");
eq(out.e, "Ada", "an expression");
eq(out.f, "line1\nline2 Ada", "a multi-line composition");
eq(out.g, "price ${x}", "\\${ in a template literal is text");
eq(out.items, [{ n: "one", t: "#1", u: "x ${y}" }], "values of a projection");

var nodes = definition(body).nodes;
function valueOf(id) {
	return nodes.filter(function (node) { return node.id === id; })[0].props.value;
}
eq(valueOf("a"), "Hello ${input.name}!", "stored composition");
eq(valueOf("b"), "cost \\${x}", "stored text escapes its ${");
eq(valueOf("c"), "Hi ${input.name}", "a former placeholder is stored in the current notation");
eq(valueOf("e"), "${input.name}", "stored expression");

// a typed result: a value made of one expression keeps its type
var typed = run("  local.n = input.list\n  return { count: local.n.length, same: local.n }", { list: [{ id: 1 }, { id: 2 }] });
eq(typed, { count: 2, same: [{ id: 1 }, { id: 2 }] }, "an expression keeps its type");

// block defaults are in the current notation
var parsed = run("  local.text = \"{\\\"a\\\": 1}\"\n  local.value = json.parse({})\n  return { value: local.value }");
eq(parsed.value, { a: 1 }, "json.parse reads its default ${local.text}");

// the renderer writes stored values back as natural FlowScript, and the source reads back to the same values
var rendered = JSON.parse(engine.applyMutation(JSON.stringify({
	target: "flow",
	includeTree: false,
	definition: { version: 1, flow: { sourceVersion: 2 }, nodes: [
		{ id: "a", block: "set", props: { path: "local.a", value: "Hello ${input.name}!" } },
		{ id: "b", block: "set", props: { path: "local.b", value: "cost \\${x}" } },
		{ id: "c", block: "set", props: { path: "local.c", value: "Hi {{ input.name }}" } },
		{ id: "d", block: "set", props: { path: "local.d", value: "line1\nline2 ${input.name}" } },
		{ id: "e", block: "set", props: { path: "local.e", value: "${input.name}" } },
		{ id: "f", block: "set", props: { path: "local.f", value: { n: "${input.name}", t: "x \\${y}", u: "C:\\\\${input.name}" } } }
	] },
	mutation: { op: "replace", path: "nodes[0].props.path", value: "local.a" }
}))).source;
[
	"value: `Hello ${input.name}!`",
	"value: \"cost ${x}\"",
	"value: `Hi ${input.name}`",
	"value: `line1\\nline2 ${input.name}`",
	"value: input.name,",
	"n: input.name,",
	"t: \"x ${y}\",",
	"u: `C:\\\\${input.name}`,"
].forEach(function (expected) {
	assertTrue(rendered.indexOf(expected) !== -1, "rendered " + expected + " in:\n" + rendered);
});
assertTrue(rendered.indexOf("{{") === -1, "the former notation is never written:\n" + rendered);
var reread = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Probe", code: rendered }))).definition.nodes;
eq(reread.filter(function (node) { return node.id === "b"; })[0].props.value, "cost \\${x}", "text reads back");
eq(reread.filter(function (node) { return node.id === "f"; })[0].props.value, { n: "${input.name}", t: "x \\${y}", u: "C:\\\\${input.name}" }, "an object reads back");

print("value notation: ok");
