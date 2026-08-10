const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../libs/flow/modules/scope-path-utils.js"), "utf8");
const paths = vm.runInNewContext(source, {});
let resultChecks = 0;
const env = {
	scopeNames: ["input", "local", "result"],
	assertNoRuntimeHandle() {
		resultChecks += 1;
	},
	raise(code, message) {
		const error = new Error(message);
		error.code = code;
		throw error;
	},
};

const writeLocal = paths.compileWriteScopePath("local.deep.value", env);
const first = { input: {}, local: {}, result: {} };
const second = { input: {}, local: {}, result: {} };
assert.strictEqual(writeLocal(first, 42), 42);
assert.strictEqual(writeLocal(second, 84), 84);
assert.strictEqual(JSON.stringify(first.local), JSON.stringify({ deep: { value: 42 } }));
assert.strictEqual(JSON.stringify(second.local), JSON.stringify({ deep: { value: 84 } }));
assert.strictEqual(resultChecks, 0);

const writeResult = paths.compileWriteScopePath("result.value", env);
writeResult(first, "ok");
writeResult(second, "again");
assert.strictEqual(resultChecks, 2, "compiled result writes skipped the runtime-handle guard");

assert.throws(() => paths.compileWriteScopePath("unknown.value", env),
	(error) => error.code === "INVALID_SCOPE_PATH");

console.log("scope path compiled write tests passed");
