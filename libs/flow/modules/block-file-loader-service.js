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

	function placeholder(blocks, name, descriptorFactory, file, origin, provider, blocksDir, env) {
		var descriptor = null;
		var block = null;
		function getDescriptor() {
			if (!descriptor) {
				descriptor = descriptorFactory();
				block.__blockDefinition = descriptor;
				block["private"] = descriptor["private"] === true;
				block.visibility = descriptor.visibility || "";
			}
			return descriptor;
		}
		function materialize(targetBlocks) {
			targetBlocks = targetBlocks || blocks;
			return loadFlowScriptBlockFile(targetBlocks, file, origin, provider, blocksDir, env);
		}
		function delegate(method, ctx, node) {
			var block = materialize(ctx && ctx.blocks);
			return typeof block[method] === "function" ? block[method](ctx, node) : undefined;
		}
		block = {
			name: String(name),
			"private": false,
			visibility: "",
			__flowScriptPlaceholder: true,
			__blockDefinition: null,
			__flowOrigin: origin,
			__flowProvider: provider || origin || "unknown",
			__flowFile: String(file.getAbsolutePath()),
			__flowFormat: "flowscript-block",
			materialize: materialize,
			implementationRuntime: function () {
				var implementation = getDescriptor().implementation || {};
				return String(implementation.runtime || "");
			},
			catalog: function () {
				return env.normalizeTree(env.graphBlockCatalog(getDescriptor()));
			},
			displayName: function (node) {
				var block = materialize(blocks);
				return typeof block.displayName === "function" ? block.displayName(node) : String(name);
			},
			analyze: function (ctx, node) {
				return delegate("analyze", ctx, node);
			},
			analyzeShallow: function (ctx, node) {
				return delegate("analyzeShallow", ctx, node);
			},
			run: function (ctx, node) {
				return delegate("run", ctx, node);
			}
		};
		return block;
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
		ensureNotDuplicate(blocks, name, "Rename the project block or remove the duplicate.", env);
		blocks[name] = placeholder(blocks, name, function () {
			var code = sourceForFile(file, env);
			var extracted = env.extractFlowScriptBlockMeta(code);
			var meta = Object.assign({}, env.flowScriptBlockMetaFromRequest(name, {}), env.normalizeTree(extracted.meta || {}));
			var runtime = env.blockCodeRuntimeFromMeta(meta);
			return runtime === "rhino"
				? env.flowScriptBlockDescriptorFromMeta(name, meta, "", code)
				: env.flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, code);
		}, file, origin, provider, blocksDir, env);
		return blocks[name];
	}

	function materializeFlowScriptBlock(blocks, name, runtime) {
		var block = blocks && blocks[name];
		if (runtime && block && block.__flowScriptPlaceholder === true &&
				typeof block.implementationRuntime === "function" && block.implementationRuntime() !== runtime) {
			return block;
		}
		return block && block.__flowScriptPlaceholder === true && typeof block.materialize === "function"
			? block.materialize(blocks)
			: block;
	}

	return {
		loadFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return loadFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env);
		},
		reserveFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env) {
			return reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env);
		},
		materializeFlowScriptBlock: function (blocks, name, runtime) {
			return materializeFlowScriptBlock(blocks, name, runtime);
		}
	};
}())
