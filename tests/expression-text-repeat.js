// To test a limit of length (a field of 2000 characters at most), an agent typed the long value by hand in a tool input:
// a text of 2001 "x" written token by token, which twice ran until the timeout of the bench. text.repeat(value, count)
// builds it in an expression, with the meaning of String.prototype.repeat. A text an expression builds by repetition
// (text.repeat, .repeat, .padStart, .padEnd) or by multiplication (.replaceAll, .join of a list) is bounded: one
// million characters at most, the ceiling of a text.replace result, refused before it is built, never an exhausted heap.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-text-repeat").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
// the saved Flow under test, which refuses a bio over 2000 characters
files.writeStringToFile(new java.io.File(__flowProjectDir, "_flow/flows/ReaderSave.flow.js"), [
	"const _flow = { sourceVersion: 2, inputs: { bio: { type: \"string\" } } }",
	"function ReaderSave({ input, config, result }) {",
	"  if (length(input.bio) > 2000) {",
	"    throw { code: \"BIO_TOO_LONG\", message: \"The bio has more than 2000 characters.\", field: \"bio\" }",
	"  }",
	"  result.saved = length(input.bio)",
	"}",
	""
].join("\n"), "UTF-8");
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;

function assertTrue(condition, message) {
	checks++;
	if (!condition) {
		throw new Error(message);
	}
}

function api(method, request) {
	return JSON.parse(engine[method](JSON.stringify(request)));
}

function run(lines, input) {
	return JSON.parse(engine.run(JSON.stringify({ flowSource: lines.join("\n"), input: input || {}, includeTrace: false })));
}

function result(lines, input) {
	var response = run(lines, input);
	assertTrue(response.ok === true, "run failed: " + JSON.stringify(response).substring(0, 1200));
	return response.result;
}

function refused(lines, input, code, what) {
	var response = run(lines, input);
	assertTrue(response.ok === false && response.error && response.error.code === code, what + ": expected " + code + ", got " +
		JSON.stringify(response).substring(0, 800));
	return response.error;
}

// 1. The gesture of the bench (anonymized): one character over the limit of a field, built in a draft check
var longText = [
	"const _flow = { sourceVersion: 2, inputs: { limit: { type: \"number\" } } }",
	"",
	"function LongText({ input, result }) {",
	"  local.bio = text.repeat(\"x\", input.limit + 1)",
	"  if (text.repeat(\"-\", 3) == \"---\") {",
	"    result.length = local.bio.length",
	"    result.head = local.bio.slice(0, 3)",
	"  }",
	"}"
];
var written = api("flowCodeSet", { name: "LongText", code: longText.join("\n") });
assertTrue(written.ok === true, "code-set reads text.repeat as an expression: " + JSON.stringify(written.error || written).substring(0, 1200));
var stored = api("flowCodeGet", { name: "LongText" }).code;
assertTrue(stored.indexOf("text.repeat(\"x\", input.limit + 1)") !== -1 && stored.indexOf("text.replace") === -1,
	"the source keeps text.repeat, never resolved to the text.replace block: " + stored);
api("flowCodeDiscard", { name: "LongText" });
var built = result(longText, { limit: 2000 });
assertTrue(built.length === 2001 && built.head === "xxx", "2001 characters: " + JSON.stringify(built));
// the check the guide gives: a draft passes the built value to the Flow under test, at the limit and one over it
var check = result([
	"function LimitCheck({ result }) {",
	"  local.atLimit = flow.call({ flow: \"ReaderSave\", input: { bio: text.repeat(\"x\", 2000) } })",
	"  try({ error: \"local.failure\", $$try: function () {",
	"    local.over = flow.call({ flow: \"ReaderSave\", input: { bio: text.repeat(\"x\", 2001) } })",
	"  }, $$catch: function () {",
	"    result.overCode = local.failure.code",
	"  } })",
	"  result.saved = local.atLimit.saved",
	"}"
]);
assertTrue(check.saved === 2000 && check.overCode === "BIO_TOO_LONG",
	"2000 characters are saved, 2001 refused by the Flow under test: " + JSON.stringify(check));

// 2. The meaning of String.prototype.repeat: the count is a number, truncated; a text count converts; an absent value
// gives "" (as lower, trim); the method of a text gives the same
var meaning = result([
	"const _flow = { sourceVersion: 2, inputs: { n: { type: \"string\" } } }",
	"",
	"function Meaning({ input, result }) {",
	"  result.three = text.repeat(\"ab\", 3)",
	"  result.none = text.repeat(\"ab\", 0)",
	"  result.truncated = text.repeat(\"ab\", 2.9)",
	"  result.fromText = text.repeat(\"ab\", input.n)",
	"  result.absent = text.repeat(local.missing, 4)",
	"  result.number = text.repeat(7, 2)",
	"  result.method = \"ab\".repeat(2)",
	"  result.padded = String(5).padStart(3, \"0\")",
	"  result.replaced = \"a-b-c\".replaceAll(\"-\", \", \")",
	"  result.joined = [\"a\", \"b\"].join(\" / \")",
	"}"
], { n: "2" });
var expected = { three: "ababab", none: "", truncated: "abab", fromText: "abab", absent: "", number: "77", method: "abab",
	padded: "005", replaced: "a, b, c", joined: "a / b" };
