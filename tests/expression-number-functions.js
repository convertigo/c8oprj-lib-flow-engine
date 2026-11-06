// An agent writes the number functions of JavaScript first: parseInt(text, 10), Number.isInteger(n), Math.sqrt(n),
// Infinity. Each one was refused (FLOWSCRIPT_INVALID_BLOCK_CALL_SIGNATURE for parseInt, "Unknown expression function"
// for Number.isInteger and Math.sqrt, "Unknown expression identifier" for Infinity), and the list of what is allowed
// only appeared in the refusal. The expressions now give these pure functions, with the results of JavaScript, from a
// closed list: a name of Object.prototype (toString, constructor, __defineGetter__...) is no expression function.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-number-functions").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
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

function written(name, lines) {
	var response = api("flowCodeSet", { name: name, code: lines.join("\n") });
	assertTrue(response.ok === true, name + ": code-set refused: " + JSON.stringify(response.error || response).substring(0, 1200));
	return response;
}

function run(lines, input) {
	var response = JSON.parse(engine.run(JSON.stringify({ flowSource: lines.join("\n"), input: input || {}, includeTrace: false })));
	return response;
}

function result(lines, input) {
	var response = run(lines, input);
	assertTrue(response.ok === true, "run failed: " + JSON.stringify(response).substring(0, 1200));
	return response.result;
}

// 1. The quote of the light bench (anonymized): parseInt(text, 10) on an input checked as digits
var quote = [
	"const _flow = { sourceVersion: 2, inputs: { code: { type: \"string\" }, quantity: { type: \"string\" } } }",
	"",
	"function quote({ input, result }) {",
	"  local.prices = { A: 150, B: 800 }",
	"  local.price = local.prices[input.code]",
	"  if (local.price == null) {",
	"    throw { code: \"BAD_INPUT\", message: \"unknown code\", status: 400 }",
	"  }",
	"  local.digits = text.match({ text: String(input.quantity), pattern: \"^[0-9]+$\" })",
	"  if (!local.digits.matched) {",
	"    throw { code: \"BAD_INPUT\", message: \"quantity must be an integer\", status: 400 }",
	"  }",
	"  local.qty = parseInt(input.quantity, 10)",
	"  if (!Number.isInteger(local.qty) || local.qty < 1 || local.qty > 20) {",
	"    throw { code: \"BAD_INPUT\", message: \"quantity out of range\", status: 400 }",
	"  }",
	"  result.quantity = local.qty",
	"  result.totalCents = local.price * local.qty",
	"}"
];
written("quote", quote);
var quoted = result(quote, { code: "B", quantity: "3" });
assertTrue(quoted.quantity === 3 && quoted.totalCents === 2400, "parseInt and Number.isInteger in the quote: " + JSON.stringify(quoted));
var refused = run(quote, { code: "B", quantity: "25" });
assertTrue(refused.ok === false && refused.error.code === "BAD_INPUT", "the range check still refuses: " + JSON.stringify(refused).substring(0, 600));

// 2. The primes of the light bench (anonymized): Math.sqrt in a loop condition and in a computed list
var primes = [
	"const _flow = { sourceVersion: 2, inputs: { n: { type: \"integer\" } } }",
	"",
	"function primes({ input, result }) {",
	"  local.found = 0",
	"  local.i = 2",
	"  while({ condition: local.i <= input.n, maxIterations: 10000, $$nodes: function () {",
	"    local.prime = true",
	"    local.d = 2",
	"    while({ condition: local.prime && local.d <= Math.sqrt(local.i), maxIterations: 10000, $$nodes: function () {",
	"      if (local.i % local.d == 0) {",
	"        local.prime = false",
	"      }",
	"      local.d = local.d + 1",
	"    } })",
	"    if (local.prime) {",
	"      local.found = local.found + 1",
	"    }",
	"    local.i = local.i + 1",
	"  } })",
	"  result.count = local.found",
	"  result.root = Math.floor(Math.sqrt(input.n))",
	"}"
];
written("primes", primes);
var counted = result(primes, { n: 100 });
assertTrue(counted.count === 25 && counted.root === 10, "Math.sqrt in a loop condition and an assignment: " + JSON.stringify(counted));

// 3. Infinity as the start of a minimum, and the other constants
var minimum = [
	"const _flow = { sourceVersion: 2, inputs: { values: { type: \"array\" } } }",
	"",
	"function minimum({ input, result }) {",
	"  local.best = Infinity",
	"  forEach({ items: input.values, $$nodes: function () {",
	"    if (current < local.best) {",
	"      local.best = current",
	"    }",
	"  } })",
	"  result.best = local.best",
	"  result.empty = local.best === Infinity",
	"  result.below = -Infinity < local.best",
	"  result.circle = round(Math.PI * 2, 2)",
	"  result.e = round(Math.E, 3)",
	"  result.nan = Number.isNaN(NaN)",
	"}"
];
written("minimum", minimum);
var smallest = result(minimum, { values: [7, 3, 9] });
assertTrue(smallest.best === 3 && smallest.empty === false && smallest.below === true && smallest.circle === 6.28 &&
	smallest.e === 2.718 && smallest.nan === true, "Infinity and the constants: " + JSON.stringify(smallest));
assertTrue(result(minimum, { values: [] }).empty === true, "Infinity stays Infinity while the list is empty");

