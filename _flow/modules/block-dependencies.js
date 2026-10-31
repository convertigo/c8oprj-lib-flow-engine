(function () {
	// Native blocks declare the block calls that a FlowScript parser cannot see in their implementation.
	function check(ctx, name, node, catalog, raise) {
		var checked = ctx.requiredBlocksChecked || (ctx.requiredBlocksChecked = Object.create(null));
		if (checked[name]) return;
		var queue = [{name: name, chain: [name]}], visited = Object.create(null);
		while (queue.length) {
			var entry = queue.shift();
			if (visited[entry.name]) continue;
			visited[entry.name] = true;
			if (Object.keys(visited).length > 256) raise("BLOCK_DEPENDENCY_BOUNDS", "Block dependency traversal exceeds 256 blocks.", node);
			var block = ctx.blocks[entry.name];
			var dependencies = block && catalog(block).requiresBlocks || {};
			var names = Array.isArray(dependencies) ? dependencies : Object.keys(dependencies);
			names.forEach(function (dependency) {
				var chain = entry.chain.concat([dependency]);
				if (!Object.prototype.hasOwnProperty.call(ctx.blocks, dependency) || !ctx.blocks[dependency]) {
					var reference = Array.isArray(dependencies) ? "" : String(dependencies[dependency] || "");
					raise("BLOCK_DEPENDENCY_MISSING", "Block " + name + " requires unavailable block " + dependency + " (" + chain.join(" -> ") + ").", node,
						reference ? "Add project reference " + reference + " with flow-project-reference, then check the Flow again."
							: "Add the library providing " + dependency + " to this project, then check the Flow again.");
				}
				queue.push({name: dependency, chain: chain});
			});
		}
		Object.keys(visited).forEach(function (key) { checked[key] = true; });
	}
	return {check: check};
}())
