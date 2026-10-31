// A number of pages needs a rounding and a remainder: Math.ceil(total / size) was read as a call of an unknown block
// (FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE), total % size refused (Unsupported expression character: %), and an
// author fell back to (total / size + 0.4999).toFixed(0) * 1. The expressions now give floor, ceil, abs, min, max,
// their Math.* spellings and the % operator.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-rounding").toFile().getAbsolutePath());
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var checks = 0;

function assertTrue(condition, message) {
	checks++;
	if (!condition) {
		throw new Error(message);
	}
}

function run(lines, input) {
	var response = JSON.parse(engine.run(JSON.stringify({ flowSource: lines.join("\n"), input: input, includeTrace: false })));
	assertTrue(response.ok === true, "Flow run failed: " + JSON.stringify(response));
	return response.result;
}

var paging = run([
	"function Paging({ input, result }) {",
	"  result.pages = Math.ceil(input.total / input.size)",
	"  result.full = Math.floor(input.total / input.size)",
	"  result.pagesShort = ceil(input.total / input.size)",
	"  result.fullShort = floor(input.total / input.size)",
	"  result.rest = input.total % input.size",
	"  result.lastStart = input.total - input.total % input.size",
	"  result.even = input.total % 2 === 0",
	"  result.rounded = Math.round(input.ratio)",
	"  result.roundedTwo = round(input.ratio, 2)",
	"  result.smallest = Math.min(input.total, input.size)",
	"  result.largest = max(input.total, input.size, 40)",
	"  result.distance = Math.abs(input.size - input.total)",
	"  result.nested = Math.max(1, Math.ceil(input.total / input.size))",
	"  if (input.total % input.size > 0) {",
	"    result.partial = true",
	"  }",
	"}"
], { total: 23, size: 10, ratio: 2.456 });
assertTrue(paging.pages === 3 && paging.full === 2 && paging.pagesShort === 3 && paging.fullShort === 2, "ceil and floor: " + JSON.stringify(paging));
assertTrue(paging.rest === 3 && paging.lastStart === 20 && paging.even === false, "remainder: " + JSON.stringify(paging));
assertTrue(paging.rounded === 2 && paging.roundedTwo === 2.46, "round: " + JSON.stringify(paging));
assertTrue(paging.smallest === 10 && paging.largest === 40 && paging.distance === 13 && paging.nested === 3, "min, max, abs: " + JSON.stringify(paging));
assertTrue(paging.partial === true, "% in a condition");

// precedence of %: as * and /, before + and -
var precedence = run([
	"function Precedence({ input, result }) {",
	"  result.value = 1 + input.a % 4 * 2",
	"  result.text = \"page \" + (input.a % 4)",
	"}"
], { a: 7 });
assertTrue(precedence.value === 7 && precedence.text === "page 3", "precedence of %: " + JSON.stringify(precedence));

// a block call stays refused inside an expression, a Math function is not one
var nested = JSON.parse(engine.run(JSON.stringify({ flowSource: [
	"function Nested({ input, result }) {",
	"  result.value = date.now({}) + 1",
	"}"
].join("\n"), input: {}, includeTrace: false })));
assertTrue(nested.ok === false && nested.error.code === "FLOWSCRIPT_EXPRESSION_UNSUPPORTED", "a nested block call is still refused: " + JSON.stringify(nested.error));

// code-set reads them as the run does: its safe corrections refused Math.max(1, 2) as an unknown block
var written = JSON.parse(engine.flowCodeSet(JSON.stringify({ name: "Written", code: [
	"function Written({ input, result }) {",
	"  result.value = Math.max(1, Math.ceil(input.total / input.size))",
	"  result.length = list.length(input.items)",
	"}"
].join("\n") })));
assertTrue(written.ok === true, "code-set refused an expression function: " + JSON.stringify(written).substring(0, 800));

print("expression-rounding-remainder: " + checks + " checks");
