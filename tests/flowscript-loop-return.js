// The body of forEach, while and file.forEachLine is written as a callback ($$nodes: function () { ... }), so a bare
// return there reads as the return of a JavaScript forEach callback: skip this item. It stopped the whole Flow
// instead (and, lowered to the value "${}", answered that text), so every following item was silently ignored. A bare
// return in a loop body is now the block next: the loop goes on with the next item. A return with a value there keeps
// leaving the Flow for existing sources, with a warning, and code-set refuses it.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-loop-return-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	// A project block written in FlowScript with its own loop: its next must not end an item of the caller's loop.
	files.writeStringToFile(new java.io.File(project, "_flow/blocks/probe/keepOdd.block.js"), [
		'const _meta = {',
		'  "sourceVersion": 2,',
		'  "version": 1,',
		'  "description": "Keeps the odd numbers of a list.",',
		'  "properties": { "items": { "kind": "expression", "type": "array", "description": "Numbers." } },',
		'  "outputs": { "out": { "type": "object", "properties": { "kept": { "type": "array" } } } },',
		'  "targets": ["backend"],',
		'  "implementations": { "backend": { "runtime": "flow" } },',
		'}',
		'',
		'function keepOdd({ input, config, result }) {',
		'  local.kept = []',
		'  forEach({',
		'    $$id: "eachNumber",',
		'    items: input.items,',
		'    $$nodes: function () {',
		'      if (current % 2 === 0) {',
		'        return',
		'      }',
		'      json.push({ $$id: "keepNumber", path: "local.kept", value: current })',
		'    },',
		'  })',
		'  return { kept: local.kept }',
		'}',
		''
	].join("\n"), "UTF-8");
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function flow(body) {
		return 'const _flow = { sourceVersion: 2 }\n\nfunction Items({ input, config, result, local }) {\n' + body + '\n}\n';
	}
	function run(source) {
		var out = api("run", { flowSource: source, input: {}, includeTrace: false });
		assert(out.ok, "The run failed: " + JSON.stringify(out.error) + "\n" + source);
		return out.result;
	}
	function diagnostics(source, code) {
		var out = api("flowSourceValidate", { name: "Items", code: source });
		return { out: out, found: (out.diagnostics || []).filter(function (d) { return d.code === code; }) };
	}
	function nodesOf(list, block, found) {
		found = found || [];
		(list || []).forEach(function (node) {
			if (node.block === block) found.push(node);
			Object.keys(node).forEach(function (key) { if (key !== "props" && Array.isArray(node[key])) nodesOf(node[key], block, found); });
		});
		return found;
	}

	// The case seen in an application: return in an if of the body skips that item, the loop and the Flow go on.
	var skip = flow([
		'  local.seen = []',
		'  forEach({',
		'    $$id: "eachName",',
		'    items: ["a", "b", "c"],',
		'    $$nodes: function () {',
		'      if (current === "b") {',
		'        return',
		'      }',
		'      json.push({ $$id: "keep", path: "local.seen", value: current })',
		'    },',
		'  })',
		'  result.seen = local.seen',
		'  result.after = true'
	].join("\n"));
	var skipped = run(skip);
	assert(JSON.stringify(skipped) === '{"seen":["a","c"],"after":true}', "return skips one item; the next items and the rest of the Flow run: " + JSON.stringify(skipped));
	var compiled = diagnostics(skip, "FLOWSCRIPT_RETURN_VALUE_IN_LOOP");
	assert(compiled.out.ok && compiled.found.length === 0, "A bare return in a loop is valid without warning: " + JSON.stringify(compiled.out.diagnostics));
	assert(nodesOf(compiled.out.definition.nodes, "next").length === 1 && nodesOf(compiled.out.definition.nodes, "return").length === 0,
		"The bare return of the body compiles to the block next: " + JSON.stringify(compiled.out.definition.nodes));

	// A tree edit renders the model again: next stays the next item, a return that leaves stays one.
	var rendered = api("flowSourceValidate", { flowSource: compiled.out.source });
	assert(rendered.ok && rendered.code.indexOf("next({") !== -1 && JSON.stringify(run(rendered.code)) === JSON.stringify(skipped),
		"The rendered source keeps the next item: " + (rendered.code || JSON.stringify(rendered)));

	// Directly in the body, in a canonical if, in nested loops (the inner return ends the inner item only) and in while.
	var direct = run(flow([
		'  local.seen = []',
		'  forEach({',
		'    $$id: "eachName",',
		'    items: ["a", "b"],',
		'    $$nodes: function () {',
		'      json.push({ $$id: "keep", path: "local.seen", value: current })',
		'      return',
		'      json.push({ $$id: "never", path: "local.seen", value: "never" })',
		'    },',
		'  })',
		'  result.seen = local.seen'
	].join("\n")));
	assert(JSON.stringify(direct.seen) === '["a","b"]', "A return at the top of the body ends each item there: " + JSON.stringify(direct));
	var canonical = run(flow([
		'  local.seen = []',
		'  forEach({',
		'    $$id: "eachName",',
		'    items: [1, 2, 3],',
		'    $$nodes: function () {',
		'      if({ $$id: "skipTwo", condition: current === 2, $$then: function () {',
		'        return',
		'      } })',
		'      json.push({ $$id: "keep", path: "local.seen", value: current })',
		'    },',
		'  })',
		'  result.seen = local.seen'
	].join("\n")));
	assert(JSON.stringify(canonical.seen) === '[1,3]', "The branches of a canonical if are not callbacks: " + JSON.stringify(canonical));
	var nested = run(flow([
		'  local.pairs = []',
		'  forEach({',
		'    $$id: "eachRow",',
		'    items: [1, 2],',
		'    $$nodes: function () {',
		'      local.row = current',
		'      forEach({',
		'        $$id: "eachColumn",',
		'        items: [1, 2, 3],',
		'        $$nodes: function () {',
		'          if (current === local.row) {',
		'            return',
		'          }',
		'          json.push({ $$id: "keepPair", path: "local.pairs", value: local.row * 10 + current })',
		'        },',
		'      })',
		'      json.push({ $$id: "rowDone", path: "local.pairs", value: local.row * 100 })',
		'    },',
		'  })',
		'  result.pairs = local.pairs'
	].join("\n")));
	assert(JSON.stringify(nested.pairs) === '[12,13,100,21,23,200]', "An inner return ends the inner item only: " + JSON.stringify(nested));
	var counted = run(flow([
		'  local.i = 0',
		'  local.odd = []',
		'  local.loop = while({',
		'    $$id: "count",',
		'    condition: local.i < 5,',
		'    $$nodes: function () {',
		'      local.i = local.i + 1',
		'      if (local.i % 2 === 0) {',
		'        return',
		'      }',
		'      json.push({ $$id: "keepOdd", path: "local.odd", value: local.i })',
		'    },',
		'  })',
		'  result.odd = local.odd',
		'  result.iterations = local.loop.iterations'
	].join("\n")));
	assert(JSON.stringify(counted) === '{"odd":[1,3,5],"iterations":5}', "In while, return goes on with the next iteration: " + JSON.stringify(counted));

	// A block with its own loop, called in the body of a loop: each frame keeps its items.
	var framed = run(flow([
		'  local.kept = []',
		'  forEach({',
		'    $$id: "eachGroup",',
		'    items: [[1, 2, 3], [], [4, 5]],',
		'    $$nodes: function () {',
		'      if (current.length === 0) {',
		'        return',
		'      }',
		'      local.part = probe.keepOdd({ $$id: "odd", items: current })',
		'      json.push({ $$id: "keepPart", path: "local.kept", value: local.part.kept })',
		'    },',
		'  })',
		'  result.kept = local.kept'
	].join("\n")));
	assert(JSON.stringify(framed.kept) === '[[1,3],[5]]', "A block's next ends its own item, not the caller's: " + JSON.stringify(framed));

	// A return with a value in a loop leaves the Flow, as before: a warning for an existing source, refused by code-set.
	var found = flow([
		'  forEach({',
		'    $$id: "eachName",',
		'    items: ["a", "b", "c"],',
		'    $$nodes: function () {',
		'      if (current === "b") {',
		'        return { found: current }',
		'      }',
		'    },',
		'  })',
		'  result.found = null'
	].join("\n"));
	var leaving = run(found);
	assert(JSON.stringify(leaving) === '{"found":"b"}', "A return with a value still leaves the Flow with it: " + JSON.stringify(leaving));
	var warned = diagnostics(found, "FLOWSCRIPT_RETURN_VALUE_IN_LOOP");
	var renderedFound = api("flowSourceValidate", { flowSource: warned.out.source });
	assert(renderedFound.ok && JSON.stringify(run(renderedFound.code)) === '{"found":"b"}', "The rendered source still leaves with the value: " + (renderedFound.code || JSON.stringify(renderedFound)));
	assert(warned.out.ok && warned.found.length === 1 && warned.found[0].severity === "warning" && warned.found[0].line === 4 && warned.found[0].loop === "eachName",
		"An existing source gets a warning at the line of the loop: " + JSON.stringify(warned.out.diagnostics));
	assert(warned.found[0].next.indexOf("return without value") !== -1, "The warning gives the JavaScript reading and the fix: " + JSON.stringify(warned.found[0]));
	var refused = api("flowCodeSet", { name: "Items", code: found, draft: false });
	var refusal = refused.error && refused.error.details && (refused.error.details.diagnostics || []).filter(function (d) { return d.code === "FLOWSCRIPT_RETURN_VALUE_IN_LOOP"; });
	assert(!refused.ok && refusal && refusal.length === 1 && refusal[0].severity === "error", "code-set refuses a return with a value in a loop: " + JSON.stringify(refused));

	// next is the block of a loop body only; forEachChunk keeps return as the value of its chunk.
	var outside = diagnostics(flow('  result.done = true\n  next({})'), "FLOW_NEXT_OUTSIDE_LOOP");
	assert(!outside.out.ok && outside.found.length === 1, "next outside a loop is refused: " + JSON.stringify(outside.out.diagnostics));
	var chunked = api("flowSourceValidate", { name: "Items", code: flow([
		'  local.best = forEachChunk({ source: [1, 2, 3], size: 2, $$each: function ({ chunk }) {',
		'    return',
		'  } })',
		'  result.best = local.best'
	].join("\n")) });
	assert(chunked.ok && nodesOf(chunked.definition.nodes, "next").length === 0, "A return in forEachChunk stays a return: " + JSON.stringify(chunked.definition && chunked.definition.nodes));

	print("OK flowscript-loop-return (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
