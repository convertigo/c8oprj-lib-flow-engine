// FlowScript v3 rendering (flowscript-v3.md, section 14) and its guard: the rendering cases, the call-form exceptions,
// the presentation fields, the v2 default function and the Studio path on a v3 source.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-render-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function check(ok, message) { if (!ok) throw new Error(message); }
function text(file) { return String(files.readFileToString(new java.io.File(engineDir, file), "UTF-8")); }

// The rendering cases: each v2 source renders as its v3 text at the first attempt (the rules choose the form, the
// guard accepts it), and reading the v3 text then rendering its definition gives the same text.
var spec = JSON.parse(text("../docs/flowscript-v3-rendering-cases.json"));
var grammar = JSON.parse(text("../docs/flowscript-v3-grammar.json"));
check(spec.cases.length === 24, "24 rendering cases: " + spec.cases.length);
grammar.rendering.callFormExceptions.forEach(function (id) {
	check(spec.cases.some(function (c) { return c.id === id && c.kind === "call"; }), "case for exception " + id);
});
spec.cases.forEach(function (c) {
	if (c.v2) {
		var out = api("flowCodeMigrateV3", { name: "Case", code: c.v2 });
		check(out.ok && out.code === c.v3, c.id + " rendering:\n" + (out.code || "") + "\n" + JSON.stringify(out).substring(0, 1500));
		check(out.attempts === 1 && out.called.length === 0, c.id + " needs the rules only: " + JSON.stringify(out.called));
	}
	var back = api("flowCodeMigrateV3", { name: "Case", code: c.v3, rerender: true });
	check(back.ok && back.code === c.v3 && back.attempts === 1, c.id + " render(read(v3)):\n" + (back.code || "") + "\n" + JSON.stringify(back).substring(0, 1500));
});

// A migrated Flow runs as its v2 source.
function sameRun(label, v2, v3, input) {
	var before = api("flowCodeRun", { name: "Same", code: v2, input: input, includeTrace: false });
	var after = api("flowCodeRun", { name: "Same", code: v3, input: input, includeTrace: false });
	check(before.ok && after.ok && JSON.stringify(before.result) === JSON.stringify(after.result),
		label + " runs alike: " + JSON.stringify(before).substring(0, 600) + "\n" + JSON.stringify(after).substring(0, 600));
}
var loopCase = spec.cases.filter(function (c) { return c.id === "N-FOREACH-CONTINUE"; })[0];
sameRun("N-FOREACH-CONTINUE", loopCase.v2.replace("function Case", "function Same") + "",
	loopCase.v3.replace("function Case", "function Same"), { rows: [{ id: 1, customer: "a", total: 2 }, { id: 2, customer: "b", total: 0 }] });

// default(x, y) of v2 is flow.default(x, y) in v3: a bare default( is no JavaScript, and ?? would keep "".
var defaults = 'const _flow = { sourceVersion: 2, inputs: { a: { type: "string" }, b: { type: "string" } } }\n\n' +
	'function Defaults({ input, config, result }) {\n' +
	'  local.name = default(input.a, "anonymous")\n' +
	'  if (default(input.b, "") == "") {\n    result.empty = true\n  }\n' +
	'  result.label = `Hello ${default(input.a, "you")}`\n' +
	'  result.text = "default(x)"\n' +
	'  result.name = local.name\n}\n';
var migratedDefaults = api("flowCodeMigrateV3", { name: "Defaults", code: defaults });
check(migratedDefaults.ok && migratedDefaults.attempts === 1, "default migration: " + JSON.stringify(migratedDefaults).substring(0, 900));
["local.name = flow.default(input.a, \"anonymous\")", "if (flow.default(input.b, \"\") == \"\") {",
	"result.label = `Hello ${flow.default(input.a, \"you\")}`", "result.text = \"default(x)\""].forEach(function (line) {
	check(migratedDefaults.code.indexOf(line) >= 0, "default written as flow.default: " + line + "\n" + migratedDefaults.code);
});
check(migratedDefaults.code.indexOf("??") < 0, "?? is not written for default: " + migratedDefaults.code);
sameRun("default", defaults.replace("function Defaults", "function Same"), migratedDefaults.code.replace("function Defaults", "function Same"), { a: "", b: "" });

