var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
var service = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/flow-tree-service.js"), "UTF-8")));
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function assertTrue(value, message) { if (!value) throw new Error(message); }
var env = { normalizeTree: clone, compact: JSON.stringify,
	raise: function (code, message) { var error = new Error(message); error.code = code; throw error; } };
function node(path, traits, slots, owner, slotId) {
	return { id: path, sourcePath: "/example", sourceMutationPath: path, sourceWritable: true,
		traits: traits, slots: slots, children: [],
		parentSlot: owner ? { sourcePath: "/example", ownerPath: owner, slotId: slotId } : undefined };
}
function explicit(path, accepts) { return { sourceMutationPath: path, accepts: accepts }; }
function inherited(path) { return { sourceMutationPath: path, acceptsFrom: "parentSlot" }; }
function fixture() {
	var root = node("root", [], {
		content: explicit("content", ["example.text", "example.control", "example.event"]),
		special: explicit("special", ["example.field", "example.control", "example.event"]),
		closed: explicit("closed", []), actions: explicit("actions", ["example.action"])
	});
	var control = node("control", ["example.control"], { body: inherited("body"), empty: inherited("empty") }, "root", "content");
	var nested = node("nested", ["example.control"], { body: inherited("nested.body") }, "control", "body");
	var text = node("text", ["example.text"], {}, "nested", "body");
	var event = node("event", ["example.event"], { actions: explicit("event.actions", ["example.action"]) }, "control", "body");
	var action = node("action", ["example.action"], {}, "event", "actions");
	// A visual slot mirror is not an authored candidate, even with unrelated traits.
	var mirror = node("body", ["visual.folder"], { body: inherited("body") }, "control", "body");
	var other = node("other", ["example.control"], { body: inherited("other.body") }, "root", "content");
	// Semantic ownership, not visual ancestry, defines the subtree.
	return { children: [text, mirror, event, root, action, nested, control, other] };
}
function move(tree, from, to, extra) {
	var before = JSON.stringify(tree);
	try { return service.authoringMoveFromTreeRequest(Object.assign({sourcePath: "/example", from: from, path: to}, extra || {}), tree, env); }
	finally { assertTrue(before === JSON.stringify(tree), "Validation must not modify the caller/cache tree"); }
}
function reject(tree, from, to, code, extra) {
	var actual;
	try { move(tree, from, to, extra); } catch (e) { actual = e.code; }
	assertTrue(actual === code, "Expected " + code + ", got " + actual + " (" + from + " -> " + to + ")");
}
var tree = fixture();
assertTrue(move(tree, "control", "other.body").path === "other.body", "Compatible inherited subtree must move");
assertTrue(move(tree, "text", "other").path === "other.body", "One declared slot allows a node destination");
reject(tree, "text", "actions", "INCOMPATIBLE_AUTHORING_SLOT");
reject(tree, "text", "closed", "INCOMPATIBLE_AUTHORING_SLOT");
reject(tree, "control", "special", "INCOMPATIBLE_AUTHORING_SLOT"); // nested text incompatible after reparent
reject(tree, "control", "nested.body", "INVALID_AUTHORING_MOVE");
reject(tree, "control", "body", "INVALID_AUTHORING_MOVE");
reject(tree, "text", "root", "INVALID_AUTHORING_DESTINATION");
reject(tree, "text", "invented.slot", "INVALID_AUTHORING_DESTINATION");
reject(tree, "body", "content", "INVALID_AUTHORING_MOVE");
reject(tree, "root", "content", "UNRESOLVED_AUTHORING_SLOT");
reject(tree, "missing", "content", "INVALID_AUTHORING_MOVE");
var withoutText = fixture();
withoutText.children = withoutText.children.filter(function (n) { return n.id !== "text"; });
assertTrue(move(withoutText, "control", "special").ok, "Explicit event action slot must not inherit content restrictions");
assertTrue(move(tree, "stale.path", "content", { fromId: "text" }).from === "text", "Stable id must return validated source path");
var duplicate = fixture();
duplicate.children.push(node("duplicate", ["example.text"], {}, "root", "content"));
duplicate.children[duplicate.children.length - 1].id = "text";
reject(duplicate, "text", "content", "INVALID_AUTHORING_MOVE", { fromId: "text" });
var readonly = fixture();
readonly.children[3].slots.content.sourceWritable = false;
reject(readonly, "text", "content", "READ_ONLY_AUTHORING_TARGET");
readonly = fixture();
readonly.children[6].readOnly = true;
reject(readonly, "control", "content", "READ_ONLY_AUTHORING_TARGET");
readonly = fixture();
readonly.children[3].slots.content.sourceWritable = false;
reject(readonly, "control", "other.body", "READ_ONLY_AUTHORING_TARGET");
var untyped = fixture();
untyped.children[0].traits = [];
reject(untyped, "text", "content", "INCOMPATIBLE_AUTHORING_SLOT");
var malformed = fixture();
malformed.children[6].slots.empty.acceptsFrom = "visualParent";
reject(malformed, "control", "content", "INVALID_AUTHORING_SLOT");
var secondFile = fixture();
var secondRoot = clone(secondFile.children[3]);
secondRoot.sourcePath = "/another";
secondRoot.slots.content.accepts = [];
secondFile.children.unshift(secondRoot);
assertTrue(move(secondFile, "text", "content").ok, "Identical AST paths in another file must not participate");
// The same service also accepts serialized virtual bean metadata.
var virtual = fixture();
virtual.children.forEach(function (n) {
	n.info = JSON.stringify({ sourcePath: n.sourcePath, sourceMutationPath: n.sourceMutationPath,
		sourceWritable: n.sourceWritable, parentSlot: n.parentSlot, traits: n.traits, slots: n.slots });
	["sourcePath", "sourceMutationPath", "sourceWritable", "parentSlot", "traits", "slots"].forEach(function (key) { delete n[key]; });
});
assertTrue(move(virtual, "control", "other.body").ok, "Virtual beans and provider AST must share validation");
reject(virtual, "control", "special", "INCOMPATIBLE_AUTHORING_SLOT");
print("authoring-move-contract OK");

