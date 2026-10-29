const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modules = path.join(__dirname, "../_flow/modules");
const load = (name) => vm.runInNewContext(fs.readFileSync(path.join(modules, name), "utf8"), {});
const service = load("frontend-catalog-service.js");
const schemas = load("schema-utils.js");
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
// Values made in the module context have its prototypes: compare their JSON.
const same = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
const schemaEnv = {
	normalizeTree: (value) => value === undefined ? undefined : plain(value),
	objectPathParts: (text) => String(text).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean),
	isRuntimeHandle: () => false,
	runtimeHandleType: () => ""
};
const env = {
	normalizeTree: schemaEnv.normalizeTree,
	cloneTree: plain,
	schemaPaths: (schema, prefix) => schemas.paths(schema, prefix, schemaEnv),
	schemaArrayPaths: (schema, prefix) => schemas.arrayPaths(schema, prefix, schemaEnv),
	schemaLeafEntries: (schema, prefix) => schemas.leafEntries(schema, prefix, schemaEnv),
	schemaSimpleType: (schema) => schemas.simpleType(schema, schemaEnv),
	schemaAtPath: (schema, at) => schemas.atPath(schema, at, schemaEnv),
	schemaIsLeaf: schemas.isLeaf,
	schemaIsMetaKey: schemas.isMetaKey
};

const copySource = { category: "local", name: "copy", scopeId: "page" };
const mutation = { op: "replace", path: "frontAst.slots.structure.children[0].props.text" };
const copySchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		items: { type: "array", items: { type: "object", properties: { label: { type: "string" } } } }
	}
};
const definition = {
	kind: "binding",
	bindingSources: [
		{ category: "local", id: "query", label: "local.query", source: { category: "local", name: "query", scopeId: "page" },
			schema: { type: "string" } },
		{ category: "local", id: "theme", label: "local.theme", source: { category: "local", name: "theme", scopeId: "page" },
			schema: { type: "any" } },
		{ category: "local", id: "copy", label: "local.copy", source: copySource, schema: copySchema, mutation },
		{ category: "action", id: "load", label: "load", source: { category: "action", actionId: "load" }, mutation },
		{ category: "iteration", id: "rows", label: "Iterable", source: { category: "iteration", scopeId: "rows", value: "iterable" } },
		{ category: "iteration", id: "rows", label: "Index", source: { category: "iteration", scopeId: "rows", value: "index" } },
		{ category: "route", id: "route", label: "Current route", source: { category: "route", value: "route" } }
	]
};
const document = {
	model: { clientActions: [] },
	tree: {
		sourceMutationPath: "frontAst.slots.structure.children[0]",
		propertyDefinitions: { text: definition },
		children: [{ id: "rows", type: "ForEach", props: { source: { mode: "literal", value: [{ name: "a" }] } } }]
	}
};
const actionSchemas = { load: { type: "object", properties: { total: { type: "integer" } } } };
const original = JSON.stringify(document);
const context = service.bindingSchemaContext(document, actionSchemas);

// The full contract is unchanged: every source with a schema gets its paths and one binding per path.
const full = service.enrichBindingDefinition(definition, context, env, {});
const fullDocument = service.enrichBindingSources(document, actionSchemas, env,
	{ property: "text", bindingTargetPath: "frontAst.slots.structure.children[0]" });
same(plain(fullDocument.tree.propertyDefinitions.text), plain(full),
	"one definition enriched alone equals the same definition enriched in its document");
assert.equal(JSON.stringify(document), original, "enrichment never modifies the provider document");
const fullCopy = full.bindingSources[2];
same(fullCopy.paths.map((entry) => entry.path), ["title", "items", "items[0]", "items[0].label"]);
assert.equal(fullCopy.bindings.length, 4);
assert.ok(fullCopy.leafPaths && fullCopy.arrayPaths && fullCopy.binding);
same(full.bindingSources[4].paths.map((entry) => entry.path), ["[0]", "[0].name", "length"],
	"an iterable lists its length");
assert.equal(full.bindingSources[6], definition.bindingSources[6], "a source without schema is left as it is");

