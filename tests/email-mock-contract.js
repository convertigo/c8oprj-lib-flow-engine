// email.mock takes the properties of email.send and gives its result, so that a Flow switches from one to the other by
// the block name: { ok, messageId, recipients } typed (no longer an unknown output), with mock: true and the message;
// the message is checked as email.send checks it (a recipient, a body, valid addresses), without a server. body, its
// former name of the text, still works.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-email-mock").toFile().getAbsolutePath());
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }

var send = api("blockGet", { name: "email.send" }).block;
var mock = api("blockGet", { name: "email.mock" }).block;
Object.keys(send.properties).forEach(function (name) {
	var expected = send.properties[name], actual = mock.properties[name];
	assert(actual && actual.kind === expected.kind && actual.type === expected.type, "email.mock takes " + name + " as email.send does: " + JSON.stringify(actual));
});
var sendOut = send.outputs.out.paths, mockOut = mock.outputs.out.paths;
assert(sendOut.every(function (path) { return mockOut.indexOf(path) !== -1; }) && mockOut.indexOf("mock") !== -1 && mockOut.indexOf("text") !== -1,
	"its result has the paths of the result of email.send: " + JSON.stringify(mockOut));

function flow(block, extra) {
	return "const _flow = { sourceVersion: 2 }\nfunction Notify({ input, config, result }) {\n" +
		"  local.mail = " + block + "({to: \"ops@example.com, Ana <ana@example.com>\", cc: \"boss@example.com\", subject: \"Alert\", " +
		"text: \"Hot\", html: \"<b>Hot</b>\"" + (extra || "") + "})\n  result.id = local.mail.messageId\n  result.count = local.mail.recipients\n" +
		"  result.mail = local.mail\n}\n";
}
["email.mock", "email.send"].forEach(function (block) {
	var check = api("flowSourceValidate", { code: flow(block, ", host: \"smtp.example.com\", port: 2525"), name: "Notify" });
	assert(check.ok === true && !(check.diagnostics || []).some(function (item) { return item.severity === "error" || item.code === "UNKNOWN_BLOCK_PROPERTY"; }),
		"the same call checks with " + block + ": " + JSON.stringify(check.diagnostics));
	var schema = check.analysis && check.analysis.schemas && check.analysis.schemas["local.mail"];
	assert(schema && schema.type === "object" && schema.properties && schema.properties.messageId && schema.properties.recipients,
		"and gives the typed result of " + block + ": " + JSON.stringify(schema));
});

var run = api("run", { flowSource: flow("email.mock"), includeTrace: false });
var mail = run.result && run.result.mail || {};
assert(run.ok === true && /^<[0-9a-f-]{36}@email\.mock>$/.test(run.result.id) && run.result.count === 3 && mail.ok === true && mail.mock === true &&
	mail.to === "ops@example.com, Ana <ana@example.com>" && mail.cc === "boss@example.com" && mail.subject === "Alert" && mail.text === "Hot" &&
	mail.html === "<b>Hot</b>", "email.mock gives the result of email.send and the message: " + JSON.stringify(run));

function refused(props) {
	var out = api("run", { flowSource: "const _flow = { sourceVersion: 2 }\nfunction Notify({ input, config, result }) {\n  local.mail = email.mock({" + props + "})\n}\n", includeTrace: false });
	return out.ok === false ? out.error : null;
}
assert((refused("to: \"not an address\", text: \"x\"") || {}).code === "EMAIL_ADDRESS_INVALID", "an invalid address is refused as email.send refuses it");
assert((refused("to: \"\", text: \"x\"") || {}).code === "EMAIL_ADDRESS_INVALID", "an empty recipient too");
var noBody = refused("to: \"ops@example.com\", subject: \"x\"");
assert(noBody && noBody.code === "EMAIL_CONFIGURATION_INVALID" && noBody.status === 400, "and a message without body: " + JSON.stringify(noBody));

var legacy = api("run", { definition: { flow: { sourceVersion: 2 }, nodes: [{ block: "email.mock", props: { to: "ops@example.com", subject: "Weather alert", body: "Hot cities" }, out: "result.notification" }] }, includeTrace: false });
var notification = legacy.result && legacy.result.notification || {};
assert(legacy.ok === true && notification.text === "Hot cities" && notification.body === "Hot cities" && notification.sent === true &&
	notification.to === "ops@example.com" && notification.subject === "Weather alert", "body, the former name of the text, still works: " + JSON.stringify(legacy));
print("email-mock-contract OK (" + checks + " checks)");
