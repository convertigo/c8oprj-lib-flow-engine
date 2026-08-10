const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadModule(file) {
	return vm.runInNewContext(fs.readFileSync(file, "utf8"), {
		JSON,
		Math,
		Number,
		Object,
		String,
		isNaN
	});
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

const root = path.resolve(__dirname, "..");
const cacheUtils = loadModule(path.join(root, "libs/flow/modules/cache-utils.js"));
const expressions = loadModule(path.join(root, "libs/flow/modules/expression-utils.js"));
const tokenCache = cacheUtils.createBoundedMapState(32);
const programCache = cacheUtils.createBoundedMapState(32);
const env = {
	cacheUtils,
	expressionTokenCache: tokenCache,
	expressionProgramCache: programCache,
	isScopePath(value) {
		return /^(request|input|config|local|result|trace|current)(?:\.|$)/.test(String(value || ""));
	},
	normalizeTree(value) {
		return value;
	},
	isRuntimeHandle() {
		return false;
	},
	runtimeHandleSummary(value) {
		return value;
	},
	sanitizeRuntimeValue(value) {
		return value;
	},
	raise(code, message, details, hint) {
		const error = new Error(message);
		error.code = code;
		error.hint = hint || "";
		throw error;
	}
};

function context(input) {
	const ctx = {
		scopes: {
			request: {},
			input,
			config: {},
			local: {},
			result: {},
			trace: {},
			current: null
		}
	};
	ctx.read = function (source) {
		return String(source).split(".").reduce((value, part) => value == null ? undefined : value[part], ctx.scopes);
	};
	return ctx;
}

const source = "input.depth >= 2 && lower(input.name) == \"flow\" ? input.depth + 1 : 0";
assert(expressions.evaluate(context({ depth: 2, name: "FLOW" }), source, env) === 3,
	"compiled expression returned the wrong true branch");
assert(expressions.evaluate(context({ depth: 1, name: "FLOW" }), source, env) === 0,
	"cached expression captured values from the first context");
assert(programCache.size === 1 && programCache.misses === 1 && programCache.hits === 1,
	"expression program cache did not record one miss followed by one hit");
assert(tokenCache.size === 1 && tokenCache.misses === 1,
	"expression token cache should only tokenize the program once");

const compiled = expressions.compile("input.name.trim() + \" ready\"", env);
assert(compiled(context({ name: "  Flow  " })) === "Flow ready",
	"compiled method expression returned the wrong value");
assert(compiled(context({ name: "  Runtime  " })) === "Runtime ready",
	"compiled method expression captured the first context");

assert(expressions.evaluate(context({ value: null, fallback: "ok" }),
	"input.value ?? input.fallback", env) === "ok", "compiled nullish expression changed semantics");

let invalid = null;
try {
	expressions.evaluate(context({ value: "x" }), "unknown(input.value)", env);
} catch (error) {
	invalid = error;
}
assert(invalid && invalid.code === "INVALID_EXPRESSION",
	"compiled expression did not preserve unknown-function diagnostics");

cacheUtils.clearBoundedMap(programCache);
assert(programCache.size === 0 && programCache.clears === 1,
	"expression program cache did not clear deterministically");

console.log("expression program cache tests passed");
