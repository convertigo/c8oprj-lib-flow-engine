// tools/declare-flow-accessibility.sh: the dry run lists each Flow with what declares its accessibility (the _flow header,
// the YAML or nothing), raises FLOW_ACCESSIBILITY_UNDECLARED for each Flow that declares nothing and exits with 1;
// --write declares these Flows only, public, in the style of their header (v2 and v3 on one line, v3 on several lines,
// sourceVersion as the last key, quoted keys), with the same definition but for _flow.accessibility, read back Public by
// the engine, and the same run; every other file stays the same byte for byte; a second dry run exits with 0, a second
// write changes nothing. The word accessibility elsewhere in a header (a comment, a description, an input of that name)
// declares nothing and does not mislead the write. A Flow whose source is missing or unreadable is reported, never
// written.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var Files = java.nio.file.Files;
function check(ok, message) { if (!ok) throw new Error(message); }
var tool = new java.io.File(engineDir, "../tools/declare-flow-accessibility.sh").getCanonicalPath();

function project(entries) {
	var dir = Files.createTempDirectory("flow-accessibility-").toFile();
	Object.keys(entries).forEach(function (path) { files.writeStringToFile(new java.io.File(dir, path), entries[path], "UTF-8"); });
	return dir;
}
function read(dir, path) { return String(files.readFileToString(new java.io.File(dir, path), "UTF-8")); }
// Every file of the project, as base64 of its bytes.
function snapshot(dir) {
	var out = {}, found = files.listFiles(dir, null, true).toArray();
	for (var i = 0; i < found.length; i++) {
		out[String(dir.toPath().relativize(found[i].toPath()))] = String(java.util.Base64.getEncoder().encodeToString(Files.readAllBytes(found[i].toPath())));
	}
	return out;
}
function declare(dir, write) {
	var command = new java.util.ArrayList();
	["bash", tool, String(dir.getAbsolutePath())].concat(write ? ["--write"] : []).forEach(function (part) { command.add(new java.lang.String(String(part))); });
	var builder = new java.lang.ProcessBuilder(command).redirectErrorStream(true);
	builder.environment().put("CONVERTIGO_TEST_CLASSPATH", String(java.lang.System.getProperty("java.class.path")));
	var process = builder.start();
	var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), "UTF-8"));
	var output = "", line;
	while ((line = reader.readLine()) !== null) output += String(line) + "\n";
	var exit = process.waitFor(), start = output.indexOf("{\n");
	check(start >= 0, "accessibility tool (exit " + exit + "): " + output);
	return { exit: exit, report: JSON.parse(output.substring(start)) };
}
function names(list) { return list.map(function (entry) { return entry.flow; }).sort().join(","); }

