// A template literal is a value of an expression, as in JavaScript: in a branch of a ternary, as an operand of +, in an
// object or a list of an expression, with a method after it. Only a value written as a whole template literal was read
// (result.a = `...`): local.subject = input.kind == "DAILY" ? `Reminder for ${local.n} item(s)` : `Update for ...`
// was refused with "Unsupported expression character: `", and an author fell back to concatenations. Its text is the
// one a value written as a template literal gives (null and undefined give "", an object its JSON), its ${ } read the
// locals of the Flow and its paths are seen by the checks (inputs read only there are reported).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-expression-template-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(lines) {
		return ['const _flow = { sourceVersion: 2, inputs: { kind: { type: "string", default: "DAILY" }, count: { type: "integer", default: 3 } } }',
			'function Orders({ input, config, result }) {', '  local.n = input.count', '  local.item = { id: 7 }'].concat(lines, ['}', '']).join("\n");
	}
	function run(lines, input) {
		var code = flow(lines);
		var checked = api("flowSourceValidate", { name: "Orders", code: code });
		assert(checked.ok, "the check refused it: " + JSON.stringify(checked).substring(0, 700));
		var out = api("flowCodeRun", { name: "Orders", code: code, includeTrace: false, input: input || { kind: "DAILY", count: 3 } });
		assert(out.ok, "the run failed: " + JSON.stringify(out).substring(0, 700));
		return out.result;
	}
	function same(actual, expected, label) {
		assert(JSON.stringify(actual) === JSON.stringify(expected), label + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
	}

	var ternary = ['  result.subject = input.kind == "DAILY" ? `[Orders] Reminder for ${local.n} item(s)` : `[Orders] Update for ${local.n} item(s)`'];
	same(run(ternary).subject, "[Orders] Reminder for 3 item(s)", "the first branch of a ternary");
	same(run(ternary, { kind: "OTHER", count: 1 }).subject, "[Orders] Update for 1 item(s)", "the second branch of a ternary");
	same(run(['  result.a = input.count > 9 ? `many` : "few"']).a, "few", "a template branch and a string branch");
	same(run(['  result.a = "#" + `${local.n}` + "/" + local.n']).a, "#3/3", "an operand of +");
	same(run(['  result.a = { label: input.count > 1 ? `${local.n} lines` : "one line", list: [`a${local.n}`] }']).a,
		{ label: "3 lines", list: ["a3"] }, "in an object and a list of an expression");
	same(run(['  const total = input.count * 2', '  result.a = total > 1 ? `${total} units` : "one unit"']).a, "6 units", "a local of the Flow in ${ }");
	same(run(['  result.a = input.count > 1 ? `x ${input.count > 2 ? `big ${local.n}` : "small"}` : "none"']).a, "x big 3", "a template inside a template");
	same(run(['  result.a = `ref ${local.n}`.toUpperCase()', '  result.b = `abc`.length']), { a: "REF 3", b: 3 }, "a method and a member after a template");
	same(run(['  result.a = input.count > 1 ? `[${local.missing}] ${local.item}` : ""']).a, '[] {"id":7}', "null gives \"\", an object its JSON");
	same(run(['  result.whole = `[${local.missing}] ${local.item}`', '  result.inner = input.count > 1 ? `[${local.missing}] ${local.item}` : ""']).inner,
		'[] {"id":7}', "the text of a whole value");
	same(run(['  result.a = input.count > 1 ? `a\\tb \\${literal} \\u0041` : ""']).a, "a\tb ${literal} A", "escapes, \\${ kept as text");
	same(run(['  result.a = input.count > 1 ? `{ "count": ${local.n} }` : ""']).a, '{ "count": 3 }', "braces and quotes in the text");

	// what is refused says what to write
	function refused(lines, pattern) {
		var out = api("flowSourceValidate", { name: "Orders", code: flow(lines) });
		var text = JSON.stringify(out);
		assert(!out.ok && pattern.test(text), "expected a refusal matching " + pattern + ": " + text.substring(0, 700));
	}
	refused(['  result.a = input.count > 1 ? `x ${} y` : ""'], /Empty \$\{ \} in a template literal/);
	refused(['  result.a = input.count > 1 ? `x ${local.n y` : ""'], /Unclosed \$\{ \} in a template literal|Unclosed template literal|Unbalanced/);

	// the checks see the paths of a template of an expression
	var check = api("flowCodeCheck", { name: "Orders", code: ['const _flow = { sourceVersion: 2 }', 'function Orders({ input, result }) {',
		'  result.a = input.count > 1 ? `${input.label} x${input.count}` : "one"', '}', ''].join("\n") });
	assert((check.inputVariables || []).indexOf("label") !== -1, "an input read in a template of an expression is an input: " + JSON.stringify(check.inputVariables));

	print("expression-template-literal OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
