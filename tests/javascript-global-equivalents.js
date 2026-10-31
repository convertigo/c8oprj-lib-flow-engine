// JavaScript globals an author writes first (Object.assign, parseInt, JSON.stringify) were refused as block calls with a
// hint to call them with one object parameter (Use Object.assign({  })), never naming what FlowScript gives instead.
// The refusal now names the supported equivalent.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-js-globals").toFile().getAbsolutePath());
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;

function assertTrue(condition, message) {
	checks++;
	if (!condition) {
		throw new Error(message);
	}
}

function refusal(line) {
	var response = JSON.parse(engine.run(JSON.stringify({
		flowSource: "function T({ input, result }) {\n  " + line + "\n}", input: { offset: "3" }, includeTrace: false })));
	assertTrue(response.ok === false, "JavaScript global accepted: " + line);
	return response.error;
}

[
	["local.x = Object.assign({}, input)", "object.merge"],
	["local.n = parseInt(input.offset, 10)", "integer"],
	["result.y = JSON.stringify(input)", "json.stringify"],
	["result.k = Object.keys(input)", "object.keys"]
].forEach(function (entry) {
	var error = refusal(entry[0]);
	var hint = String(error.hint || "");
	assertTrue(hint.indexOf(entry[1]) !== -1 && hint.indexOf("is JavaScript, not a Flow block") !== -1,
		"the refusal of " + entry[0] + " did not name " + entry[1] + ": " + JSON.stringify(error));
	assertTrue(hint.indexOf("Use " + entry[0].split("(")[0].split("= ")[1] + "({") === -1,
		"the refusal still asks to call the JavaScript global with one object: " + hint);
});
// The check code-set runs (flowSourceValidate) names the equivalent too.
function validate(line) {
	return JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "T",
		code: "const _flow = {sourceVersion:2}\nfunction T({ input, result }) {\n  " + line + "\n}" })));
}
var checked = JSON.stringify(validate("local.x = Object.assign({}, input)"));
assertTrue(checked.indexOf("object.merge") !== -1 && checked.indexOf("is JavaScript, not a Flow block") !== -1,
	"the code check of Object.assign did not name object.merge: " + checked.substring(0, 1500));
print("javascript-global-equivalents: " + checks + " checks");
