// Compare actual ordinary and captured executions, including resolution order and lazy fallbacks.
const fs = require("node:fs"),
	path = require("node:path"),
	vm = require("node:vm"),
	assert = require("node:assert/strict");
const root = path.join(__dirname, "../_flow/blocks");
function load(name) {
	const s = fs.readFileSync(path.join(root, name + ".block.js"), "utf8");
	return vm.runInNewContext(s.slice(s.indexOf("(function () {")), { Date: { now: () => 123456 } });
}
function normalized(value) {
	if (value === undefined) return "<undefined>";
	if (typeof value === "function") return "<function>";
	if (typeof value === "number" && !Number.isFinite(value)) return String(value);
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return Array.from(value, normalized);
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((k) => [k, normalized(value[k])])
	);
}
function context(bindings, options = {}) {
	const events = [],
		scopes = { local: {}, current: null };
	const session = new Map(Object.entries(options.session || {}));
	let user = options.user || null;
	const state = {
		httpSession: {
			getAttribute(k) {
				events.push(["session.get", k]);
				return session.has(k) ? session.get(k) : null;
			},
			setAttribute(k, v) {
				events.push(["session.set", k, v]);
				session.set(k, v);
			},
			removeAttribute(k) {
				events.push(["session.remove", k]);
				session.delete(k);
			}
		},
		getAuthenticatedUser() {
			return user;
		},
		setAuthenticatedUser(v) {
			events.push(["user.set", v]);
			user = v;
		},
		removeAuthenticatedUser() {
			events.push(["user.remove"]);
			user = null;
		}
	};
	function resolve(value) {
		if (typeof value === "string" && value[0] === "$") {
			events.push(["resolve", value]);
			const v = bindings[value];
			return typeof v === "function" ? v(ctx) : v;
		}
		if (Array.isArray(value)) return value.map(resolve);
		if (value && typeof value === "object")
			return Object.fromEntries(Object.keys(value).map((k) => [k, resolve(value[k])]));
		return value;
	}
	const ctx = new Proxy(
		{
			events,
			scopes,
			props: (node) => node.props,
			input: (p) => resolve(p.value),
			expr: resolve,
			template: resolve,
			read: resolve,
			readObjectPath: (v, k) =>
				String(k || "")
					.split(".")
					.filter(Boolean)
					.reduce((a, k) => a?.[k], v),
			convertigoContext() {
				events.push(["context"]);
				return state;
			},
			runNodes(nodes) {
				events.push(["children", nodes]);
				return 41;
			},
			canContinue: () => true,
			collections: {
				declare(...args) {
					events.push(["declare", ...args]);
					return args.at(-1);
				},
				append(...args) {
					events.push(["append", ...args]);
					return args.at(-1);
				}
			},
			lib(name) {
				events.push(["library", name]);
				return new Proxy(
					{},
					{
						get:
							(_, op) =>
							(...args) => {
								events.push(["rows." + op, ...args]);
								return args[0];
							}
					}
				);
			}
		},
		{
			get(target, key) {
				if (key in target) return target[key];
				return (...args) => {
					events.push([key, ...args]);
					return { content: "fixture", method: key, args };
				};
			}
		}
	);
	return ctx;
}
let checks = 0;
function parity(name, props, bindings = {}, options = {}) {
	const a = context({ ...bindings }, options),
		b = context({ ...bindings }, options),
		node = { props, nodes: options.children, fields: options.fields };
	const implementation = load(name);
	let expected, actual, errorA, errorB;
	try {
		expected = implementation.run(a, node);
	} catch (e) {
		errorA = e;
	}
	try {
		const args = implementation.debug.resolve(b, node);
		actual = implementation.debug.run(b, node, args);
	} catch (e) {
		errorB = e;
	}
	assert.equal(errorB?.message, errorA?.message, name + " exception");
	assert.deepEqual(normalized(actual), normalized(expected), name + " output");
	assert.deepEqual(normalized(b.events), normalized(a.events), name + " order/evaluation/side effects");
	checks++;
}
for (const name of [
	"number/add",
	"number/subtract",
	"compare/equal",
	"compare/notEqual",
	"compare/less",
	"compare/greater"
]) {
	for (const [l, r] of [
		[2, 3],
		[0, 0],
		["2", 2],
		[null, 4],
		[false, true]
	])
		parity(name, { left: "$l", right: "$r" }, { $l: l, $r: r });
}
for (const condition of [true, false, 0, 1, null])
	parity(
		"number/choose",
		{ condition: "$c", whenTrue: "$yes", whenFalse: "$no" },
		{
			$c: condition,
			$yes: () => {
				if (!condition) throw Error("unused yes");
				return 10;
			},
			$no: () => {
				if (condition) throw Error("unused no");
				return 20;
			}
		}
	);
