// A configuration mutation (config.mutate, an engine palette item) changes the lines of engine.yaml it changes and
// keeps the others as they are: comments, blank lines, quotes, block scalars and flow collections stay, no line moves
// but around the change, so that the line numbers an agent read stay right for its next patch. A text the editor cannot
// follow is written again as before, which sourceEdit says.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var project = java.nio.file.Files.createTempDirectory("flow-config-minimal-edit").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var yaml = new Packages.com.fasterxml.jackson.databind.ObjectMapper(new Packages.com.fasterxml.jackson.dataformat.yaml.YAMLFactory());
var json = new Packages.com.fasterxml.jackson.databind.ObjectMapper();
function parse(text) { return JSON.parse(String(json.writeValueAsString(yaml.readTree(String(text))))); }

var SOURCE = [
	"version: 1",
	"engineQName: lib_flow_engine.Engine",
	"bindings: {}",
	"# Configuration of the application",
	"config:",
	"  shop:",
	"    demoLogin: true   # demo buttons on the login page",
	"    modeEmail: \"SIMULATION\"",
	"    retentionMonths: 2",
	"",
	"  sql:",
	"    connections:",
	"      shop:",
	"        url: \"jdbc:hsqldb:file:.//_flow/resources/sql/shop/catalog\"",
	"        user: 'SA'",
	"",
	"    queries:",
	"      users:",
	"        connection: shop",
	"        sql: >-",
	"          SELECT U.ID AS \"id\", U.NOM AS \"nom\"",
	"          FROM PCA_UTILISATEUR U",
	"",
	"          WHERE (:email = '' OR U.EMAIL = :email)",
	"        parameters:",
	"          - { name: email, type: string, nullable: false, default: \"\" }",
	"    writes:",
	"      posteInsert:",
	"        operation: insert",
	"        table: PCA_POSTE",
	"",
	"# end of the configuration",
	""
].join("\n");
var original = parse(SOURCE);

function mutate(source, mutation) {
	var response = JSON.parse(engine.applyMutation(JSON.stringify({ target: "engine", engineSource: source, mutations: [mutation], includeTree: false })));
	assert(response.ok === true, "mutation " + JSON.stringify(mutation) + ": " + JSON.stringify(response).substring(0, 500));
	return response;
}
function lines(text) { return String(text).split("\n"); }
// The lines of after that are not lines of before, and the reverse, both in order: a diff of a single change.
function changed(before, after) {
	var a = lines(before), b = lines(after), start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	var endA = a.length, endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
	return { line: start + 1, removed: a.slice(start, endA), added: b.slice(start, endB) };
}

// A key added to a mapping: one line, after the last key of the mapping, nothing else moves.
var added = mutate(SOURCE, { op: "set", path: "config.sql.writes.posteInsert.maxAffectedRows", value: 1 });
var diff = changed(SOURCE, added.source);
assert(added.sourceEdit === "minimal" && diff.removed.length === 0 && diff.added.length === 1 && diff.added[0] === "        maxAffectedRows: 1" &&
	diff.line === 31, "one line added under posteInsert: " + JSON.stringify(diff) + "\n" + added.source);
var expected = parse(SOURCE);
expected.config.sql.writes.posteInsert.maxAffectedRows = 1;
assert(JSON.stringify(parse(added.source)) === JSON.stringify(expected), "the text says the new definition");

// A scalar changed in place: its line only (its comment goes with it), the other lines kept, quotes and block scalar too.
var scalar = mutate(SOURCE, { op: "set", path: "config.shop.demoLogin", value: false });
diff = changed(SOURCE, scalar.source);
assert(diff.line === 7 && diff.removed.length === 1 && diff.added.length === 1 && diff.added[0] === "    demoLogin: false",
	"one line replaced: " + JSON.stringify(diff));
assert(scalar.source.indexOf("        sql: >-\n          SELECT") !== -1 && scalar.source.indexOf("user: 'SA'") !== -1 &&
	scalar.source.indexOf("# end of the configuration") !== -1, "the rest of the text is unchanged");

// A key removed: its lines only.
var removed = mutate(SOURCE, { op: "remove", path: "config.sql.queries.users.parameters" });
diff = changed(SOURCE, removed.source);
assert(removed.sourceEdit === "minimal" && diff.added.length === 0 && diff.removed.length === 2 && diff.removed[0] === "        parameters:",
	"the lines of the removed key: " + JSON.stringify(diff));

// A merge of a new branch, a value replaced by another type, a new mapping at the root.
var merged = mutate(SOURCE, { op: "merge", path: "config.sql.writes", value: { utilisateurInsert: { operation: "insert", table: "PCA_UTILISATEUR" } } });
diff = changed(SOURCE, merged.source);
assert(merged.sourceEdit === "minimal" && diff.removed.length === 0 && diff.added.length === 3 && diff.added[0] === "      utilisateurInsert:" &&
	diff.line === 31, "the new write under writes, in the writes: " + JSON.stringify(diff));
