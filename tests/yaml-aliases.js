// YAML anchors and aliases are standard YAML: `columns: &cols [...]` then `columns: *cols`. The tree of
// Jackson kept an alias as the text of its name, so the configuration of engine.yaml read "cols" where the
// list was repeated, and a check then said the columns were missing. Aliases and merge keys are resolved.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory("flow-yaml-aliases").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
try {
	FileUtils.writeStringToFile(new java.io.File(project, "_flow/engine.yaml"), [
		"version: 1",
		"config:",
		"  sql:",
		"    queries:",
		"      listOrders:",
		"        sql: select ID, LABEL from ORDERS",
		"        columns: &orderColumns",
		"          - { name: ID, type: integer }",
		"          - { name: LABEL, type: string }",
		"      openOrders:",
		"        sql: select ID, LABEL from ORDERS where OPEN = 1",
		"        columns: *orderColumns",
		""
	].join("\n"), "UTF-8");
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function run(body, input) {
		return JSON.parse(engine.run(JSON.stringify({ includeTrace: false, input: input || {},
			flowSource: 'const _flow = {sourceVersion:2, inputs:{text:{type:"string",default:""}}}\nfunction Aliases({ input, config, result }) {\n' + body + '\n}\n' })));
	}

	var configured = run("  result.queries = config.sql.queries");
	assert(configured.ok, "Run failed: " + JSON.stringify(configured));
	var columns = [{ name: "ID", type: "integer" }, { name: "LABEL", type: "string" }];
	same(configured.result.queries.openOrders.columns, columns, "The alias repeats the anchored columns in the configuration");
	same(configured.result.queries.listOrders.columns, columns, "The anchored value itself is unchanged");

	function parse(text) {
		var out = run('  result.value = yaml.parse({ text: input.text })', { text: text });
		assert(out.ok, "yaml.parse failed for " + text + ": " + JSON.stringify(out));
		return out.result.value;
	}
	same(parse("base: &base { timeout: 30, retries: 2 }\nfast:\n  <<: *base\n  timeout: 5\n"),
		{ base: { timeout: 30, retries: 2 }, fast: { timeout: 5, retries: 2 } }, "A merge key adds the entries the mapping does not set");
	same(parse("a: &a { x: 1, y: 1 }\nb: &b { y: 2, z: 2 }\nc:\n  <<: [*a, *b]\n  z: 3\n").c, { z: 3, x: 1, y: 1 },
		"With a list of merged mappings, the first one wins");
	same(parse("labels: &labels [open, closed]\ncopies: [*labels, *labels]\n").copies, [["open", "closed"], ["open", "closed"]],
		"Aliases repeat inside flow collections");
	same(parse("when: &day 2026-10-30\nagain: *day\nflag: &yes yes\ncount: &n 0x10\nlist: [*yes, *n]\n"),
		{ when: "2026-10-30", again: "2026-10-30", flag: true, count: 16, list: [true, 16] },
		"Scalars keep the typing of Jackson, aliased or not");
	same(parse("sql: select * from ORDERS\nratio: 2 * 3\n"), { sql: "select * from ORDERS", ratio: "2 * 3" },
		"A star that is not an alias stays text");

	var unknown = run('  result.value = yaml.parse({ text: input.text })', { text: "a: *missing\n" });
	// yaml.parse reports what failed as its YAML_PARSE_ERROR.
	assert(!unknown.ok && /alias \*missing has no anchor &missing/.test(unknown.error.message), "An alias without anchor must fail: " + JSON.stringify(unknown));
	var laughs = ["l0: &l0 [x, x, x, x, x, x, x, x, x, x]"];
	for (var level = 1; level <= 6; level++) {
		var refs = []; for (var i = 0; i < 10; i++) refs.push("*l" + (level - 1));
		laughs.push("l" + level + ": &l" + level + " [" + refs.join(", ") + "]");
	}
	var bomb = run('  result.value = yaml.parse({ text: input.text })', { text: laughs.join("\n") + "\n" });
	assert(!bomb.ok && /aliases expand to more than/.test(bomb.error.message), "Exponential aliases must be bounded: " + JSON.stringify(bomb).substring(0, 300));
	FileUtils.writeStringToFile(new java.io.File(project, "_flow/engine.yaml"), "version: 1\nconfig:\n  orders:\n    columns: *orderColumns\n", "UTF-8");
	engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var broken = run("  result.orders = config.orders");
	assert(!broken.ok && /alias \*orderColumns has no anchor/.test(JSON.stringify(broken)), "An engine.yaml alias without anchor is refused, not read as text: " + JSON.stringify(broken));

	print("yaml-aliases OK (" + checks + " checks)");
} finally {
	FileUtils.deleteDirectory(project);
}