for (const name of ["list/count", "list/first", "list/last", "list/sum"])
	for (const items of [[], [1, 2, 3], null])
		parity(name, { items: "$items", fallback: "$fallback" }, { $items: items, $fallback: 9 });
for (const count of [0, 2, undefined, ""])
	parity("list/take", { items: "$items", offset: 1, count }, { $items: [1, 2, 3, 4] });
for (const value of [undefined, null, false, 42, "yes", "x"]) {
	for (const name of ["value/toText", "value/toNumber", "value/toBoolean"])
		parity(name, { value: "$value", fallback: "$fallback" }, { $value: value, $fallback: 9 });
	parity("text/trim", { text: "$value" }, { $value: value });
	parity("text/urlEncode", { text: "$value" }, { $value: value });
}
parity(
	"value/toText",
	{ value: "$value", fallback: "$unused" },
	{
		$value: 42,
		$unused: () => {
			throw Error("unused fallback");
		}
	}
);
for (const name of ["text/split", "text/lines"])
	parity(
		name,
		{ text: "$text", separator: ",", trim: "$trim", removeEmpty: "$empty", skipEmpty: "$empty" },
		{ $text: name === "text/split" ? " a,, b " : " a\r\n\n b ", $trim: true, $empty: true }
	);
parity(
	"text/replace",
	{ text: "$text", search: "$search", replacement: "$replacement", all: "$all", caseSensitive: "$case" },
	{ $text: "AbAb", $search: "ab", $replacement: "c", $all: true, $case: false }
);
for (const text of ['{"value":42}', "broken", 42])
	parity("json/parse", { text: "$text" }, { $text: text });
parity(
	"json/safeParse",
	{ text: "$text", truncated: "$unused" },
	{
		$text: '{"ok":true}',
		$unused: () => {
			throw Error("unused truncated");
		}
	}
);
parity(
	"json/safeParse",
	{ text: "$text", truncated: "$truncated" },
	{ $text: "broken", $truncated: true }
);
parity(
	"json/select",
	{ source: "$source", path: "nested.value" },
	{ $source: { nested: { value: 42 } } }
);
for (const name of ["json/array", "json/map"])
	parity(name, { path: "local.rows", itemType: "number", valueType: "string" });
for (const children of [undefined, [{ id: "child" }]])
	parity("json/push", { path: "local.rows", value: "$value" }, { $value: 42 }, { children });
parity("template/render", { template: "$template" }, { $template: "rendered" });
for (const name of ["object/keys", "object/values", "object/firstEntry", "object/pick"])
	parity(
		name,
		{ source: "$source", keys: "nested.value,x" },
		{ $source: { nested: { value: 42 }, x: 9 } }
	);
parity(
	"object/merge",
	{ target: "$target", source: "$source" },
	{ $target: { a: 1 }, $source: { b: 2 } }
);
for (const op of ["read", "select", "distinct", "group", "formatCells"])
	parity("rows/" + op, { rows: "$rows", fields: "$fields" }, { $rows: [{ a: 1 }], $fields: ["a"] });
