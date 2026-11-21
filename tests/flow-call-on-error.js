// flow.call had no onError: to read the error of a called Flow as a value, an agent went through requestable.call
// (bench L4). flow.call takes onError as requestable.call does: raise (the default) makes the call fail with the error of
// the called Flow, which a try catches with its fields; return gives { error: { code, message, status, path, hint,
// details, … } }, the error without its operation, as requestable.call gives it. A cancelled run and an unknown Flow name
// are still raised. Names are fixtures.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath()), files = Packages.org.apache.commons.io.FileUtils;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-call-on-error-").toFile().getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	files.writeStringToFile(file, text, "UTF-8");
}
function v3(name, body) {
	return "const _flow = { sourceVersion: 3, inputs: { amount: { type: \"number\" } } }\nfunction " + name + "({ input, config, result }) {\n" + body + "\n}\n";
}
write("_flow/flows/Check.flow.js", v3("Check", "  if (input.amount > 3) {\n" +
	"    throw { code: \"AMOUNT_INVALID\", message: \"Amount too high\", status: 422, field: \"amount\", details: { max: 3 } }\n  }\n" +
	"  if (input.amount < 0) {\n    const parsed = JSON.parse(\"{\")\n    return { parsed }\n  }\n  return { ok: true, amount: input.amount }"));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function run(name, body, input) {
	return JSON.parse(String(engine.flowCodeRun(JSON.stringify({ name: name, code: v3(name, body), input: input || {}, includeTrace: false }))));
}
var returning = "  const checked = flow.call({ flow: \"Check\", input: { amount: input.amount }, onError: \"return\" })\n" +
	"  if (checked.error) {\n    return { failed: checked.error }\n  }\n  return { checked }";

// 1. onError return: the error of the called Flow is the value, with its fields, without its operation
var failed = run("Returning", returning, { amount: 9 });
assert(failed.ok === true, "the caller goes on: " + JSON.stringify(failed).substring(0, 800));
var error = failed.result.failed;
assert(error.code === "AMOUNT_INVALID" && error.message === "Amount too high" && error.status === 422 && error.field === "amount" &&
	error.details.max === 3 && typeof error.path === "string" && error.path !== "" && error.operation === undefined,
	"the error envelope of the called Flow is returned: " + JSON.stringify(error));
// an internal failure of the called Flow is returned too
var broken = run("Returning", returning, { amount: -1 });
assert(broken.ok === true && broken.result.failed && broken.result.failed.code && broken.result.failed.code !== "AMOUNT_INVALID",
	"a failed block of the called Flow is returned: " + JSON.stringify(broken).substring(0, 800));
// a success is the result as it is
var passed = run("Returning", returning, { amount: 2 });
assert(passed.ok === true && JSON.stringify(passed.result) === JSON.stringify({ checked: { ok: true, amount: 2 } }),
	"a success is the result of the called Flow: " + JSON.stringify(passed.result));

// 2. raise, the default: the caller fails with the error, which a try catches with its fields
var raised = run("Raising", "  const checked = flow.call({ flow: \"Check\", input: { amount: input.amount } })\n  return { checked }", { amount: 9 });
assert(raised.ok === false && raised.error.code === "AMOUNT_INVALID" && raised.error.field === "amount", "the default raises: " + JSON.stringify(raised.error));
var caught = run("Catching", "  try {\n    const checked = flow.call({ flow: \"Check\", input: { amount: input.amount } })\n    return { checked }\n" +
	"  } catch (e) {\n    return { code: e.code, status: e.status, field: e.field, max: e.details.max }\n  }", { amount: 9 });
assert(caught.ok === true && JSON.stringify(caught.result) === JSON.stringify({ code: "AMOUNT_INVALID", status: 422, field: "amount", max: 3 }),
	"try catches the error of the called Flow: " + JSON.stringify(caught).substring(0, 800));

// 3. An unknown Flow name is an error of the call itself: raised even with onError return
var unknown = run("Unknown", "  const checked = flow.call({ flow: \"Missing\", input: {}, onError: \"return\" })\n  return { checked }");
assert(unknown.ok === false && unknown.error.code === "UNKNOWN_FLOW", "an unknown Flow is raised: " + JSON.stringify(unknown).substring(0, 600));

// 4. The contract says both forms
var contract = String(files.readFileToString(new java.io.File(engineDir, "blocks/flow/call.block.js"), "UTF-8"));
assert(/"onError"/.test(contract) && /catch \(e\)/.test(contract) && /e\.field/.test(contract), "the flow.call contract gives onError and the try form");
print("flow-call-on-error OK (" + checks + " checks)");