// name: [source, its first lines, those lines once written] (a declared Flow: [source]).
var flows = {
	// v2, header on one line
	V2Plain: ['const _flow = { sourceVersion: 2, inputs: { city: { type: "string", default: "Paris" } } }\n\n' +
		'function V2Plain({ input, config, result }) {\n  result.city = input.city\n}\n',
		'const _flow = { sourceVersion: 2, inputs: { city: { type: "string", default: "Paris" } } }\n',
		'const _flow = { sourceVersion: 2, accessibility: "public", inputs: { city: { type: "string", default: "Paris" } } }\n'],
	// v2 as the engine wrote it before (no space after the colons)
	V2Compact: ['const _flow = { sourceVersion:2, inputs:{x:{type:"string",default:"a"}} }\nfunction V2Compact({input,result}) {\n result.x = input.x\n}\n',
		'const _flow = { sourceVersion:2, inputs:{x:{type:"string",default:"a"}} }\n',
		'const _flow = { sourceVersion:2, accessibility:"public", inputs:{x:{type:"string",default:"a"}} }\n'],
	// v2 on several lines, quoted keys, no sourceVersion (the shape of the sample projects)
	V2Quoted: ['// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.\n\nconst _flow = {\n' +
		'  "inputs": {\n    "owner": {\n      "type": "string",\n      "default": "convertigo",\n    },\n  },\n}\n\n' +
		'function V2Quoted({ input, config, result }) {\n  result.owner = input.owner\n}\n',
		'// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.\n\nconst _flow = {\n  "inputs": {\n',
		'// c8o: FlowScript spike. Function calls are Flow blocks; named arguments are block properties.\n\nconst _flow = {\n  "accessibility": "public",\n  "inputs": {\n'],
	// v3, header on several lines
	V3Multi: ['const _flow = {\n  sourceVersion: 3,\n  description: "Keeps the hot cities.",\n  inputs: { min: { type: "number", default: 30 } },\n}\n\n' +
		'function V3Multi({ input, config, result }) {\n  local.cities = [{ city: "Lyon", temperature: 31 }, { city: "Paris", temperature: 38 }]\n' +
		'  result.hot = local.cities.filter(item => item.temperature >= input.min).map(item => item.city)\n}\n',
		'const _flow = {\n  sourceVersion: 3,\n  description: "Keeps the hot cities.",\n',
		'const _flow = {\n  sourceVersion: 3,\n  accessibility: "public",\n  description: "Keeps the hot cities.",\n'],
	// v3, header on several lines, sourceVersion its last property, without a comma: it gets one
	V3LastKey: ['const _flow = {\n  sourceVersion: 3\n}\n\nfunction V3LastKey({ input, config, result }) {\n  result.ok = true\n}\n',
		'const _flow = {\n  sourceVersion: 3\n}\n', 'const _flow = {\n  sourceVersion: 3,\n  accessibility: "public"\n}\n'],
	// v3, header on one line
	V3Line: ['const _flow = { sourceVersion: 3 }\n\nfunction V3Line({ input, config, result }) {\n  result.ok = true\n}\n',
		'const _flow = { sourceVersion: 3 }\n', 'const _flow = { sourceVersion: 3, accessibility: "public" }\n'],
	// the trap: accessibility in a comment, a description and as the name of an input, never as a key of _flow
	Decoy: ['// accessibility: "private" in this comment declares nothing.\n' +
		'const _flow = { description: "Its accessibility: \\"hidden\\" is only text.", inputs: { accessibility: { type: "string", description: "accessibility: public, as an input", default: "x" } } }\n\n' +
		'function Decoy({ input, config, result }) {\n  result.mode = input.accessibility\n}\n',
		'// accessibility: "private" in this comment declares nothing.\n' +
		'const _flow = { description: "Its accessibility: \\"hidden\\" is only text.", inputs: { accessibility: { type: "string", description: "accessibility: public, as an input", default: "x" } } }\n',
		'// accessibility: "private" in this comment declares nothing.\n' +
		'const _flow = { accessibility: "public", description: "Its accessibility: \\"hidden\\" is only text.", inputs: { accessibility: { type: "string", description: "accessibility: public, as an input", default: "x" } } }\n'],
	// declared: in the header, in the YAML only, in the header with a quoted key
	HeaderPrivate: ['const _flow = { sourceVersion: 2, accessibility: "private" }\n\nfunction HeaderPrivate({ input, config, result }) {\n  result.ok = true\n}\n'],
	YamlHidden: ['const _flow = { sourceVersion: 3 }\n\nfunction YamlHidden({ input, config, result }) {\n  result.ok = true\n}\n'],
	HeaderQuoted: ['const _flow = {\n  "accessibility": "hidden",\n  "sourceVersion": 2,\n}\n\nfunction HeaderQuoted({ input, config, result }) {\n  result.ok = true\n}\n']
};
var undeclared = ["Decoy", "V2Compact", "V2Plain", "V2Quoted", "V3LastKey", "V3Line", "V3Multi"];
var entries = {
	"c8oProject.yaml": "\u2193fixture_accessibility [core.Project]:\n" +
		"  \u2193V2Plain [flow.Flow]: sequences/V2Plain.yaml\n" +
		"  \u2193V2Compact [flow.Flow]:\n    comment: An inline entry.\n" +
		"  \u2193V2Quoted [flow.Flow]: \uD83D\uDDCF sequences/V2Quoted.yaml\n" +
		"  \u2193V3Multi [flow.Flow]: sequences/V3Multi.yaml\n" +
		"  \u2193V3Line [flow.Flow]: sequences/V3Line.yaml\n" +
		"  \u2193V3LastKey [flow.Flow]:\n" +
		"  \u2193Decoy [flow.Flow]:\n    comment: 'accessibility: Public is written in this comment only.'\n" +
		"  \u2193HeaderPrivate [flow.Flow]: sequences/HeaderPrivate.yaml\n" +
		"  \u2193YamlHidden [flow.Flow]:\n    accessibility: Hidden\n" +
		"  \u2193HeaderQuoted [flow.Flow]: \uD83D\uDDCF sequences/HeaderQuoted.yaml\n",
	"_c8oProject/sequences/V2Plain.yaml": "{}",
	"_c8oProject/sequences/V2Quoted.yaml": "comment: The shape of the sample projects.\n",
	"_c8oProject/sequences/V3Multi.yaml": "{}",
	"_c8oProject/sequences/V3Line.yaml": "{}",
	"_c8oProject/sequences/HeaderPrivate.yaml": "{}",
	"_c8oProject/sequences/HeaderQuoted.yaml": "{}",
	// a source without [flow.Flow] entry is not a Flow of the project
	"_flow/flows/Orphan.flow.js": 'const _flow = { sourceVersion: 2 }\n\nfunction Orphan({ input, config, result }) {\n  result.ok = true\n}\n'
};
Object.keys(flows).forEach(function (name) { entries["_flow/flows/" + name + ".flow.js"] = flows[name][0]; });
var dir = project(entries), before = snapshot(dir);

