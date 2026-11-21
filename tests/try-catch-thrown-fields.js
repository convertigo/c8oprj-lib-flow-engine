// throw { code: "X", message: "m", field: "amount" } then catch (e) { … e.field … }: the catch kept code, message,
// status, hint and details only, and e.field was undefined (bench L8). The other fields of the thrown object stay on the
// caught error, as in JavaScript, in FlowScript v3 and v2, through flow.call, and when the caught error is thrown again;
// an uncaught throw answers them at the top of its error envelope, which is what an HTTP client receives.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath()), files = Packages.org.apache.commons.io.FileUtils;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-try-thrown-fields-").toFile().getAbsolutePath());
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(relative, text) {
	var file = new java.io.File(__flowProjectDir, relative);
	file.getParentFile().mkdirs();
	files.writeStringToFile(file, text, "UTF-8");
}
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function run(name, source, input) {
	return JSON.parse(String(engine.flowCodeRun(JSON.stringify({ name: name, code: source, input: input || {}, includeTrace: false }))));
}
function v3(name, body) {
	return "const _flow = { sourceVersion: 3, inputs: { amount: { type: \"number\" } } }\nfunction " + name + "({ input, config, result }) {\n" + body + "\n}\n";
}
var thrower = "  throw { code: \"AMOUNT_INVALID\", message: \"Amount too high\", field: \"amount\", limits: { max: 3 }, details: { got: input.amount } }";

// 1. FlowScript v3: the catch reads the fields of the thrown object
var caught = run("Caught", v3("Caught", "  try {\n" + thrower + "\n  } catch (e) {\n" +
	"    return { code: e.code, message: e.message, field: e.field, max: e.limits.max, got: e.details.got }\n  }"), { amount: 7 });
assert(caught.ok === true, "the v3 Flow runs: " + JSON.stringify(caught).substring(0, 800));
assert(JSON.stringify(caught.result) === JSON.stringify({ code: "AMOUNT_INVALID", message: "Amount too high", field: "amount", max: 3, got: 7 }),
	"the catch reads every field of the thrown object, as JavaScript does: " + JSON.stringify(caught.result));

// 2. FlowScript v2, the try block with its error path
var v2 = run("CaughtV2", "const _flow = { sourceVersion: 2 }\nfunction CaughtV2({ input, config, result }) {\n" +
	"  try({ error: \"local.failure\", $$try() {\n    throw({ code: \"A\", message: \"m\", field: \"name\", line: 3 })\n  }, $$catch() {\n" +
	"    result.field = local.failure.field\n    result.line = local.failure.line\n  } })\n}\n");
assert(v2.ok === true && v2.result.field === "name" && v2.result.line === 3, "the v2 error path holds the fields: " + JSON.stringify(v2).substring(0, 800));

// 3. Through flow.call: the error of the called Flow keeps its fields
write("_flow/flows/Check.flow.js", v3("Check", "  if (input.amount > 3) {\n" + thrower + "\n  }\n  return { ok: true }"));
var called = run("Caller", v3("Caller", "  try {\n    const checked = flow.call({ flow: \"Check\", input: { amount: input.amount } })\n" +
	"    return { checked }\n  } catch (e) {\n    return { code: e.code, field: e.field }\n  }"), { amount: 9 });
assert(called.ok === true && called.result.code === "AMOUNT_INVALID" && called.result.field === "amount",
	"a catch around flow.call reads the fields of the called Flow's error: " + JSON.stringify(called).substring(0, 800));

// 4. Uncaught, and thrown again by the catch: the fields are at the top of the error envelope a client receives
var uncaught = run("Uncaught", v3("Uncaught", thrower), { amount: 5 });
assert(uncaught.ok === false && uncaught.error.code === "AMOUNT_INVALID" && uncaught.error.field === "amount" &&
	uncaught.error.limits.max === 3 && uncaught.error.details.got === 5, "an uncaught throw answers its fields: " + JSON.stringify(uncaught.error));
var rethrown = run("Rethrown", v3("Rethrown", "  try {\n" + thrower + "\n  } catch (e) {\n    throw e\n  }"), { amount: 6 });
assert(rethrown.ok === false && rethrown.error.field === "amount" && rethrown.error.limits.max === 3,
	"the caught error thrown again keeps its fields: " + JSON.stringify(rethrown.error));
print("try-catch-thrown-fields OK (" + checks + " checks)");
