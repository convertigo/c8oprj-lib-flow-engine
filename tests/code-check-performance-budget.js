// Count work, not elapsed time: a warm Baserow check once validated modules
// 121,249 times. These observations exist only in this test's in-memory Engine.
var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var engineDir = new File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var workspace, project, __flowProjectDir;
var source = String(files.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var checks = 0;
function assertTrue(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function replaceOnce(text, anchor, replacement) {
	assertTrue(text.indexOf(anchor) >= 0 && text.indexOf(anchor) === text.lastIndexOf(anchor), "Instrumentation anchor is not unique: " + anchor);
	return text.replace(anchor, replacement);
}
var __checkBudget = {
	active: null,
	capabilityRuns: [],
	start: function () { this.active = { modules: {}, analyses: 0, descriptors: {} }; },
	count: function (kind, key) {
		if (!this.active) return;
		var counts = this.active[kind];
		counts[key] = (counts[key] || 0) + 1;
	},
	read: function (file, encoding) {
		if (String(file.getName()) === "c8oProject.yaml") this.count("descriptors", String(file.getCanonicalPath()));
		return files.readFileToString(file, encoding);
	},
	capability: function (callback) {
		// The public API is measured around its entire operation. For the MCP
		// route measure only the read-only capability nested in Engine.run:
		// runtime work outside it deliberately does not use read-only memos.
		if (this.active) return callback();
		this.start();
		try { return callback(); }
		finally { this.capabilityRuns.push(this.active); this.active = null; }
	}
};
source = replaceOnce(source, "var FileUtils = Packages.org.apache.commons.io.FileUtils;",
	"var NativeFileUtils = Packages.org.apache.commons.io.FileUtils; var FileUtils = {}; " +
	"Array.prototype.forEach.call(Packages.java.lang.Class.forName('org.apache.commons.io.FileUtils').getMethods(), function (method) { " +
	"var name = String(method.getName()); if (Packages.java.lang.reflect.Modifier.isStatic(method.getModifiers())) FileUtils[name] = NativeFileUtils[name]; }); " +
	"FileUtils.readFileToString = function (file, encoding) { return __checkBudget.read(file, encoding); };");
// Count actual validation after the memo hit, rather than every helper access.
source = replaceOnce(source, "if (known != null) return known;\n\t\tvar file = engineModuleFile(name);",
	"if (known != null) return known;\n\t\t__checkBudget.count('modules', name); var file = engineModuleFile(name);");
source = replaceOnce(source, "function analyzeFlowSource(blocks, flowSource, request) {",
	"function analyzeFlowSource(blocks, flowSource, request) { if (__checkBudget.active) __checkBudget.active.analyses++;");
source = replaceOnce(source, "function flowCodeCheckRequest(blocks, request) {",
	"function flowCodeCheckRequest(blocks, request) { return __checkBudget.capability(function () { return budgetedFlowCodeCheckRequest(blocks, request); }); }\n" +
	"\tfunction budgetedFlowCodeCheckRequest(blocks, request) {");

// A small, self-contained project with a referenced graph block and a nested
// object schema exercises the same repeated helper paths as the data libraries.
// Budgets include headroom for legitimate module additions, but each module and
// project descriptor can be validated/read at most once per read-only operation.
var limits = {
	cold: { modules: 48, analyses: 2, descriptors: 3 },
	warm: { modules: 36, analyses: 1, descriptors: 2 },
	capability: { modules: 36, analyses: 1, descriptors: 1 }
};
function budget(label, counts) {
	var limit = label === "public-cold" ? limits.cold : label.indexOf("public-") === 0 ? limits.warm : limits.capability;
	var totalModules = 0, totalDescriptors = 0;
	Object.keys(counts.modules).forEach(function (name) {
		assertTrue(counts.modules[name] === 1, label + ": module validated repeatedly: " + name + " = " + counts.modules[name]);
		totalModules += counts.modules[name];
	});
	Object.keys(counts.descriptors).forEach(function (file) {
		assertTrue(counts.descriptors[file] === 1, label + ": descriptor read repeatedly: " + file + " = " + counts.descriptors[file]);
		totalDescriptors += counts.descriptors[file];
	});
	assertTrue(totalModules > 0 && totalModules <= limit.modules, label + ": module validation budget exceeded: " + totalModules);
	// The first catalog load also validates the referenced graph implementation.
	assertTrue(counts.analyses > 0 && counts.analyses <= limit.analyses, label + ": source analysis budget exceeded: " + counts.analyses);
	assertTrue(totalDescriptors > 0 && totalDescriptors <= limit.descriptors, label + ": descriptor read budget exceeded: " + totalDescriptors);
	print("BUDGET " + JSON.stringify({ operation: label, moduleValidations: totalModules, analyses: counts.analyses,
		descriptorReads: totalDescriptors }));
}
workspace = java.nio.file.Files.createTempDirectory("flow-check-budget-").toFile();
project = new File(workspace, "BudgetConsumer");
__flowProjectDir = String(project.getAbsolutePath());
try {
	write(new File(project, "c8oProject.yaml"), "↓BudgetConsumer [core.Project]:\n  projectName: BudgetProvider\n");
	var provider = new File(workspace, "BudgetProvider");
	write(new File(provider, "c8oProject.yaml"), "↓BudgetProvider [core.Project]:\n");
	write(new File(provider, "_flow/blocks/budget/echo.block.js"),
		'const _meta = { properties: { value: { kind: "value", type: "object" } }, outputs: { out: { type: "object" } } }\n' +
		'function echo({ input, result }) {\n  result.value = input.value\n}\n');
	var properties = {};
	for (var field = 0; field < 24; field++) properties["field" + field] = { type: "object", properties: { text: { type: "string" }, values: { type: "array", items: { type: "number" } } } };
	var code = ["const _flow = " + JSON.stringify({ sourceVersion: 2, inputs: { record: { type: "object", properties: properties } } }),
		"function Reference({ input, result }) {"];
	for (var node = 0; node < 12; node++) code.push("  local.item" + node + " = budget.echo({ value: input.record })");
	code.push("  result.record = local.item11", "}", "");
	write(new File(project, "_flow/flows/Reference.flow.js"), code.join("\n"));
	var engine = eval(source);
	var request = JSON.stringify({ name: "Reference", draft: false });
	var expected = null;
	["cold", "warm", "repeat"].forEach(function (phase) {
		__checkBudget.start();
		var encoded;
		try { encoded = String(engine.flowCodeCheck(request)); }
		finally { var counts = __checkBudget.active; __checkBudget.active = null; }
		var report = JSON.parse(encoded);
		assertTrue(report.ok && report.diagnostics.length === 0, "Public check failed: " + encoded);
		assertTrue(expected === null || encoded === expected, "Warm check changed the report");
		expected = encoded;
		budget("public-" + phase, counts);
	});
	var caller = "version: 1\nnodes:\n  - id: check\n    block: flow.code.check\n    props:\n      name: Reference\n      draft: false\n    out: result.report\n";
	["first", "warm", "repeat"].forEach(function (phase) {
		__checkBudget.capabilityRuns = [];
		var execution = JSON.parse(engine.run(JSON.stringify({ flowSource: caller, includeTrace: false })));
		assertTrue(execution.ok && execution.result.report.ok, "Nested MCP capability failed: " + JSON.stringify(execution));
		assertTrue(__checkBudget.capabilityRuns.length === 1, "Nested capability was not observed exactly once");
		budget("mcp-capability-" + phase, __checkBudget.capabilityRuns[0]);
	});
	print("code-check-performance-budget: " + checks + " checks passed");
} finally {
	files.deleteDirectory(workspace);
}
