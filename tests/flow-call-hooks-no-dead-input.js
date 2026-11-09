// The call hook only summarizes and analyzes the node; input conversion belongs to the block.
var root = new java.io.File(arguments[0]);
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(root, "blocks/flow/call.hooks.js"), "UTF-8"));
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
assert(!/function inputValue\s*\(/.test(source), "the hook still defines an unreachable input converter");
var flowSummary = {
	text: function (value) { return value; },
	output: function (node, value) { return value; }
};
var hook = eval(source);
assert(hook.displayName({ props: { flow: "Echo" } }) === "Echo", "call summary still works");
var path = "";
hook.analyze({
	props: function (node) { return node.props; },
	outputPath: function () { return "result.echo"; },
	addPath: function (value) { path = value; }
}, { props: { flow: "Echo" } });
assert(path === "result.echo", "call analysis still records the output path");
print("flow-call-hooks-no-dead-input: " + checks + " checks passed");
