// try runs its blocks; the first error goes to the error path and catch runs instead of failing the Flow.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-try").toFile().getAbsolutePath());
var engine = eval(source);
var body = [
	'  try({',
	'    $$id: "attempt",',
	'    error: "local.failure",',
	'    $$try: function () {',
	'      local.before = "ran"',
	'      throw({ code: "SMTP_DOWN", message: "The SMTP host is required", status: 503 })',
	'      local.after = "never"',
	'    },',
	'    $$catch: function () {',
	'      local.caught = local.failure.code',
	'    },',
	'  })',
	'  return { before: local.before, after: local.after, caught: local.caught, failure: local.failure }'
].join("\n");
var src = "const _flow = { sourceVersion: 2 }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
var v = JSON.parse(engine.flowSourceValidate(JSON.stringify({ name: "Probe", code: src })));
if (v.ok !== true) throw new Error("try validates: " + JSON.stringify(v).substring(0, 300));
if (v.code.indexOf("$$catch: function () {") === -1) throw new Error("try is rendered back with its slots");
var out = JSON.parse(engine.run(JSON.stringify({ flowSource: src, input: {}, includeTrace: false })));
if (out.ok !== true || JSON.stringify(out.result) !== JSON.stringify({ before: "ran", caught: "SMTP_DOWN",
		failure: { code: "SMTP_DOWN", message: "The SMTP host is required", status: 503, hint: "" } })) {
	throw new Error("try catches the error: " + JSON.stringify(out).substring(0, 500));
}
var clean = JSON.parse(engine.run(JSON.stringify({ flowSource: src.replace(/      throw\(.*\n/, ""), input: {}, includeTrace: false })));
if (clean.ok !== true || clean.result.after !== "never" || clean.result.caught !== undefined) {
	throw new Error("without error catch does not run: " + JSON.stringify(clean).substring(0, 400));
}
print("try block: ok");
