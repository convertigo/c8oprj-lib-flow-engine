// Cooperative cancellation (execution model v1, section 7): ctx.canContinue() is read before
// each block and before a result is published, like bContinue in Convertigo sequences.
var engineDir = new java.io.File(arguments[0] || "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir);
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-cancellation-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value, message) { if (!value) throw new Error(message); }
function invoke(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
function run(nodes, extra) {
	return invoke("run", Object.assign({ definition: { flow: { sourceVersion: 2 }, nodes: nodes }, includeTrace: false }, extra || {}));
}
var set = function (path, value) { return { block: "set", props: { path: path, value: value } }; };

// The Convertigo requestable running the Flow: isRunning() turns false on Studio cancel or timeout.
var remaining = Infinity;
var context = { requestedObject: { isRunning: function () { return remaining-- > 0; } } };

remaining = Infinity;
var normal = run([set("result.a", 1), set("result.b", 2)]);
assert(normal.ok && normal.result.a === 1 && normal.result.b === 2, "A running requestable lets the Flow finish: " + JSON.stringify(normal));

// Two checks per block (before running, before publishing): the second block is refused.
remaining = 2;
var cancelled = run([set("result.a", 1), set("result.b", 2), set("result.c", 3)]);
assert(!cancelled.ok && cancelled.error.code === "FLOW_CANCELLED", "A cancelled requestable stops the Flow: " + JSON.stringify(cancelled));

[false, true].forEach(function (profile) {
	remaining = Infinity;
	var returned = run([set("result.a", 1), { block: "return", props: { value: { done: true } } }, set("result.b", 2)], { profile: profile });
	assert(returned.ok && returned.result.done === true, "A return stays a success, never a cancellation: " + JSON.stringify(returned));
});

// A block cancels its own execution: the result it was about to publish is not written.
remaining = Infinity;
assert(invoke("blockCodeSet", { name: "proof.cancelSelf", code: 'const _meta={sourceVersion:2,runtime:"rhino"};\n'
	+ '(function(){return {run:function(ctx){ctx.cancel("test");return "must not be published";}};}())' }).ok, "Create cancelling fixture");
[false, true].forEach(function (profile) {
	var self = run([{ block: "proof.cancelSelf", props: {}, out: "result.value" }, set("result.after", 1)], { profile: profile });
	assert(!self.ok && self.error.code === "FLOW_CANCELLED" && /test/.test(self.error.message), "No publication after cancellation: " + JSON.stringify(self));
});

// A block with an internal loop reads ctx.canContinue() itself.
assert(invoke("blockCodeSet", { name: "proof.loop", code: 'const _meta={sourceVersion:2,runtime:"rhino"};\n'
	+ '(function(){return {run:function(ctx){var n=0;while(ctx.canContinue()&&n<1000){n++;}return n;}};}())' }).ok, "Create loop fixture");
remaining = 10;
var loop = run([{ block: "proof.loop", props: {}, out: "result.count" }]);
assert(!loop.ok && loop.error.code === "FLOW_CANCELLED", "The loop stops early and nothing is published: " + JSON.stringify(loop));

// ctx.callBlock checks too.
assert(invoke("blockCodeSet", { name: "proof.caller", code: 'const _meta={sourceVersion:2,runtime:"rhino"};\n'
	+ '(function(){return {run:function(ctx){ctx.cancel("caller");return ctx.callBlock("proof.cancelSelf",{});}};}())' }).ok, "Create caller fixture");
remaining = Infinity;
var called = run([{ block: "proof.caller", props: {} }]);
assert(!called.ok && called.error.code === "FLOW_CANCELLED", "ctx.callBlock refuses to start once cancelled: " + JSON.stringify(called));

// Outside a Convertigo requestable (tests, MCP runs), nothing cancels by itself.
context = undefined;
var free = run([set("result.a", 1)]);
assert(free.ok && free.result.a === 1, "No host, no cancellation: " + JSON.stringify(free));
print("flow-cancellation OK: host requestable, publication guard, return, internal loops, callBlock");
