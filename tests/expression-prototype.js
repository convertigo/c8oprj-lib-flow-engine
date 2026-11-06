// An expression reaches no prototype and no function value. The functions of expressions are a table of no prototype,
// frozen, called with a neutral this: constructor(1), toString() or __defineGetter__(…) are unknown functions. The names
// constructor, __proto__ and prototype are refused in a path, a .member or an object key, and read as undefined as a
// computed [key]. A function in the scope (a value a Rhino block wrote) reads as undefined, by a path, a member, an index
// of a list, at() or in a template literal.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var __flowEngineDir = engineDir;
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("lib-flow-engine-expression-prototype").toFile().getAbsolutePath());
// a Rhino block of the project that writes functions in the scope (a fixture of point 4)
FileUtils.writeStringToFile(new java.io.File(__flowProjectDir, "_flow/blocks/proof/functions.block.js"), 'const _meta = { sourceVersion: 2, runtime: "rhino", ' +
	'properties: {} };\n(function(){return {run:function(ctx,node){ctx.write("local.fn", {f: function () { return 1; }, ' +
	'l: [function () { return 2; }, "x"], o: {g: function () { return 3; }}, "a b": function () { return 4; }, "c d": {h: function () { return 5; }}}); return {};}};}())', "UTF-8");
var engine = eval(source);
var checks = 0, failures = [];
function witness(name, ok, detail) {
	checks++;
	if (!ok) failures.push(name);
	print((ok ? "PASS " : "FAIL ") + name + (ok ? "" : ": " + JSON.stringify(detail).substring(0, 400)));
}
function flow(body) {
	return "const _flow = { sourceVersion: 2 }\n\nfunction Probe({ input, config, result }) {\n" + body + "\n}\n";
}
function run(body, input) {
	return JSON.parse(String(engine.run(JSON.stringify({ flowSource: flow(body), input: input || {}, includeTrace: false }))));
}
function refused(response, text) {
	return response.ok === false && JSON.stringify(response.error).indexOf(text) !== -1;
}

// 1. The table of the functions of expressions: no prototype, frozen; an inherited name is no function.
var module = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/expression-utils.js"), "UTF-8")));
var table = module.expressionFunctions({});
witness("the function table has no prototype and is frozen", Object.getPrototypeOf(table) === null && Object.isFrozen(table),
	{ prototype: Object.getPrototypeOf(table) === null, frozen: Object.isFrozen(table) });
["constructor(1) == 1", "toString()", "valueOf()", "hasOwnProperty(\"x\")", "isPrototypeOf(local.s)", "propertyIsEnumerable(\"x\")",
	"__defineGetter__(\"flowProbe\", local.s)", "__lookupGetter__(\"x\")", "toLocaleString()"].forEach(function (expression) {
	var r = run("  local.s = \"abc\"\n  local.v = 0 || " + expression + "\n  return { v: local.v }");
	witness(expression + " is an unknown function", refused(r, "Unknown expression function"), r);
});

// 2. The functions of expressions run with a neutral this: an object of no prototype, frozen, never null nor the global.
var apply = Function.prototype.apply, seen = [];
Function.prototype.apply = function (self, args) {
	var text = String(this);
	if (text.indexOf("toLowerCase()") !== -1 && text.indexOf("value === undefined || value === null") !== -1) seen.push(self);
	return apply.call(this, self, args);
};
var lowered;
try { lowered = run("  local.v = lower(\"ABC\")\n  return { v: local.v }"); } finally { Function.prototype.apply = apply; }
witness("a function of expressions gets a neutral this", lowered.ok && lowered.result.v === "abc" && seen.length > 0 &&
	seen.every(function (self) { return self !== null && self !== undefined && Object.getPrototypeOf(self) === null && Object.isFrozen(self); }),
	{ response: lowered, thisValues: seen.map(function (self) { return self === null ? "null" : typeof self; }) });

// 3. constructor, __proto__ and prototype: refused in a path, a member and an object key; undefined as a computed key.
["local.s.constructor", "local.o.__proto__", "local.o.prototype", "local.o[\"constructor\"]", "local.o.a.constructor",
	"\"a\".constructor", "(1).constructor", "local.s.trim().constructor", "local.l[0].constructor"].forEach(function (expression) {
	var r = run("  local.s = \"abc\"\n  local.o = { a: \"x\" }\n  local.l = [\"x\"]\n  local.v = " + expression + "\n  return { v: 1 }");
	witness(expression + " is refused", refused(r, "INVALID_EXPRESSION") && refused(r, "cannot be"), r);
});
var keyed = run("  local.o = { a: \"x\" }\n  local.v = 0 || { __proto__: local.o, b: 1 }\n  local.w = { __proto__: local.o, c: 2 }\n" +
	"  return { a: typeof local.v.a, b: local.v.b, wa: typeof local.w.a, c: local.w.c }");
witness("__proto__ as a key builds an own value, never a prototype", keyed.ok &&
	JSON.stringify(keyed.result) === JSON.stringify({ a: "undefined", b: 1, wa: "undefined", c: 2 }), keyed);
var computed = run("  local.s = \"abc\"\n  local.o = { a: \"x\" }\n  local.k = \"constructor\"\n  local.p = \"__proto__\"\n" +
	"  return { a: typeof local.o[local.k], b: typeof local.s[local.k], c: typeof local.o[local.p] }");
witness("a computed constructor or __proto__ key reads as undefined", computed.ok &&
	JSON.stringify(computed.result) === JSON.stringify({ a: "undefined", b: "undefined", c: "undefined" }), computed);

// 4. A function in the scope reads as undefined: a path, a member, an index of a list, at(), a template literal.
// A path with a quoted key that is not a name (local.fn["a b"]) is read by ctx.read, the others by the simple path reader.

var reads = run("  proof.functions({})\n  local.i = 0\n  return { path: typeof local.fn.f, member: typeof local.fn.o.g, index: typeof local.fn.l[0], " +
	"computed: typeof local.fn.l[local.i], at: typeof local.fn.l.at(0), last: typeof local.fn.l.at(-2), template: `${local.fn.f}`, kept: local.fn.l[1] }");
var template = reads.ok ? reads.result.template : null;
if (reads.ok) delete reads.result.template;
witness("no function value is read from the scope", reads.ok && (template === undefined || template === "") && JSON.stringify(reads.result) === JSON.stringify(
	{ path: "undefined", member: "undefined", index: "undefined", computed: "undefined", at: "undefined", last: "undefined", kept: "x" }), { response: reads, template: template });
var stub = { isScopePath: function (name) { return /^local\./.test(String(name)); }, raise: function (code, message) { throw new Error(code + ": " + message); },
	normalizeTree: function (value) { return value; } };
var scope = { scopes: { local: { fn: { l: [function () { return 2; }] } } }, read: function (path) { return path === "local.fn.a b" ? function () { return 4; } : undefined; } };
witness("a compiled expression returns no function: an index of a list", typeof module.compile("local.fn.l[0]", stub)(scope) === "undefined",
	typeof module.compile("local.fn.l[0]", stub)(scope));
witness("a compiled expression returns no function: a path read by ctx.read", typeof module.compile("local.fn[\"a b\"]", stub)(scope) === "undefined",
	typeof module.compile("local.fn[\"a b\"]", stub)(scope));

print(JSON.stringify({ passed: failures.length === 0, checks: checks, failures: failures }));
if (failures.length) throw new Error("expression prototype: " + failures.length + " failed: " + failures.join("; "));
print("expression prototype: ok");
