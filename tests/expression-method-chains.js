// Expressions call the methods of a value as JavaScript does, chained or on a parenthesis, a call or a string, from a
// fixed list of text, list and number methods; nothing else is invoked.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-method-chains").toFile().getAbsolutePath());
var engine = eval(source);

function eq(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
	}
}

function flow(body) {
	return "const _flow = { sourceVersion: 2, inputs: { q: { type: \"string\" }, items: { type: \"array\", items: { type: \"string\" } }, n: { type: \"number\" } } }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
}

function run(body, input) {
	var out = JSON.parse(engine.run(JSON.stringify({ flowSource: flow(body), input: input || {}, includeTrace: false })));
	if (out.ok !== true) {
		throw new Error("should run: " + body + "\n" + JSON.stringify(out).substring(0, 800));
	}
	return out.result;
}

var input = { q: "  Abc Bcd  ", items: ["a", "b", "c", "d"], n: 3.14159 };
var result = run([
	"  local.a = input.q.trim().toLowerCase()",
	"  local.b = input.q.toLowerCase().indexOf(\"b\")",
	"  local.c = (input.q + \"x\").trim().toUpperCase()",
	"  local.d = String(input.n).slice(0, 4)",
	"  local.e = input.items.slice(1, 3).join(\"-\")",
	"  local.f = input.q.trim().split(\" \").length",
	"  local.g = \"a,b\".split(\",\").at(-1)",
	"  local.h = input.n.toFixed(2)",
	"  local.i = input.q.trim().replaceAll(\"c\", \"C\")",
	"  return { a: local.a, b: local.b, c: local.c, d: local.d, e: local.e, f: local.f, g: local.g, h: local.h, i: local.i }"
].join("\n"), input);
eq(result, { a: "abc bcd", b: 3, c: "ABC BCD  X", d: "3.14", e: "b-c", f: 2, g: "b", h: "3.14", i: "AbC BCd" }, "method chains");

eq(run("  local.s = input.items.join(\"-\") + \" \" + (input.q == \")\" ? \"(\" : \",\")\n  return { s: local.s }", input), { s: "a-b-c-d ," },
	"a string literal that spells an operator stays a string");

eq(run("  local.sorted = list.sort({ items: input.items, direction: input.q == \"x\" ? \"asc\" : \"desc\" })\n  return { sorted: local.sorted }", input),
	{ sorted: ["d", "c", "b", "a"] }, "list.sort takes its direction from an expression");

var refused = JSON.parse(engine.run(JSON.stringify({ flowSource: flow("  local.x = input.q.trim().constructor(\"x\")\n  return local.x"), input: input, includeTrace: false })));
if (refused.ok !== false || JSON.stringify(refused).indexOf("Unsupported method") === -1) {
	throw new Error("a method outside the list is refused: " + JSON.stringify(refused).substring(0, 400));
}
print("expression method chains: ok");