// 1. The dry run: each Flow with its declaration, FLOW_ACCESSIBILITY_UNDECLARED for exactly the Flows without one, exit 1.
var dry = declare(dir, false), report = dry.report;
check(dry.exit === 1, "the dry run exits with 1 when a Flow declares nothing: " + dry.exit);
check(report.mode === "dry-run" && !report.written && report.project === "fixture_accessibility" && report.flows.total === 10 && !report.flows.errors.length,
	"dry run report: " + JSON.stringify(report));
check(names(report.flows.undeclared) === undeclared.join(","), "undeclared Flows: " + names(report.flows.undeclared));
report.flows.undeclared.forEach(function (entry) {
	check(entry.code === "FLOW_ACCESSIBILITY_UNDECLARED" && entry.guard === "ok" && !entry.written, "undeclared entry: " + JSON.stringify(entry));
});
// declaredBy|header|yaml|accessibility on develop|sourceVersion, by Flow
function declarations(report) {
	var out = {};
	report.flows.list.forEach(function (row) { out[row.flow] = [row.declaredBy, row.header, row.yaml, row.accessibility, row.sourceVersion].join("|"); });
	return out;
}
var found = declarations(report);
check(found.HeaderPrivate === "header|Private||Private|2" && found.YamlHidden === "yaml||Hidden|Hidden|3" && found.HeaderQuoted === "header|Hidden||Hidden|2"
	&& found.Decoy === "none|||Private|2" && found.V3Multi === "none|||Private|3" && found.V3Line === "none|||Private|3", "declarations: " + JSON.stringify(found));
report.flows.undeclared.forEach(function (entry) {
	var lines = flows[entry.flow][2].split("\n");
	check(entry.change.after.length && entry.change.after.every(function (line, index) { return lines[entry.change.line - 1 + index] === line; }),
		entry.flow + ": the change the dry run announces: " + JSON.stringify(entry.change));
});
check(report.sourcesWithoutFlow.join(",") === "_flow/flows/Orphan.flow.js", "sources without a Flow: " + report.sourcesWithoutFlow);
check(JSON.stringify(snapshot(dir)) === JSON.stringify(before), "a dry run writes nothing");

// 2. The write: those Flows only, in the style of their header, nothing else.
var written = declare(dir, true);
check(written.exit === 0 && written.report.written && written.report.flows.undeclared.filter(function (entry) { return entry.written; }).length === undeclared.length,
	"write report: " + JSON.stringify(written.report.flows.undeclared));
var after = snapshot(dir);
Object.keys(before).forEach(function (path) {
	var name = /^_flow\/flows\/(\w+)\.flow\.js$/.exec(path.replace(/\\/g, "/"));
	if (name && undeclared.indexOf(name[1]) >= 0) {
		var flow = flows[name[1]], text = read(dir, path);
		check(flow[0].indexOf(flow[1]) === 0 && text === flow[2] + flow[0].substring(flow[1].length), name[1] + " is written in the style of its header, nothing else:\n" + text);
	} else {
		check(after[path] === before[path], path + " stays the same byte for byte");
	}
});
check(Object.keys(after).length === Object.keys(before).length, "no file is added");

