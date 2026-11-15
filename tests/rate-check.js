var engineDir = new java.io.File(arguments[0]);
var files = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = String(engineDir.getCanonicalPath());
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "rate-check-test").getAbsolutePath());
var context = { remoteAddr: "trusted-client" };
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var code = String(files.readFileToString(new java.io.File(engineDir, "blocks/rate/check.block.js"), "UTF-8"));
var now = 0;
var block = (function (Date) { return eval(code.substring(code.indexOf("(function ()"))); })({ now: function () { return now; } });
var checks = 0;
function eq(actual, expected, message) {
	checks++;
	if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message + ": " + JSON.stringify(actual));
}
var ctx = {
	props: function (node) { return node; },
	input: function (property) { return property.value; },
	template: function (value) { return value; }
};
function call(operation, key, extra) {
	var props = { operation: operation, bucket: "login", key: key, limit: 2, windowSeconds: 20,
		backoff: true, maxDelaySeconds: 3, maxEntries: 2 };
	Object.keys(extra || {}).forEach(function (name) { props[name] = extra[name]; });
	return block.run(ctx, props);
}

eq(call("hit", "alice"), { allowed: true, retryAfterSeconds: 0, count: 1 }, "first event");
eq(call("hit", "alice"), { allowed: true, retryAfterSeconds: 0, count: 2 }, "limit event remains allowed");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 1, count: 2 }, "peek refuses without counting");
eq(call("hit", "alice"), { allowed: false, retryAfterSeconds: 2, count: 3 }, "blocked hit counts and doubles the delay");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 2, count: 3 }, "delay doubles");
now = 2000;
eq(call("peek", "alice"), { allowed: true, retryAfterSeconds: 0, count: 3 }, "delay expires without permanent lock");
eq(call("hit", "alice"), { allowed: true, retryAfterSeconds: 0, count: 4 }, "retry can proceed");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 3, count: 4 }, "delay is capped");
eq(call("hit", "alice"), { allowed: false, retryAfterSeconds: 3, count: 5 }, "further failures still count");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 3, count: 5 }, "cap remains stable");
eq(call("peek", "bob"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "independent key");
eq(call("hit", "bob"), { allowed: true, retryAfterSeconds: 0, count: 1 }, "second key starts fresh");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 3, count: 5 }, "peek refreshes LRU");
eq(call("hit", "carol"), { allowed: true, retryAfterSeconds: 0, count: 1 }, "third key enters table");
eq(call("peek", "bob"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "least recent key is evicted");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 3, count: 5 }, "recent key survives eviction");
eq(call("reset", "alice"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "successful login resets");
eq(call("peek", "alice"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "reset clears count");
eq(call("peek", "", {}), { allowed: false, retryAfterSeconds: 0, count: 0 }, "invalid key fails closed without throwing");
now = 25000;
eq(call("peek", "carol"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "sliding window expires");
eq(call("hit", "plain", { backoff: false, limit: 1 }), { allowed: true, retryAfterSeconds: 0, count: 1 }, "quota accepts its first event");
eq(call("peek", "plain", { backoff: false, limit: 1 }), { allowed: false, retryAfterSeconds: 20, count: 1 }, "quota without backoff waits for the window");
now = 45000;
eq(call("peek", "plain", { backoff: false, limit: 1 }), { allowed: true, retryAfterSeconds: 0, count: 0 }, "quota renews at window expiry");

var request = { definition: { nodes: [{ id: "rate", block: "rate.check", props: {
	operation: "hit", bucket: "address", key: "{{ request.clientAddress }}", limit: 1, windowSeconds: 60
}, out: "result.rate" }] }, context: { clientAddress: "spoofed", "X-Forwarded-For": "spoofed" }, includeTrace: false };
var first = JSON.parse(engine.run(JSON.stringify(request)));
eq(first.ok, true, "engine executes rate.check without exception");
eq(first.result.rate, { allowed: true, retryAfterSeconds: 0, count: 1 }, "trusted address first hit");
var second = JSON.parse(engine.run(JSON.stringify(request)));
eq(second.result.rate, { allowed: false, retryAfterSeconds: 60, count: 2 }, "trusted address reused across calls");
request.context.clientAddress = "another-spoofed-address";
var third = JSON.parse(engine.run(JSON.stringify(request)));
eq(third.result.rate, { allowed: false, retryAfterSeconds: 60, count: 3 }, "request metadata cannot replace the trusted address");
context.remoteAddr = "another-trusted-client";
var otherAddress = JSON.parse(engine.run(JSON.stringify(request)));
eq(otherAddress.result.rate, { allowed: true, retryAfterSeconds: 0, count: 1 }, "Convertigo remote address selects an independent key");
var catalog = JSON.parse(engine.catalog(JSON.stringify({ q: "rate.check", detail: "full" })));
eq(catalog.blocks.some(function (item) { return item.blockId === "rate.check"; }), true, "catalog discovers block");
print("rate.check OK (" + checks + " assertions)");
