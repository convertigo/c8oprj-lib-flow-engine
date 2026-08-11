const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/runtime-handle-utils.js"), "utf8");
const runtimeHandles = vm.runInNewContext(source, {});
const env = {
	raise(code, message) {
		const error = new Error(message);
		error.code = code;
		throw error;
	}
};

const serializable = { rows: [{ id: 1 }, { id: 2 }] };
const copy = runtimeHandles.sanitizeSerializable(serializable, "result", env);
assert.deepStrictEqual(JSON.parse(JSON.stringify(copy)), serializable);
assert.notStrictEqual(copy, serializable);
assert.notStrictEqual(copy.rows, serializable.rows);

const circular = { name: "root" };
circular.self = circular;
assert.strictEqual(runtimeHandles.sanitizeSerializable(circular, "result", env).self, "[Circular]");

const handle = {
	__flowHandle: true,
	__flowHandleId: "h1",
	__flowHandleType: "test",
	__flowHandleState: "open"
};
assert.throws(
	() => runtimeHandles.sanitizeSerializable({ nested: handle }, "result", env),
	(error) => error.code === "RUNTIME_HANDLE_IN_RESULT" && /result/.test(error.message)
);
assert.deepStrictEqual(
	JSON.parse(JSON.stringify(runtimeHandles.sanitize({ nested: handle }, env))),
	{ nested: { handle: "test", id: "h1", state: "open" } }
);

console.log("runtime-handle-utils OK");
