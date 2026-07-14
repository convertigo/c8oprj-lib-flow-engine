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
			visibility: descriptor.visibility || "",
			__flowScriptPlaceholder: true,
			__blockDefinition: descriptor,
			catalog: function () {
				return env.normalizeTree(catalog);
			}
		};
	}

	function sourceForFile(file, env) {
		return String(typeof env.sourceForFile === "function"
			? env.sourceForFile(file)
			: env.FileUtils.readFileToString(file, "UTF-8"));
	}

	function artifactIdentity(name, file, origin, provider, env) {
		return {
			key: String(provider || origin || "unknown") + "." + String(name),
			fingerprint: String(origin || "") + "\n" + env.blockSourceFingerprint(file) + "\n"
				+ String(env.blockCompilerFingerprint || "")
		};
	}

	function readArtifact(name, file, origin, provider, env) {
		if (typeof env.readBlockArtifact !== "function") {
			return null;
		}
		var identity = artifactIdentity(name, file, origin, provider, env);
		return env.readBlockArtifact(identity.key, identity.fingerprint);
	}

	function installArtifact(blocks, name, artifact, env) {
		if (blocks[name] && blocks[name] !== artifact.block && blocks[name].__flowScriptPlaceholder !== true) {
			ensureNotDuplicate(blocks, name, "Rename the project block or remove the duplicate.", env);
		}
		blocks[name] = artifact.block;
		return artifact.block;
	}

	function loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env) {
		var name = nameFromBlockFile(file, blocksDir, ".block.js", env);
		var cached = readArtifact(name, file, origin, provider, env);
		if (cached) {
			return installArtifact(blocks, name, cached, env);
		}
		var code = sourceForFile(file, env);
		var compiled = env.compileProjectBlockCode(blocks, name, code, {
			allowPrimitiveRhino: origin !== "project"
		});
		var block = env.graphBlockFromDefinition(compiled.descriptor, file, origin, provider);
		ensureNotDuplicate(blocks, block.name, "Rename the project block or remove the duplicate.", env);
		blocks[block.name] = block;
		if (typeof env.writeBlockArtifact === "function") {
			var identity = artifactIdentity(name, file, origin, provider, env);
			env.writeBlockArtifact(identity.key, identity.fingerprint, { block: block });
		}
		return block;
	}

	function reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env) {
		var name = nameFromBlockFile(file, blocksDir, ".block.js", env);
		var cached = readArtifact(name, file, origin, provider, env);
		if (cached) {
			return installArtifact(blocks, name, cached, env);
		}
		var code = sourceForFile(file, env);
		ensureNotDuplicate(blocks, name, "Rename the project block or remove the duplicate.", env);
		var extracted = env.extractFlowScriptBlockMeta(code);
		var meta = Object.assign({}, env.flowScriptBlockMetaFromRequest(name, {}), env.normalizeTree(extracted.meta || {}));
		var runtime = env.blockCodeRuntimeFromMeta(meta);
		var descriptor = runtime === "rhino"
			? env.flowScriptBlockDescriptorFromMeta(name, meta, "", code)
			: env.flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, code);
		blocks[name] = placeholder(name, descriptor, env.graphBlockCatalog(descriptor), env);
	}

	return {
		loadFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env);
		},
		reserveFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env);
		}
	};
}())