var expectedMerge = parse(SOURCE);
expectedMerge.config.sql.writes.utilisateurInsert = { operation: "insert", table: "PCA_UTILISATEUR" };
assert(JSON.stringify(parse(merged.source)) === JSON.stringify(expectedMerge), "merge as the definition says");
var retyped = mutate(SOURCE, { op: "set", path: "config.sql.queries.users.parameters", value: [{ name: "email", type: "string" }, { name: "nom", type: "string" }] });
var expectedRetyped = parse(SOURCE);
expectedRetyped.config.sql.queries.users.parameters = [{ name: "email", type: "string" }, { name: "nom", type: "string" }];
assert(retyped.sourceEdit === "minimal" && JSON.stringify(parse(retyped.source)) === JSON.stringify(expectedRetyped) &&
	changed(SOURCE, retyped.source).line === 26, "a list written again at its place: " + retyped.source);
var rooted = mutate(SOURCE, { op: "set", path: "config.mail", value: { from: "shop@example.test" } });
assert(rooted.sourceEdit === "minimal" && /  mail:\n    from: "shop@example.test"\n\n# end of the configuration\n$/.test(rooted.source),
	"a new section at the end of config, before the comment that follows it: " + rooted.source);
var emptied = mutate("version: 1\nconfig:\n  only:\n    a: 1\n", { op: "remove", path: "config.only.a" });
assert(emptied.sourceEdit === "minimal" && JSON.stringify(parse(emptied.source).config.only) === "{}", "an emptied mapping stays a mapping: " + emptied.source);
var same = mutate(SOURCE, { op: "set", path: "config.shop.retentionMonths", value: 2 });
assert(same.source === SOURCE && same.sourceEdit === "minimal", "an unchanged value changes nothing");

// What the editor does not follow is written again, as before.
var tabbed = mutate("version: 1\nconfig:\n\tbad: 1\n".replace("\tbad: 1", "  a: 1") + "# x\t\n", { op: "set", path: "config.b", value: 2 });
assert(tabbed.sourceEdit === "rewritten" && parse(tabbed.source).config.b === 2, "a text with a tab is rewritten: " + JSON.stringify(tabbed));
var document = mutate("---\nversion: 1\nconfig:\n  a: 1\n", { op: "set", path: "config.b", value: 2 });
assert(document.sourceEdit === "rewritten" && parse(document.source).config.b === 2, "a document marker too");

// config.mutate reports it; the palette engine mutation writes engine.yaml with its lines.
var service = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/authoring-primitive-service.js"), "UTF-8")));
var flowEngine = { text: SOURCE, getEngineSource: function () { return this.text; }, setEngineSource: function (value) { this.text = String(value); }, isEngineSourceDirty: function () { return false; } };
var configEnv = {
	raise: function (code, message) { var e = new Error(message); e.code = code; throw e; },
	log: function () {},
	studioMode: function () { return true; },
	isInternalRequest: function () { return false; },
	projectFlowEngine: function () { return flowEngine; },
	sha256Hex: function (text) { return String(Packages.org.apache.commons.codec.digest.DigestUtils.sha256Hex(String(text))); },
	parseYamlSource: function (text) { return parse(text); },
	applyEngineMutation: function (text, mutation) {
		var response = mutate(text, mutation);
		return { source: response.source, sourceEdit: response.sourceEdit };
	},
	draftEngineSource: function (engineBean, before, after) { engineBean.setEngineSource(after); }
};
var context = { httpServletRequest: { getAttribute: function () { return null; }, getSession: function () { return null; }, getMethod: function () { return "POST"; }, getHeader: function () { return null; }, getParameter: function () { return null; } } };
var configured = service.configMutate({ project: "App", path: "shop.retentionDays", value: 15, revision: configEnv.sha256Hex(SOURCE) }, context, configEnv);
assert(configured.ok === true && configured.sourceEdit === "minimal" && configured.persisted === "draft" &&
	changed(SOURCE, flowEngine.text).added.join() === "    retentionDays: 15", "config.mutate keeps the lines: " + JSON.stringify(configured));
FileUtils.writeStringToFile(new java.io.File(project, "_flow/engine.yaml"), SOURCE, "UTF-8");
var palette = JSON.parse(engine.authoringMutate(JSON.stringify({ surface: "virtual", includeTree: false,
	mutation: { op: "replace", __engineMutationPath: "config.shop.publicUrl", value: "" } })));
var written = String(FileUtils.readFileToString(new java.io.File(project, "_flow/engine.yaml"), "UTF-8"));
assert(palette.ok === true && palette.sourceEdit === "minimal" && palette.written === true &&
	JSON.stringify(changed(SOURCE, written).added) === "[\"    publicUrl: \\\"\\\"\"]",
	"a palette item writes engine.yaml with its lines kept: " + JSON.stringify(palette).substring(0, 400) + "\n" + written);
FileUtils.deleteQuietly(project);
print("config-yaml-minimal-edit OK (" + checks + " checks)");