// Blank lines, comments, helpers and an author's return { … } come back.
var layout = 'const _flow = { sourceVersion: 2, inputs: { items: { type: "array" } } }\n\n' +
	'function Layout({ input, config, result }) {\n' +
	'  // the total\n  local.total = sum({ rows: input.items })\n\n' +
	'  local.count = input.items.length\n' +
	'  return { total: local.total, count: local.count }\n}\n\n' +
	'function sum(rows) {\n  local.s = 0\n  forEach({\n    items: rows,\n    $$nodes: function () {\n      local.s = local.s + current\n    },\n  })\n  return local.s\n}\n';
var migratedLayout = api("flowCodeMigrateV3", { name: "Layout", code: layout });
check(migratedLayout.ok, "layout migration: " + JSON.stringify(migratedLayout).substring(0, 1500));
check(migratedLayout.code.indexOf("  // the total\n  local.total = sum({ rows: input.items })\n\n  local.count") >= 0, "comment and blank line kept:\n" + migratedLayout.code);
check(/\n}\n\nfunction sum\(\{ rows \}\) \{\n/.test(migratedLayout.code) && migratedLayout.code.indexOf("for (const item of rows) {") >= 0,
	"helper after the Flow function, one object parameter:\n" + migratedLayout.code);
sameRun("layout", layout.replace("function Layout", "function Same"), migratedLayout.code.replace("function Layout", "function Same"), { items: [1, 2, 3] });

// The guard decides: a natural form whose reading differs becomes a call, the other ones stay natural. The bridge
// copies a loop item read by a list block of the body, so that loop stays a call here.
var guarded = 'const _flow = { sourceVersion: 2, inputs: { groups: { type: "array" } } }\n\n' +
	'function Guarded({ input, config, result }) {\n' +
	'  forEach({\n    items: input.groups,\n    $$nodes: function () {\n' +
	'      local.names = list.map({ items: current.rows, select: text.trim({ text: current.name }) })\n    },\n  })\n' +
	'  local.first = list.filter({ items: input.groups, where: current.open })\n}\n';
var migratedGuarded = api("flowCodeMigrateV3", { name: "Guarded", code: guarded });
check(migratedGuarded.ok && migratedGuarded.called.length === 1 && migratedGuarded.called[0].kind === "loop"
	&& migratedGuarded.code.indexOf("flow.forEach({") >= 0 && migratedGuarded.code.indexOf("local.first = input.groups.filter(item => item.open)") >= 0
	&& migratedGuarded.naturalCode.indexOf("for (const item of input.groups) {") >= 0,
	"refused natural form becomes a call: " + JSON.stringify(migratedGuarded).substring(0, 2000));

// Presentation fields keep the author's writing (D2): declarations, compound assignments, loop variable names.
// x++ means Number(x) + 1 since L0' (section 15), as in JavaScript.
var authored = {
	version: 1, helpers: [],
	flow: { sourceVersion: 3, inputs: { items: { type: "array" } } },
	nodes: [
		{ block: "set", props: { path: "local.total", value: 0 }, __flowScriptDeclare: "let" },
		{ block: "forEach", props: { items: "input.items" }, __flowScriptAs: "row", nodes: [
			{ block: "set", props: { path: "local.total", value: "${local.total + (row)}".replace("row", "current") }, __flowScriptForm: "+=" }
		] },
		{ block: "set", props: { path: "local.total", value: "${Number(local.total) + 1}" }, __flowScriptForm: "++" },
		{ block: "set", props: { path: "result.total", value: "${local.total}" } }
	]
};
var authoredOut = api("flowCodeMigrateV3", { name: "Authored", definition: authored, rerender: true });
check(authoredOut.ok && authoredOut.attempts === 1 && authoredOut.code.indexOf("  let total = 0\n  for (const row of input.items) {\n    total += row\n  }\n  total++\n  result.total = total\n") >= 0,
	"presentation fields: " + JSON.stringify(authoredOut).substring(0, 1500));