// 3. The engine reads Public from each written header, the same definition but for _flow.accessibility, the same run.
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(dir.getAbsolutePath());
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
undeclared.forEach(function (name) {
	var old = flows[name][0], text = read(dir, "_flow/flows/" + name + ".flow.js");
	var oldHeader = api("syncInputs", { name: name, flowName: name, flowSource: old, metadataOnly: true });
	var newHeader = api("syncInputs", { name: name, flowName: name, flowSource: text, metadataOnly: true });
	check(oldHeader.ok && oldHeader.accessibility === undefined && newHeader.ok && newHeader.accessibility === "Public",
		name + ": the engine reads " + oldHeader.accessibility + " then " + newHeader.accessibility);
	var oldDefinition = api("flowSourceValidate", { name: name, code: old, skipAnalysis: true }).definition;
	var newDefinition = api("flowSourceValidate", { name: name, code: text, skipAnalysis: true }).definition;
	check(oldDefinition && newDefinition && !oldDefinition.flow.accessibility && newDefinition.flow.accessibility === "public", name + ": definitions " + JSON.stringify(newDefinition));
	delete newDefinition.flow.accessibility;
	check(codeService.comparableDefinition(oldDefinition) === codeService.comparableDefinition(newDefinition), name + ": the definition changes but for _flow.accessibility");
	var oldRun = api("run", { flowSource: old, flowName: name, input: {}, includeTrace: false });
	var newRun = api("run", { flowSource: text, flowName: name, input: {}, includeTrace: false });
	check(oldRun.ok && JSON.stringify(oldRun.result) === JSON.stringify(newRun.result) && newRun.ok, name + ": the run changes: " + JSON.stringify(oldRun) + " " + JSON.stringify(newRun));
});

// 4. A second dry run exits with 0, a second write changes nothing.
var again = declare(dir, false);
check(again.exit === 0 && !again.report.flows.undeclared.length && !again.report.flows.errors.length, "second dry run: " + JSON.stringify(again.report));
found = declarations(again.report);
check(undeclared.every(function (name) { return found[name] === "header|Public||Public|" + (/^V3/.test(name) ? 3 : 2); }) && found.YamlHidden === "yaml||Hidden|Hidden|3"
	&& found.HeaderPrivate === "header|Private||Private|2", "second dry run declarations: " + JSON.stringify(found));
var rewritten = declare(dir, true);
check(rewritten.exit === 0 && !rewritten.report.written && JSON.stringify(snapshot(dir)) === JSON.stringify(after), "a second write changes nothing");

// 5. A missing or unreadable source is reported, never written.
var broken = project({
	"c8oProject.yaml": "\u2193fixture_unreadable [core.Project]:\n  \u2193Missing [flow.Flow]: sequences/Missing.yaml\n  \u2193BrokenBody [flow.Flow]:\n" +
		"  \u2193BrokenHeader [flow.Flow]:\n  \u2193InvalidValue [flow.Flow]:\n",
	"_c8oProject/sequences/Missing.yaml": "accessibility: Hidden\n",
	"_flow/flows/BrokenBody.flow.js": 'const _flow = { sourceVersion: 2 }\n\nfunction BrokenBody({ input, config, result }) {\n  local.x = (\n}\n',
	"_flow/flows/BrokenHeader.flow.js": 'const _flow = { sourceVersion: 2, inputs: { x: } }\n\nfunction BrokenHeader({ input, config, result }) {\n  result.ok = true\n}\n',
	"_flow/flows/InvalidValue.flow.js": 'const _flow = { sourceVersion: 2, accessibility: "protected" }\n\nfunction InvalidValue({ input, config, result }) {\n  result.ok = true\n}\n'
});
var brokenBefore = snapshot(broken);
[false, true].forEach(function (write) {
	var out = declare(broken, write), errors = {};
	out.report.flows.errors.forEach(function (error) { errors[error.flow] = error.code; });
	check(out.exit === 1 && !out.report.written && errors.Missing === "FLOW_SOURCE_MISSING" && errors.BrokenHeader === "FLOW_SOURCE_UNREADABLE"
		&& errors.InvalidValue === "FLOW_ACCESSIBILITY_INVALID" && names(out.report.flows.undeclared) === "BrokenBody"
		&& /^the engine cannot read the source: .*nothing is written$/.test(out.report.flows.undeclared[0].guard),
		(write ? "write" : "dry run") + " of unreadable sources: " + JSON.stringify(out.report));
	check(JSON.stringify(snapshot(broken)) === JSON.stringify(brokenBefore), "unreadable sources are not written");
});
files.deleteDirectory(dir);
files.deleteDirectory(broken);
print("flow-accessibility-declare: OK");