// Lazy: every source is listed, with its root type; containers defer their paths.
const lazy = service.enrichBindingDefinition(definition, context, env, { detail: "lazy" });
assert.equal(lazy.bindingSources.length, definition.bindingSources.length, "every source remains reachable");
const byLabel = Object.fromEntries(lazy.bindingSources.map((candidate) => [candidate.label, candidate]));
same(byLabel["local.copy"].schema, { type: "object" });
assert.equal(byLabel["local.copy"].pathsDeferred, true);
assert.equal(byLabel["local.copy"].paths, undefined);
assert.equal(byLabel["local.copy"].bindings, undefined);
same(byLabel["local.copy"].mutation, mutation, "provider fields are kept");
assert.equal(byLabel.load.pathsDeferred, true);
same(byLabel.load.schema, { type: "object" });
assert.equal(byLabel.Iterable.pathsDeferred, true);
same(byLabel["local.query"].paths, [], "a scalar source has its paths at once");
assert.equal(byLabel["local.query"].pathsDeferred, undefined);
same(byLabel["local.theme"].paths, [], "a leaf source has its paths at once");
same(byLabel.Index.schema, { type: "integer" });
same(byLabel.Index.paths, []);
assert.equal(byLabel["Current route"], definition.bindingSources[6]);
assert.equal(JSON.stringify(document), original);

// The sources a value reads are detailed at once: those a picker shows first.
const value = JSON.stringify({ mode: "expression", parts: [{ kind: "literal", value: "Hello " },
	{ kind: "source", source: copySource, path: [{ kind: "property", name: "items" },
		{ kind: "index", index: 0, source: { category: "iteration", scopeId: "rows", value: "index" } }] }] });
const keys = service.bindingValueSourceKeys(value);
same(Object.keys(keys).sort(), ["iteration|rows|index||", "local|copy|||page"]);
same(Object.keys(service.bindingValueSourceKeys({ mode: "source", source: copySource, path: [] })),
	["local|copy|||page"]);
for (const other of ["ks-page", "", "{not json", JSON.stringify({ mode: "literal", value: "x" }), null, 3]) {
	same(Object.keys(service.bindingValueSourceKeys(other)), [], `no source in ${other}`);
}
const detailed = service.enrichBindingDefinition(definition, context, env, { detail: "lazy", detailedKeys: keys });
const copy = detailed.bindingSources[2];
assert.equal(copy.pathsDeferred, undefined);
same(copy.schema, { type: "object" });
same(copy.paths, fullCopy.paths, "a detailed source lists the paths of the full contract");
assert.equal(copy.bindings, undefined, "a picker needs no binding per path");
assert.equal(detailed.bindingSources[3].pathsDeferred, true, "other containers stay deferred");
same(service.enrichBindingDefinition(definition, context, env, { detail: "lazy",
	detailedKeys: { [service.bindingSourceKey({ category: "iteration", scopeId: "rows", value: "iterable" })]: true } })
	.bindingSources[4].paths, full.bindingSources[4].paths, "a requested iterable lists its length");

// A cache supplies the fields of each source per detail level.
const levels = [];
const cached = service.enrichBindingDefinition(definition, context, env, {
	detail: "lazy",
	detailedKeys: keys,
	candidateCache: (index, key, level, compute) => {
		levels.push(index + ":" + level);
		return compute();
	}
});
same(levels, ["0:paths", "1:paths", "2:paths", "3:summary", "4:summary", "5:paths"]);
same(plain(cached), plain(detailed));

// Keys follow the binding editor (category, identity, value, operation, owner of a state).
assert.equal(service.bindingSourceKey({ category: "theme", value: "theme" }), "theme|theme|theme||");
assert.equal(service.bindingSourceKey({ category: "fullsync", actionId: "docs", operation: "get" }), "fullsync|docs||get|");
assert.equal(service.bindingSourceKey({ category: "local", name: "copy", scopeId: "layout" }), "local|copy|||layout");

console.log("frontend-binding-lazy OK");