// Section 15 forms are written from the specification; the guard sends them back to their call form until the
// reader reads them (relational comparator, several keys).
var sorted = {
	version: 1, helpers: [], flow: { sourceVersion: 3, inputs: { rows: { type: "array" } } },
	nodes: [{ block: "list.sort", out: "local.sorted", props: { items: "input.rows", by: "current.name", compare: "natural",
		then: [{ by: "current.age", compare: "number", direction: "desc" }] } }]
};
var sortedOut = api("flowCodeMigrateV3", { name: "Sorted", definition: sorted, rerender: true });
check(sortedOut.naturalCode && sortedOut.naturalCode.indexOf("local.sorted = input.rows.toSorted((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)) || b.age - a.age)") >= 0,
	"section 15 sort written from the specification: " + JSON.stringify(sortedOut).substring(0, 1500));
check(sortedOut.ok && sortedOut.code.indexOf("local.sorted = list.sort({") >= 0 && sortedOut.called.length === 1 && sortedOut.called[0].kind === "sort",
	"unread section 15 sort stays a call: " + JSON.stringify(sortedOut).substring(0, 1500));

// $$disabled: false is an attribute the natural form cannot carry: the call form keeps it, without the guard.
var notDisabled = api("flowCodeMigrateV3", { name: "NotDisabled", code: 'const _flow = { sourceVersion: 2 }\n\nfunction NotDisabled({ input, config, result }) {\n  set({ $$disabled: false, path: "result.a", value: 1 })\n}\n' });
check(notDisabled.ok && notDisabled.attempts === 1 && notDisabled.code.indexOf('set({ $$disabled: false, path: "result.a", value: 1 })') >= 0,
	"$$disabled: false keeps the call form: " + JSON.stringify(notDisabled).substring(0, 1000));

// A runtime default is left out only where the runtime reads it so: list.sort reads order before direction.
var ordered = { version: 1, helpers: [], flow: { sourceVersion: 3, inputs: { rows: { type: "array" } } },
	nodes: [{ block: "list.sort", out: "local.sorted", props: { items: "input.rows", by: "current.n", direction: "asc", order: "desc" } }] };
var orderedOut = api("flowCodeMigrateV3", { name: "Ordered", definition: ordered, rerender: true });
check(orderedOut.ok && orderedOut.code.indexOf("local.sorted = list.sort({ items: input.rows, by: current.n, direction: \"asc\", order: \"desc\" })") >= 0,
	"direction kept beside order: " + JSON.stringify(orderedOut).substring(0, 1200));

// The Studio path: a tree edit of a v3 source writes v3 text; an edit v3 cannot write is refused with its code.
var studio = 'const _flow = { sourceVersion: 3, inputs: { items: { type: "array" } } }\n\n' +
	'function Studio({ input, config, result }) {\n' +
	'  const doubled = json.array({ itemType: { type: "number" } })\n' +
	'  for (const item of input.items) {\n    doubled.push(item * 2)\n  }\n' +
	'  return { doubled }\n}\n';
var studioSet = api("flowCodeSet", { name: "Studio", code: studio });
check(studioSet.ok, "v3 source: " + JSON.stringify(studioSet).substring(0, 900));
var edited = api("applyMutation", { target: "flow", name: "Studio", flowSource: studio, mutation: { op: "replace", path: "nodes[2].props.path", value: "result.twice" } });
check(edited.ok && /sourceVersion: 3/.test(edited.source) && edited.source.indexOf("for (const item of input.items) {") >= 0
	&& edited.source.indexOf("local.doubled.push(item * 2)") >= 0 && edited.source.indexOf("result.twice = local.doubled") >= 0,
	"Studio edit writes v3: " + JSON.stringify(edited).substring(0, 1500));
var editedRun = api("flowCodeRun", { name: "Studio", code: edited.source, input: { items: [1, 2] }, includeTrace: false });
check(editedRun.ok && JSON.stringify(editedRun.result.twice) === "[2,4]", "edited v3 source runs: " + JSON.stringify(editedRun).substring(0, 900));
var refused = api("applyMutation", { target: "flow", name: "Studio", flowSource: studio, mutation: { op: "replace", path: "nodes[3].disabled", value: true } });
check(!refused.ok && refused.error && refused.error.code === "FLOWSCRIPT_V3_RENDER_CHANGED_PROGRAM",
	"an edit v3 cannot write is refused: " + JSON.stringify(refused).substring(0, 1200));
print("flowscript-v3-render OK");
