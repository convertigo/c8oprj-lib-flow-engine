(function () {
	function nameFromBlockFile(file, blocksDir, suffix, env) {
		var name = env.blockIdFromDescriptorFile(file, blocksDir || file.getParentFile());
		if (name) {
			return name;
		}
		name = String(file.getName());
		return name.substring(0, name.length - suffix.length);
	}

	function ensureNotDuplicate(blocks, name, hint, env) {
		if (blocks[name] && blocks[name].__flowScriptPlaceholder !== true) {
			env.raise("DUPLICATE_BLOCK", "Duplicate Flow block: " + name, null, hint);
		}
	}

	function placeholder(name, descriptor, catalog, env) {
		return {
			name: String(name),
			"private": descriptor["private"] === true,
			__flowScriptPlaceholder: true,
			__blockDefinition: descriptor,
			catalog: function () {
				return env.normalizeTree(catalog);
			}
		};
	}

	function loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env) {
		var code = String(env.FileUtils.readFileToString(file, "UTF-8"));
		var name = nameFromBlockFile(file, blocksDir, ".block.js", env);
		var compiled = env.compileProjectBlockCode(blocks, name, code, {
			allowPrimitiveRhino: origin !== "project"
		});
		var block = env.graphBlockFromDefinition(compiled.descriptor, file, origin, provider);
		ensureNotDuplicate(blocks, block.name, "Rename the project block or remove the duplicate.", env);
		blocks[block.name] = block;
		return block;
	}

	function reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env) {
		var code = String(env.FileUtils.readFileToString(file, "UTF-8"));
		var name = nameFromBlockFile(file, blocksDir, ".block.js", env);
		ensureNotDuplicate(blocks, name, "Rename the project block or remove the duplicate.", env);
		var extracted = env.extractFlowScriptBlockMeta(code);
		var meta = Object.assign({}, env.flowScriptBlockMetaFromRequest(name, {}), env.normalizeTree(extracted.meta || {}));
		var runtime = env.blockCodeRuntimeFromMeta(meta);
		var descriptor = runtime === "rhino"
			? env.flowScriptBlockDescriptorFromMeta(name, meta, "", code)
			: env.flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, code);
		blocks[name] = placeholder(name, descriptor, env.graphBlockCatalog(descriptor), env);
	}

	function reserveGraphBlockFile(blocks, file, origin, provider, blocksDir, env) {
		var source = String(env.FileUtils.readFileToString(file, "UTF-8"));
		var name = nameFromBlockFile(file, blocksDir, ".block.yaml", env);
		ensureNotDuplicate(blocks, name, "Rename the project block or remove the duplicate.", env);
		var descriptor = env.validateGraphBlockSource(name, source);
		blocks[name] = placeholder(name, descriptor, env.graphBlockCatalog(descriptor), env);
	}

	return {
		loadFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env);
		},
		reserveFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env);
		},
		reserveGraphBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return reserveGraphBlockFile(blocks, file, origin, provider, blocksDir, env);
		}
	};
}())
