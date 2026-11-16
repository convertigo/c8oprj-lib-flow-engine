var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(arguments[0], "blocks/rate/check.block.js"), "UTF-8"));
var warnings = [];
function testWarn(message) { warnings.push(String(message)); }
var block = eval(source.substring(source.indexOf("(function ()"))
	.replace(/Engine\.logEngine\.warn\(/g, "testWarn(")
	.replace("return { run: execute };", "return { run: execute, inspect: table };"));
function assert(value, message) { if (!value) throw new Error(message); }
function run(project, bucket, operation) {
	return block.run({ props: function (p) { return p; }, input: function (p) { return p.value; }, template: String,
		scopes: { request: { project: project } } },
		{ operation: operation, bucket: bucket, key: "key", limit: 1, windowSeconds: 60, maxEntries: 1 });
}
for (var project = 0; project < 16; project++) {
	for (var bucket = 0; bucket < 64; bucket++) {
		assert(run("project-" + project, "bucket-" + bucket, "hit").allowed, "fill all bucket slots");
	}
}
assert(block.inspect().size() === 1024, "global bucket capacity reached");
var unknown = run("project-16", "fresh", "hit");
assert(unknown.allowed && unknown.count === 0 && !block.inspect().containsKey("10:project-16/fresh"),
	"global saturation admits a new bucket without recording");
var peek = run("project-16", "fresh", "peek");
assert(peek.allowed && peek.count === 0, "global saturation admits an unknown peek");
assert(!run("project-0", "bucket-0", "peek").allowed, "known blocked key remains refused");
assert(warnings.some(function (message) { return message.indexOf("capacity=1024") >= 0; }), "global saturation warns");
print("rate-bucket-limits OK");