for (const op of ["add", "compare", "diff", "format", "isValid", "parse", "today"])
	parity("date/" + op, { value: "$date" }, { $date: "2026-11-03" });
parity("date/now", { format: "timestamp" }, {});
parity("date/now", { format: "iso" }, {});
for (const name of [
	"session/authenticatedUser",
	"cache/protect",
	"cache/preventStore",
	"cache/info",
	"cache/clear",
	"json/object"
])
	parity(name, {});
parity("session/authenticate", { user: "$user" }, { $user: "neutral" });
parity("session/authenticate", { user: "" });
parity("session/set", { key: "$key", value: "$value" }, { $key: "neutral", $value: { n: 42 } });
for (const session of [{}, { neutral: "kept" }]) {
	parity(
		"session/get",
		{ key: "$key", default: "$default" },
		{ $key: "neutral", $default: 9 },
		{ session }
	);
	parity("session/remove", { key: "$key" }, { $key: "neutral" }, { session });
}
parity(
	"session/get",
	{ key: "neutral", default: "$unused" },
	{
		$unused: () => {
			throw Error("unused default");
		}
	},
	{ session: { neutral: 42 } }
);
parity("asset/read", { path: "$path", allowLarge: false }, { $path: "fixture.txt" });
for (const dir of ["flow/code", "flow/source", "resource", "type", "authoring", "block"]) {
	function walk(dir) {
		for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
			const name = dir + "/" + ent.name;
			if (ent.isDirectory()) walk(name);
			else if (name.endsWith(".block.js")) {
				const id = name.slice(0, -9);
				const impl = load(id);
				if (
					impl?.debug &&
					!["type/create", "block/code/set", "block/duplicate", "block/create"].includes(id)
				)
					parity(
						id,
						{
							name: "neutral",
							flowName: "neutral",
							out: "do-not-evaluate",
							text: "$literalSource",
							path: "fixture.txt"
						},
						{ $literalSource: "rendered" }
					);
			}
		}
	}
	walk(dir);
}
// Conversion and target-copy side effects must remain before the following argument read.
parity(
	"number/add",
	{ left: "$left", right: "$right" },
	{
		$left: (ctx) => ({
			valueOf() {
				ctx.events.push(["coerce-left"]);
				return 4;
			}
		}),
		$right: (ctx) => {
			ctx.events.push(["right-read"]);
			return 5;
		}
	}
);
parity(
	"object/merge",
	{ target: "$target", source: "$source" },
	{
		$target: (ctx) => {
			const out = {};
			Object.defineProperty(out, "a", {
				enumerable: true,
				get() {
					ctx.events.push(["read-target"]);
					return 1;
				}
			});
			return out;
		},
		$source: (ctx) => {
			ctx.events.push(["source-read"]);
			return { b: 2 };
		}
	}
);
for (const name of ["list/first", "list/last"])
	parity(
		name,
		{ items: "$items", fallback: "$unused" },
		{
			$items: [42],
			$unused: () => {
				throw Error("unused fallback");
			}
		}
	);
for (const name of ["block/create", "block/duplicate", "type/create"])
	parity(name, {
		name: "neutral",
		fromName: "source",
		toName: "target",
		overwrite: "true",
		descriptorSource: "literal"
	});
// Captured values survive caller binding changes; the consume path must not re-evaluate.
for (const name of ["number/add", "text/trim", "json/parse", "object/keys"]) {
	const bindings = { $v: name === "json/parse" ? "42" : name === "object/keys" ? { a: 1 } : 7 },
		ctx = context(bindings),
		node = { props: { left: "$v", right: 1, text: "$v", source: "$v" } };
	const impl = load(name),
		args = impl.debug.resolve(ctx, node),
		before = ctx.events.length;
	bindings.$v = 999;
	impl.debug.run(ctx, node, args);
	assert.equal(ctx.events.length, before, name + " second resolution");
	checks++;
}
console.log(
	checks +
		" ordinary/captured parity checks passed, including lazy branches, conversion order, side effects and caller changes."
);
