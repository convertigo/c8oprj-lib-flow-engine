// Re-enter the actual engine with the same cached plan, including a failing child.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var root = java.nio.file.Files.createTempDirectory("nested-execution-").toFile();
var __flowProjectDir = String(root), files = Packages.org.apache.commons.io.FileUtils;
var engine, calls = 0;
function assert(value, message) { if (!value) throw new Error(message); }
function request(owner, depth, fail) {
	return JSON.stringify({definition: {version: 1, nodes: [{block: "proof.nested", out: "result.proof"}]},
		input: {owner: owner, depth: depth, fail: fail}, includeTrace: true});
}
function __testNestedExecution(owner, depth, fail) {
	calls++;
	return engine.runObject(request(owner, depth, fail), function(value) { return JSON.parse(JSON.stringify(value)); });
}
try {
	var block = new java.io.File(root, "_flow/blocks/proof/nested.block.js");
	block.getParentFile().mkdirs();
	files.writeStringToFile(block,
		'const _meta={sourceVersion:2,runtime:"rhino",targets:["backend"],properties:{},outputs:{out:{type:"object"}}}\n' +
		'({run:function(ctx){var input=ctx.scopes.input;var owner=input.owner;ctx.scopes.local.owner=owner;' +
		'if(input.fail)throw new Error("nested fixture failure");' +
		'var child=input.depth?__testNestedExecution(owner+"-child",input.depth-1,false):null;' +
		'var failed=input.depth?__testNestedExecution(owner+"-failed",0,true):null;' +
		'return {owner:owner,after:ctx.scopes.input.owner,local:ctx.scopes.local.owner,child:child,failed:failed};}})', "UTF-8");
	engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	assert(engine.supportsNestedExecution === true, "Provider did not opt in to compatible re-entry");
	for (var pass = 0; pass < 3; pass++) {
		var result = __testNestedExecution("root-" + pass, 2, false);
		for (var depth = 2; depth >= 0; depth--) {
			assert(result.ok, "Nested execution failed");
			var proof = result.result.proof;
			assert(proof.owner === proof.after && proof.owner === proof.local, "Child overwrote its caller's frame");
			if (depth) {
				assert(proof.failed.ok === false && proof.child.ok, "A failed child contaminated its sibling");
				assert(proof.child.result.proof.owner === proof.owner + "-child", "Child input was not isolated");
			}
			result = proof.child;
		}
	}
	assert(calls === 15, "Missing recursive execution");
	print("runtime-nested-execution OK");
} finally { files.deleteDirectory(root); }
