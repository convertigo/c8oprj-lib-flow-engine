var engineDir = new java.io.File(arguments[0]);
var files = Packages.org.apache.commons.io.FileUtils;
var __flowEngineDir = String(engineDir.getCanonicalPath());
var __flowProjectDir = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "rate-check-test").getAbsolutePath());
var context = { remoteAddr: "trusted-client" };
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var code = String(files.readFileToString(new java.io.File(engineDir, "blocks/rate/check.block.js"), "UTF-8"));
var now = 0;
var blockSource = code.substring(code.indexOf("(function ()"));
var inspectedSource = blockSource.replace("return { run: execute };", "return { run: execute, inspect: table };");
var block = (function (Date) { return eval(inspectedSource); })({ now: function () { return now; } });
function bucketOf(name, project) { project = project || ""; return block.inspect().get(project.length + ":" + project + "/" + name); }
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
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 3, count: 5 }, "first key stays blocked");
eq(call("hit", "carol"), { allowed: true, retryAfterSeconds: 0, count: 1 }, "new key replaces the oldest nonblocking key");
eq(call("peek", "carol"), { allowed: true, retryAfterSeconds: 0, count: 1 }, "new key is recorded");
eq(call("peek", "bob"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "evicted key is unknown again");
eq(call("peek", "alice"), { allowed: false, retryAfterSeconds: 3, count: 5 }, "blocked key survives table saturation");
eq(call("reset", "bob"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "reset frees a slot");
eq(call("hit", "carol"), { allowed: true, retryAfterSeconds: 0, count: 2 }, "existing key continues after reset");
eq(call("reset", "alice"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "successful login resets");
eq(call("peek", "alice"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "reset clears count");
eq(call("peek", "", {}), { allowed: false, retryAfterSeconds: 0, count: 0 }, "invalid key fails closed without throwing");
now = 25000;
eq(call("peek", "carol"), { allowed: true, retryAfterSeconds: 0, count: 0 }, "fixed window expires");
eq(call("hit", "plain", { backoff: false, limit: 1 }), { allowed: true, retryAfterSeconds: 0, count: 1 }, "quota accepts its first event");
eq(call("peek", "plain", { backoff: false, limit: 1 }), { allowed: false, retryAfterSeconds: 20, count: 1 }, "quota without backoff waits for the window");
now = 45000;
eq(call("peek", "plain", { backoff: false, limit: 1 }), { allowed: true, retryAfterSeconds: 0, count: 0 }, "quota renews at window expiry");

eq(call("hit", "victim", { bucket: "protected", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 1 }),
	{ allowed: true, retryAfterSeconds: 0, count: 1 }, "protected bucket records victim");
eq(call("hit", "one", { bucket: "flood", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 2 }),
	{ allowed: true, retryAfterSeconds: 0, count: 1 }, "flood bucket first key");
eq(call("hit", "two", { bucket: "flood", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 2 }),
	{ allowed: true, retryAfterSeconds: 0, count: 1 }, "flood bucket second key");
eq(call("hit", "three", { bucket: "flood", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 2 }),
	{ allowed: false, retryAfterSeconds: 60, count: 0 }, "flood bucket refuses overflow");
for (var flooded = 4; flooded < 1004; flooded++) {
	eq(call("hit", "new-" + flooded, { bucket: "flood", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 2 }),
		{ allowed: false, retryAfterSeconds: 60, count: 0 }, "flood key " + flooded + " is refused");
}
eq(call("peek", "victim", { bucket: "protected", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 1 }),
	{ allowed: false, retryAfterSeconds: 60, count: 1 }, "victim remains blocked during other bucket flood");
eq(call("peek", "new", { bucket: "protected", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 1 }),
	{ allowed: true, retryAfterSeconds: 0, count: 0 }, "unknown peek remains allowed in a full bucket");

var stress = { bucket: "stress", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 1 };
eq(call("hit", "same", stress), { allowed: true, retryAfterSeconds: 0, count: 1 }, "stress key starts");
var firstState = bucketOf("stress").get("entries").get("same");
for (var i = 1; i < 10000; i++) call("hit", "same", stress);
var stressEntries = bucketOf("stress").get("entries");
eq(stressEntries.size(), 1, "ten thousand attempts keep one entry");
eq(stressEntries.get("same") === firstState, true, "ten thousand attempts reuse the same state");
eq(firstState.length(), 3, "per-key state has three fixed slots");
eq(Number(firstState.get(1)), 10000, "counter includes ten thousand attempts");
now = 105000;
eq(call("hit", "three", { bucket: "flood", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 2 }),
	{ allowed: true, retryAfterSeconds: 0, count: 1 }, "expired entries free capacity");

var projectA = { props: ctx.props, input: ctx.input, template: ctx.template, scopes: { request: { project: "appA" } } };
var projectB = { props: ctx.props, input: ctx.input, template: ctx.template, scopes: { request: { project: "appB" } } };
var shared = { operation: "hit", bucket: "login.user", key: "x", limit: 1, windowSeconds: 60, backoff: false, maxEntries: 1 };
eq(block.run(projectA, shared), { allowed: true, retryAfterSeconds: 0, count: 1 }, "project A fills its bucket");
shared.key = "y";
eq(block.run(projectA, shared), { allowed: false, retryAfterSeconds: 60, count: 0 }, "project A bucket is full");
eq(block.run(projectB, shared), { allowed: true, retryAfterSeconds: 0, count: 1 }, "same bucket name in project B is independent");
eq(bucketOf("login.user", "appA").get("entries").containsKey("y"), false, "project B counters stay out of project A");
eq(bucketOf("login.user", "appB").get("entries").containsKey("x"), false, "project A counters stay out of project B");
shared.operation = "peek"; shared.key = "x";
eq(block.run(projectA, shared), { allowed: false, retryAfterSeconds: 60, count: 1 }, "project A still sees its own counter");
eq(block.run({ props: ctx.props, input: ctx.input, template: ctx.template, scopes: { request: { project: new Array(258).join("p") } } }, shared),
	{ allowed: false, retryAfterSeconds: 0, count: 0 }, "an oversized project name fails closed");

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