function insertionTarget(tree, path, options) {
	return service.authoringInsertTargetFromTreeRequest(Object.assign({sourcePath: "/example", path: path, op: "append"}, options || {}), tree, env);
}
function inserted(tree, target) {
	var before = JSON.stringify(tree);
	try { return service.authoringProposedSubtreeFromTreeRequest(Object.assign({sourcePath: "/example"}, target), tree, env); }
	finally { assertTrue(before === JSON.stringify(tree), "Inserted subtree validation must preserve the input tree"); }
}
function fails(fn, code) {
	var actual;
	try { fn(); } catch (e) { actual = e.code; }
	assertTrue(actual === code, "Expected " + code + ", got " + actual);
}
var target = insertionTarget(tree, "special");
assertTrue(target.index === 0 && target.count === 0, "Empty destination insertion index");
var proposed = fixture();
proposed.children.push(node("added", ["example.control"], { body: inherited("added.body") }, "root", "special"));
proposed.children.push(node("added.field", ["example.field"], {}, "added", "body"));
assertTrue(inserted(proposed, target).path === "added", "Validate the whole inserted subtree in its inherited context");
proposed.children[proposed.children.length - 1].traits = ["example.text"];
fails(function () { inserted(proposed, target); }, "INCOMPATIBLE_AUTHORING_SLOT");
fails(function () { inserted(tree, target); }, "INVALID_AUTHORING_RESULT");
proposed.children.push(node("unexpected", ["example.field"], {}, "root", "special"));
fails(function () { inserted(proposed, target); }, "INVALID_AUTHORING_RESULT");
fails(function () { insertionTarget(tree, "closed"); }, "INCOMPATIBLE_AUTHORING_SLOT");
fails(function () { insertionTarget(tree, "invented"); }, "INVALID_AUTHORING_DESTINATION");
fails(function () { insertionTarget(tree, "root"); }, "INVALID_AUTHORING_DESTINATION");
fails(function () { insertionTarget(readonly, "content"); }, "READ_ONLY_AUTHORING_TARGET");
fails(function () { insertionTarget(tree, "content", {op: "insert", index: 0.5}); }, "INVALID_AUTHORING_INSERT");
fails(function () { insertionTarget(tree, "content", {op: "insert", index: "no"}); }, "INVALID_AUTHORING_INSERT");
assertTrue(insertionTarget(tree, "other").path === "other.body", "Normalize an unambiguous node destination");
assertTrue(insertionTarget(tree, "content", {op: "insert", index: -8}).index === 0, "Clamp insertion before first child");
assertTrue(insertionTarget(tree, "content", {op: "insert", index: 100}).index === 2, "Clamp insertion after last child");
assertTrue(insertionTarget(tree, "body").count === 2, "Visual slot mirrors must not count as children");
assertTrue(insertionTarget(virtual, "body").count === 2, "Virtual metadata shares the same child counting");
proposed = fixture();
target = insertionTarget(proposed, "content", {op: "insert", index: 0});
proposed.children.unshift(node("added", ["example.text"], {}, "root", "content"));
assertTrue(inserted(proposed, target).path === "added", "Indexed insertion must validate the inserted node, not the last sibling");
print("authoring-insert-contract OK");

function selection(tree, paths) {
	var before = JSON.stringify(tree);
	try { return service.authoringReplaceSelectionTargetFromTreeRequest({sourcePath: "/example", paths: paths}, tree, env); }
	finally { assertTrue(before === JSON.stringify(tree), "Selection validation must preserve the tree"); }
}
var selected = selection(tree, ["other", "control"]);
assertTrue(selected.path === "content" && selected.index === 0 && selected.resultCount === 1, "Wrapping replaces siblings with one child");
assertTrue(selected.paths.join(",") === "control,other", "Use semantic sibling order, not selection order");
assertTrue(selection(virtual, ["other", "control"]).paths.join(",") === "control,other", "Virtual beans use the same selection contract");
assertTrue(selection(tree, ["other"]).resultCount === 2, "Single subtree replacement preserves sibling count");
[[], "control", ["control", "control"], ["missing"], ["control", "nested"], ["text", "action"], ["body"]].forEach(function (paths) {
	fails(function () { selection(tree, paths); }, "INVALID_AUTHORING_SELECTION");
});
fails(function () { selection(readonly, ["control"]); }, "READ_ONLY_AUTHORING_TARGET");
var locked = fixture();
locked.children[6].readOnly = true;
fails(function () { selection(locked, ["control"]); }, "READ_ONLY_AUTHORING_TARGET");
var wrapped = fixture();
wrapped.children.push(node("wrapper", ["example.control"], {body: inherited("wrapper.body")}, "root", "content"));
[wrapped.children[6], wrapped.children[7]].forEach(function (n) { n.parentSlot.ownerPath = "wrapper"; n.parentSlot.slotId = "body"; });
assertTrue(inserted(wrapped, selected).path === "wrapper", "Validate moved descendants in the wrapper's inherited slot");
wrapped.children[wrapped.children.length - 1].slots.body = explicit("wrapper.body", ["example.control"]);
fails(function () { inserted(wrapped, selected); }, "INCOMPATIBLE_AUTHORING_SLOT");
fails(function () { inserted(tree, selected); }, "INVALID_AUTHORING_RESULT");
print("authoring-replace-selection-contract OK");