// 4. The results of JavaScript, in an assignment (the parser) and in a condition (the expression of if)
var values = result([
	"function values({ input, result }) {",
	"  result.parsed = parseInt(\"42px\", 10)",
	"  result.hex = parseInt(\"0x1F\")",
	"  result.binary = parseInt(\"101\", 2)",
	"  result.notNumber = isNaN(parseInt(\"px\", 10))",
	"  result.decimal = parseFloat(\"3.5 kg\")",
	"  result.numberParse = Number.parseInt(\"-7.9\") + Number.parseFloat(\".5\")",
	"  result.isNaNText = isNaN(\"abc\")",
	"  result.isNaNNumberText = isNaN(\"12\")",
	"  result.finite = isFinite(\"12\") && !isFinite(1 / 0)",
	"  result.integerNumber = Number.isInteger(4)",
	"  result.integerText = Number.isInteger(\"4\")",
	"  result.integerDecimal = Number.isInteger(4.5)",
	"  result.finiteText = Number.isFinite(\"4\")",
	"  result.finiteInfinity = Number.isFinite(Infinity)",
	"  result.nanText = Number.isNaN(\"abc\")",
	"  result.root = Math.sqrt(input.n)",
	"  result.cube = Math.cbrt(27)",
	"  result.power = Math.pow(2, 10)",
	"  result.truncated = Math.trunc(-3.7)",
	"  result.sign = Math.sign(-2)",
	"  result.hypot = Math.hypot(3, 4)",
	"  result.log = Math.log10(1000) + Math.log2(8) + round(Math.log(Math.exp(2)), 6)",
	"  result.trigo = round(Math.sin(Math.PI / 2) + Math.cos(0) + Math.tan(0) + Math.asin(1) * 2 / Math.PI + Math.acos(1), 6)",
	"  result.angle = round(Math.atan2(1, 1) * 4 + Math.atan(0), 6)",
	"  if (Math.sqrt(input.n) === 7 && Number.isInteger(Math.sqrt(input.n))) {",
	"    result.square = true",
	"  }",
	"}"
], { n: 49 });
var expected = { parsed: 42, hex: 31, binary: 5, notNumber: true, decimal: 3.5, numberParse: -6.5, isNaNText: true,
	isNaNNumberText: false, finite: true, integerNumber: true, integerText: false, integerDecimal: false, finiteText: false,
	finiteInfinity: false, nanText: false, root: 7, cube: 3, power: 1024, truncated: -3, sign: -1, hypot: 5, log: 8, trigo: 3,
	angle: 3.141593, square: true };
Object.keys(expected).forEach(function (key) {
	assertTrue(values[key] === expected[key], key + ": expected " + expected[key] + ", got " + JSON.stringify(values[key]));
});

// 5. Every function of the expressions is read as an expression by code-set, never as a block call: the list of the
// parser matches the one of the evaluator.
var utils = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/expression-utils.js"), "UTF-8")));
var names = Object.keys(utils.expressionFunctions({ sanitizeRuntimeValue: function (value) { return value; } }));
["parseInt", "parseFloat", "isNaN", "isFinite", "Number.parseInt", "Number.parseFloat", "Number.isNaN", "Number.isFinite",
	"Number.isInteger", "Math.sqrt", "Math.cbrt", "Math.pow", "Math.exp", "Math.log", "Math.log2", "Math.log10", "Math.trunc",
	"Math.sign", "Math.hypot", "Math.sin", "Math.cos", "Math.tan", "Math.asin", "Math.acos", "Math.atan", "Math.atan2"].forEach(function (name) {
	assertTrue(names.indexOf(name) !== -1, "the expressions give " + name);
});
assertTrue(names.indexOf("Math.random") === -1, "Math.random is not pure: no expression function");
names.filter(function (name) { return /^(parseInt|parseFloat|isNaN|isFinite|Number\.|Math\.)/.test(name); }).forEach(function (name) {
	var assigned = api("flowCodeSet", { name: "Assigned", code: [
		"const _flow = { sourceVersion: 2, inputs: { n: { type: \"number\" } } }",
		"function Assigned({ input, result }) {",
		"  local.value = " + name + "(input.n, 2)",
		"  if (" + name + "(input.n, 2) == local.value) {",
		"    result.same = true",
		"  }",
		"}"
	].join("\n") });
	assertTrue(assigned.ok === true, name + " is read as an expression by code-set: " + JSON.stringify(assigned.error || assigned).substring(0, 800));
});

// 6. A closed list: the names Object.prototype gives every object are no expression functions, and the functions
// that are not pure stay refused
["toString", "valueOf", "constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString",
	"__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "Math.random", "eval", "Function"].forEach(function (name) {
	var lines = [
		"function Closed({ input, result }) {",
		"  if (" + name + "(\"x\", 1) == 1) {",
		"    result.reached = true",
		"  }",
		"}"
	];
	var checked = api("flowCodeSet", { name: "Closed", code: lines.join("\n") });
	assertTrue(checked.ok === false && JSON.stringify(checked.error).indexOf("Unknown expression function: " + name) !== -1,
		name + " is no expression function at code-set: " + JSON.stringify(checked.error || checked).substring(0, 600));
	var ran = run(lines, {});
	assertTrue(ran.ok === false && JSON.stringify(ran.error).indexOf("Unknown expression function: " + name) !== -1,
		name + " is no expression function at run: " + JSON.stringify(ran).substring(0, 600));
	api("flowCodeDiscard", { name: "Closed" });
});

// A member of a value is data, never a function: "abc".constructor and (1).constructor.constructor gave String and
// Function as values (value[key] already refused them)
var members = result([
	"function Members({ input, result }) {",
	"  if (\"abc\".constructor != null || (1).constructor != null || String(input.n).constructor != null) {",
	"    result.reached = true",
	"  }",
	"  result.length = \"abc\".length + String(input.n).length",
	"}"
], { n: 49 });
assertTrue(members.reached === undefined && members.length === 5, "a member is data, never a function: " + JSON.stringify(members));

print("expression-number-functions: " + checks + " checks");
