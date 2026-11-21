// session.set then session.get gives the value with its type (bench of 21/11, L34F: an object stored with session.set
// came back as its JSON text and the Flow reading its fields failed). The attribute keeps the text other readers of the
// session see; a mark next to it lets session.get read an object, a list, a number or a boolean back from that text, and
// only while nothing else wrote the key. A text, a value stored before, and a key written by another reader stay texts.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function implementation(name) {
	const source = fs.readFileSync(path.join(__dirname, "../_flow/blocks/session", `${name}.block.js`), "utf8");
	return vm.runInNewContext(source.slice(source.indexOf("\n(function") + 1), {});
}

const attributes = new Map();
const httpSession = {
	setAttribute(key, value) { attributes.set(key, value); },
	getAttribute(key) { return attributes.has(key) ? attributes.get(key) : null; },
	removeAttribute(key) { attributes.delete(key); },
};
const ctx = {
	props(node) { return node.props || {}; },
	template(value) { return value; },
	input(props) { return props.value; },
	convertigoContext() { return { httpSession }; },
};
const set = implementation("set"), get = implementation("get"), remove = implementation("remove");
function stored(key, value) { set.run(ctx, { props: { key, value } }); return get.run(ctx, { props: { key } }); }
// the blocks run in their own context: values are compared as JSON, their type checked apart
function same(actual, expected) { assert.strictEqual(typeof actual, typeof expected); assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected)); }
function viaDebug(block, props) { const args = block.debug.resolve(ctx, { props }); return block.debug.run(ctx, { props }, args); }

// each type comes back as it was stored, and the attribute holds the text other readers see
const filters = { search: "abc", amounts: [1, 2.5], nested: { active: true }, none: null };
same(stored("filters", filters), filters);
assert.strictEqual(attributes.get("filters"), JSON.stringify(filters));
same(stored("ids", [3, 1]), [3, 1]);
assert.strictEqual(stored("count", 42), 42);
assert.strictEqual(stored("flag", false), false);
assert.strictEqual(stored("text", "123"), "123");
assert.strictEqual(stored("json text", "{\"a\":1}"), "{\"a\":1}");
assert.strictEqual(stored("empty", null), "");
// a text written over an object, and an object written over a text, keep the type of the last write
assert.strictEqual(stored("filters", "plain"), "plain");
same(stored("filters", { a: 1 }), { a: 1 });
// another writer of the key (a sequence, a value stored before this version) leaves a text
attributes.set("filters", "{\"b\":2}");
assert.strictEqual(get.run(ctx, { props: { key: "filters" } }), "{\"b\":2}");
attributes.set("legacy", "{\"a\":1}");
assert.strictEqual(get.run(ctx, { props: { key: "legacy" } }), "{\"a\":1}");
// the default of a missing key, the removal of the mark with the key
same(get.run(ctx, { props: { key: "missing", default: { a: 1 } } }), { a: 1 });
set.run(ctx, { props: { key: "gone", value: { a: 1 } } });
assert.strictEqual(remove.run(ctx, { props: { key: "gone" } }), true);
assert.ok(![...attributes.keys()].some((key) => key.endsWith("gone")), "the key and its mark are removed: " + [...attributes.keys()]);
// the debugger runs the same reading
viaDebug(set, { key: "debugged", value: { a: [1] } });
same(viaDebug(get, { key: "debugged" }), { a: [1] });

console.log("session typed values passed");
