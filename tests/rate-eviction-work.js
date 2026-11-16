var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(arguments[0], "blocks/rate/check.block.js"), "UTF-8"));
var visits = 0;
var inspected = source.substring(source.indexOf("(function ()"))
	.replace(/iterator\.next\(\)/g, "(visits++, iterator.next())");
var block = (function (Date) { return eval(inspected); })({ now: function () { return 1000; } });
function assert(value, message) { if (!value) throw new Error(message); }
function run(bucket, key, capacity) {
	return block.run({ props: function (p) { return p; }, input: function (p) { return p.value; }, template: String,
		scopes: { request: { project: "bounded-work" } } },
		{ operation: "hit", bucket: bucket, key: key, limit: 2, windowSeconds: 60, maxEntries: capacity });
}
for (var c = 0, capacities = [128, 4096]; c < capacities.length; c++) {
	var capacity = capacities[c];
	var bucket = "capacity-" + capacity;
	for (var i = 0; i < capacity; i++) assert(run(bucket, "key-" + i, capacity).allowed, "fill bucket");
	visits = 0;
	assert(run(bucket, "new", capacity).allowed, "new key enters");
	assert(visits <= 64, "new hit visits at most 64 entries at capacity " + capacity + ": " + visits);
}
for (var blocked = 0; blocked < 64; blocked++) {
	assert(run("blocked-front", "key-" + blocked, 128).allowed, "fill blocked prefix");
	assert(run("blocked-front", "key-" + blocked, 128).allowed, "block prefix key");
}
for (var tail = 64; tail < 128; tail++) assert(run("blocked-front", "key-" + tail, 128).allowed, "fill tail");
visits = 0;
var unrecorded = run("blocked-front", "new", 128);
assert(unrecorded.allowed && unrecorded.count === 0 && visits <= 64,
	"blocked prefix bounds candidate search and admits without recording: " + visits);
print("rate-eviction-work OK");