Object.keys(expected).forEach(function (key) {
	assertTrue(meaning[key] === expected[key], key + ": expected " + JSON.stringify(expected[key]) + ", got " + JSON.stringify(meaning[key]));
});

// 3. A count String.prototype.repeat refuses (negative, infinite) is refused with what to write, by the function and by
// the method alike, and the refusal gives the count read, never the text received (no line break of a caller in a log)
[["text.repeat(\"x\", -1)", "text.repeat"], ["text.repeat(\"x\", Infinity)", "text.repeat"],
	["text.repeat(\"x\", input.padded)", "text.repeat"], ["\"x\".repeat(-1)", ".repeat"], ["\"\".repeat(Infinity)", ".repeat"]].forEach(function (call) {
	var error = refused([
		"const _flow = { sourceVersion: 2, inputs: { padded: { type: \"string\" } } }",
		"",
		"function Count({ input, result }) {",
		"  result.value = " + call[0],
		"}"
	], { padded: "\n\n-0000000001\n" }, "INVALID_EXPRESSION", call[0]);
	assertTrue(String(error.message).indexOf(call[1]) !== -1 && String(error.hint || "").indexOf("0") !== -1,
		"the refusal names " + call[1] + " and the counts it takes: " + JSON.stringify(error));
	assertTrue(String(error.message).indexOf("\n") === -1 && String(error.message).indexOf("0000000001") === -1,
		"the refusal gives the count read, not the text received: " + JSON.stringify(error.message));
});

// 4. The ceiling: one million characters is built, one more is refused before it is built
var atCeiling = result([
	"function Ceiling({ result }) {",
	"  result.length = text.repeat(\"x\", 1000000).length",
	"}"
]);
assertTrue(atCeiling.length === 1000000, "one million characters are built: " + JSON.stringify(atCeiling));
var over = refused([
	"function Over({ result }) {",
	"  result.length = text.repeat(\"x\", 1000001).length",
	"}"
], {}, "EXPRESSION_TEXT_TOO_LONG", "text.repeat over the ceiling");
assertTrue(String(over.message).indexOf("1000001") !== -1 && String(over.message).indexOf("1000000") !== -1,
	"the refusal gives the length and the ceiling: " + JSON.stringify(over));
assertTrue(over.status === 413, "a count of a caller is no internal failure: 413, as TEXT_INPUT_TOO_LONG: " + JSON.stringify(over));

// 5. Every way an expression multiplies a text is bounded the same, from the count of a caller too: each case first
// just over the ceiling (built in memory without the bound, two megabytes), then a billion characters
var amplifiers = [
	["the repeat method", "result.length = \"x\".repeat(input.n).length"],
	["padStart", "result.length = \"\".padStart(input.n, \"x\").length"],
	["padEnd", "result.length = \"x\".padEnd(input.n, \"y\").length"]
];
[1000001, 1000000000].forEach(function (n) {
	amplifiers.forEach(function (amplifier) {
		refused([
			"const _flow = { sourceVersion: 2, inputs: { n: { type: \"number\" } } }",
			"",
			"function Amplifier({ input, result }) {",
			"  " + amplifier[1],
			"}"
		], { n: n }, "EXPRESSION_TEXT_TOO_LONG", amplifier[0] + " of " + n);
	});
});
// .replaceAll and .join are bounded by what they add: a replacement 1002 characters long for a thousand characters of
// one, a separator of 1001 characters a thousand times, both 1001000 characters more
refused([
	"function Multiplied({ result }) {",
	"  result.length = \"x\".repeat(1000).replaceAll(\"x\", \"y\".repeat(1002)).length",
	"}"
], {}, "EXPRESSION_TEXT_TOO_LONG", "replaceAll");
refused([
	"function Joined({ result }) {",
	"  result.length = \"x\".repeat(1001).split(\"\").join(\"y\".repeat(1001)).length",
	"}"
], {}, "EXPRESSION_TEXT_TOO_LONG", "join");
// exactly one million characters more is built; data already held is never refused, even over a million characters:
// a text shortened by .replaceAll, a list of long texts joined
var underCeiling = result([
	"function Under({ result }) {",
	"  result.replaced = \"x\".repeat(1000).replaceAll(\"x\", \"y\".repeat(1001)).length",
	"  result.joined = \"x\".repeat(1001).split(\"\").join(\"y\".repeat(1000)).length",
	"  local.body = \"ab\".repeat(500000) + \"\\r\\n\" + \"cd\".repeat(10)",
	"  result.shortened = local.body.replaceAll(\"\\r\\n\", \"\\n\").length",
	"  result.held = [\"x\".repeat(1000000), \"y\".repeat(10)].join(\",\").length",
	"}"
]);
assertTrue(underCeiling.replaced === 1001000 && underCeiling.joined === 1001001 && underCeiling.shortened === 1000021 &&
	underCeiling.held === 1000011, "what an expression adds up to the ceiling, and data it holds, are built: " + JSON.stringify(underCeiling));

// 6. The parser reads every function of the evaluator as an expression
var utils = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/expression-utils.js"), "UTF-8")));
var names = Object.keys(utils.expressionFunctions({ sanitizeRuntimeValue: function (value) { return value; } }));
assertTrue(names.indexOf("text.repeat") !== -1, "the expressions give text.repeat");

print("expression-text-repeat: " + checks + " checks");
