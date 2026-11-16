var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(arguments[0], "blocks/rate/check.block.js"), "UTF-8"));
var now = 0;
var warnings = [];
function testWarn(message) { warnings.push(String(message)); }
var block = (function (Date) {
	return eval(source.substring(source.indexOf("(function ()")).replace("Engine.logEngine.warn(", "testWarn(")
		.replace("return { run: execute };", "return { run: execute, inspect: table };"));
})({ now: function () { return now; } });
function assert(value, message) { if (!value) throw new Error(message); }
function frame(project) { return { props: function (p) { return p; }, input: function (p) { return p.value; }, template: String,
	scopes: { request: { project: project } } }; }
function call(project, bucket, operation, key, limit, capacity) {
	return block.run(frame(project), { operation: operation, bucket: bucket, key: key, limit: limit,
		windowSeconds: 60, backoff: false, maxEntries: capacity });
}
assert(call("p", "mixed", "hit", "old", 2, 2).allowed, "old key starts");
assert(call("p", "mixed", "hit", "blocked", 2, 2).allowed, "blocked key starts");
assert(call("p", "mixed", "hit", "blocked", 2, 2).allowed, "blocked key reaches its limit");
assert(call("p", "mixed", "peek", "fresh", 2, 2).allowed, "unknown peek is allowed at capacity");
assert(call("p", "mixed", "hit", "fresh", 2, 2).allowed, "new hit replaces the oldest nonblocking key");
var entries = block.inspect().get("1:p/mixed").get("entries");
assert(!entries.containsKey("old") && entries.containsKey("blocked") && entries.containsKey("fresh"), "blocked key survives eviction");
assert(call("p", "mixed", "hit", "fresh", 2, 2).allowed, "new key can reach its limit");
assert(call("p", "mixed", "peek", "unknown", 2, 2).allowed, "peek stays open when all entries block");
var unknown = call("p", "mixed", "hit", "unknown", 2, 2);
assert(unknown.allowed && unknown.count === 0 && !entries.containsKey("unknown"), "unknown hit is admitted without recording when every entry blocks");
assert(!call("p", "mixed", "peek", "blocked", 2, 2).allowed, "known blocked key stays refused");
assert(warnings.length === 1 && warnings[0].indexOf("old") < 0 && warnings[0].indexOf("blocked") < 0,
	"capacity logs once without a quota key");
call("p", "mixed", "reset", "blocked", 2, 2);
call("p", "mixed", "reset", "fresh", 2, 2);
call("p", "mixed", "hit", "again-1", 2, 2);
call("p", "mixed", "hit", "again-2", 2, 2);
assert(warnings.length === 1, "reset and refill do not repeat the warning in one window");
now = 61000;
assert(call("p", "mixed", "hit", "next-1", 2, 2).allowed, "expired window accepts a key");
assert(call("p", "mixed", "hit", "next-2", 2, 2).allowed, "expired window fills again");
assert(warnings.length === 2, "a later window logs capacity once again");
for (var i = 0; i < 63; i++) assert(call("p", "bucket-" + i, "hit", "x", 1, 1).allowed, "project bucket " + i);
var overflow = call("p", "bucket-overflow", "hit", "x", 1, 1);
assert(overflow.allowed && overflow.count === 0 && !block.inspect().containsKey("1:p/bucket-overflow"), "project bucket limit admits without recording");
assert(call("other", "independent", "hit", "x", 1, 1).allowed, "another project keeps its own capacity");
assert(call("other", "shrinking", "hit", "a", 4, 3).allowed, "first key before capacity reduction");
assert(call("other", "shrinking", "hit", "b", 4, 3).allowed, "second key before capacity reduction");
assert(call("other", "shrinking", "hit", "c", 4, 3).allowed, "third key before capacity reduction");
assert(call("other", "shrinking", "hit", "d", 4, 1).allowed, "new key enters at reduced capacity");
assert(block.inspect().get("5:other/shrinking").get("entries").size() === 1, "reduced bucket capacity stays bounded");
print("rate-capacity OK");
