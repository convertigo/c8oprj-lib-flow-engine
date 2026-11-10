// entity.save({ ..., onError: "return" }) called in the $$catch of a try passed code-set and code-check, then threw its
// ENTITY_VALIDATION at run: the check walked only nodes/then/else/fields, never the try and catch slots, so the
// unknown property onError (entity.save declares none) was neither reported nor used. At the top of the Flow the same
// call is refused. The check walks every slot: the call is refused wherever it stands, with the try form to use.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-try-slot-validation-").toFile().getCanonicalFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
try {
	// A project block without onError, failing as a refused entry does (the role entity.save plays in the report).
	write(new java.io.File(project, "_flow/blocks/proof/save.block.js"),
		'const _meta = { runtime: "rhino", description: "Saves a value.", properties: { value: { kind: "value", type: "string" } }, outputs: { out: { type: "object" } } }\n' +
		'(function () { return { run: function (ctx, node) { var v = String(ctx.template(ctx.props(node).value)); ' +
		'if (v.length > 3) ctx.throwFlow({ code: "PROOF_VALIDATION", message: "Too long.", status: 422 }, node); return { saved: v }; } }; }())');
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function code(body) { return 'const _flow = { sourceVersion: 2, accessibility: "public" }\nfunction Probe({ input, config, result }) {\n' + body + '\n}\n'; }
	function check(body) { return JSON.parse(engine.flowCodeCheck(JSON.stringify({ name: "Probe", code: code(body) }))); }
	function run(body) { return JSON.parse(engine.run(JSON.stringify({ flowSource: code(body), input: {}, includeTrace: false }))); }
	function diagnostics(out) { return out.diagnostics || (out.error && out.error.details && out.error.details.diagnostics) || []; }
	function refusesOnError(out, label) {
		var found = diagnostics(out).filter(function (d) { return d.code === "UNKNOWN_BLOCK_PROPERTY" && d.property === "onError" && d.block === "proof.save"; });
		assert(out.ok === false && found.length === 1, label + ": onError must be refused: " + JSON.stringify(out).substring(0, 900));
		assert(/proof\.save has no onError/.test(found[0].hint) && /try\(\{ error: "local\.failure"/.test(found[0].hint) && /local\.failure\.code/.test(found[0].hint),
			label + ": the hint gives the try form: " + found[0].hint);
	}
	var call = 'proof.save({ value: "too long", onError: "return" })';
	var top = '  local.saved = ' + call + '\n  result.saved = local.saved';
	var inTry = '  try({\n    error: "local.failure",\n    $$try() {\n      local.saved = ' + call + '\n    },\n    $$catch() {\n      result.code = local.failure.code\n    },\n  })';
	var inCatch = '  try({\n    error: "local.failure",\n    $$try() {\n      throw { code: "FIRST", message: "First failure." }\n    },\n    $$catch() {\n      local.saved = ' + call + '\n      result.saved = local.saved\n    },\n  })';
	refusesOnError(check(top), "top of the Flow");
	refusesOnError(check(inTry), "in $$try");
	refusesOnError(check(inCatch), "in $$catch");
	// The friction itself: at run the call in $$catch threw its own error, onError ignored. It is now refused before running.
	var ran = run(inCatch);
	assert(ran.ok === false && ran.error && ran.error.code !== "PROOF_VALIDATION" &&
		JSON.stringify(ran.error).indexOf("onError") >= 0, "the Flow with onError in $$catch must not run: " + JSON.stringify(ran).substring(0, 600));
	// The form the hint gives: try catches the failure and the Flow answers with its code.
	var handled = '  try({\n    error: "local.failure",\n    $$try() {\n      local.saved = proof.save({ value: "too long" })\n    },\n    $$catch() {\n      result.code = local.failure.code\n    },\n  })';
	assert(check(handled).ok === true, "the try form passes the check: " + JSON.stringify(check(handled)).substring(0, 600));
	var answered = run(handled);
	assert(answered.ok !== false && JSON.stringify(answered).indexOf('"code":"PROOF_VALIDATION"') >= 0, "try returns the failure as data: " + JSON.stringify(answered).substring(0, 600));
	// An unknown block in a catch is reported as at the top.
	var unknownInCatch = check('  try({\n    error: "local.failure",\n    $$try() {\n      throw { code: "FIRST", message: "First." }\n    },\n    $$catch() {\n      proof.missing({ value: "x" })\n    },\n  })');
	assert(unknownInCatch.ok === false && diagnostics(unknownInCatch).some(function (d) { return d.code === "UNKNOWN_BLOCK"; }), "an unknown block in $$catch is reported: " + JSON.stringify(unknownInCatch).substring(0, 600));
	print("flowscript-try-slot-validation OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
