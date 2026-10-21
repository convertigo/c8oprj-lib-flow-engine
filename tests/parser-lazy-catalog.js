// Parsing one source must not materialize unrelated lazy block descriptors.
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var dir = new File(arguments.length ? arguments[0] : "_flow");
var parser = eval(String(files.readFileToString(new File(dir, "modules/flow-script-parser-service.js"), "UTF-8")));
var sourceUtils = eval(String(files.readFileToString(new File(dir, "modules/block-code-source-service.js"), "UTF-8")));
var reads = 0, checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
var blocks = {};
for (var i = 0; i < 500; i++) Object.defineProperty(blocks, "unused" + i, {
 enumerable:true, configurable:true, get:function () { reads++; throw new Error("Unrelated lazy descriptor evaluated"); }
});
var env = {
 balancedObjectEnd:sourceUtils.balancedObjectEnd,
 normalizeFlowScriptFunctionSyntax:function (value) { return value; },
 canonicalFlowDefinition:function (value) { return value; },
 safeIdentifier:function (value) { return value; },
 raise:function (code, message) { throw new Error(code + ": " + message); }
};
var plain = parser.parseFlowScript(blocks, "function Main({ input, result }) {\n}\n", env);
assert(plain.nodes.length === 0 && plain.helpers.length === 0, "Empty main changed");
assert(reads === 0, "No helper must reuse the lazy catalog");
var helper = parser.parseFlowScript(blocks, "function Main({ input, result }) {\n}\nfunction unused0(value) {\n}\n", env);
assert(helper.helpers.length === 1 && helper.helpers[0].name === "unused0", "Helper parsing changed");
assert(reads === 0, "Helper overlay evaluated unrelated descriptors");
assert(typeof Object.getOwnPropertyDescriptor(blocks, "unused0").get === "function", "Helper leaked into the shared catalog");
print("parser-lazy-catalog: " + checks + " checks passed");
