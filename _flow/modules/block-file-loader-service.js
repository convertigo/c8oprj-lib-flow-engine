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

	function placeholderDescriptor(block) {
		if (!block.__blockDefinition) {
			var env = block.__flowLoaderEnv;
			var code = sourceForFile(block.__flowFileObject, env);
			var extracted = env.extractFlowScriptBlockMeta(code);
			var meta = Object.assign({}, env.flowScriptBlockMetaFromRequest(block.name, {}), env.normalizeTree(extracted.meta || {}));
			var runtime = env.blockCodeRuntimeFromMeta(meta);
			var descriptor = runtime === "rhino"
				? env.flowScriptBlockDescriptorFromMeta(block.name, meta, "", code)
				: env.flowScriptBlockDescriptorFromMeta(block.name, meta, { version: 1, nodes: [] }, code);
			block.__blockDefinition = descriptor;
			block["private"] = descriptor["private"] === true;
			block.visibility = descriptor.visibility || "";
		}
		return block.__blockDefinition;
	}

	function materializePlaceholder(block, targetBlocks) {
		targetBlocks = targetBlocks || block.__flowBlocks;
		var lock = block.__flowMaterializationLock;
		if (lock) {
			lock.lock();
		}
		try {
			var current = targetBlocks && targetBlocks[block.name];
			if (current && current !== block && current.__flowScriptPlaceholder !== true) {
				return current;
			}
			return loadFlowScriptBlockFile(targetBlocks, block.__flowFileObject, block.__flowOrigin,
				block.__flowProvider, block.__flowBlocksDir, block.__flowLoaderEnv);
		} finally {
			if (lock) {
				lock.unlock();
			}
		}
	}

	function delegatePlaceholder(block, method, ctx, node) {
		var materialized = materializePlaceholder(block, ctx && ctx.blocks);
		return typeof materialized[method] === "function" ? materialized[method](ctx, node) : undefined;
	}

	var placeholderPrototype = Object.freeze({
		materialize: function (targetBlocks) {
			return materializePlaceholder(this, targetBlocks);
		},
		implementationRuntime: function () {
			var implementation = placeholderDescriptor(this).implementation || {};
			return String(implementation.runtime || "");
		},
		catalog: function () {
			return this.__flowLoaderEnv.normalizeTree(this.__flowLoaderEnv.graphBlockCatalog(placeholderDescriptor(this)));
		},
		displayName: function (node) {
			var block = materializePlaceholder(this);
			return typeof block.displayName === "function" ? block.displayName(node) : String(this.name);
		},
		analyze: function (ctx, node) {
			return delegatePlaceholder(this, "analyze", ctx, node);
		},
		analyzeShallow: function (ctx, node) {
			return delegatePlaceholder(this, "analyzeShallow", ctx, node);
		},
		run: function (ctx, node) {
			return delegatePlaceholder(this, "run", ctx, node);
		}
	});

	function placeholder(blocks, name, file, origin, provider, blocksDir, env) {
		var block = Object.assign(Object.create(placeholderPrototype), {
			name: String(name),
			"private": false,
			visibility: "",
			__flowScriptPlaceholder: true,
			__blockDefinition: null,
			__flowOrigin: origin,
			__flowProvider: provider || origin || "unknown",
			__flowFile: String(file.getAbsolutePath()),
			__flowFormat: "flowscript-block"
		});
		Object.defineProperties(block, {
			__flowBlocks: { value: blocks, enumerable: false },
			__flowFileObject: { value: file, enumerable: false },
			__flowBlocksDir: { value: blocksDir, enumerable: false },
			__flowLoaderEnv: { value: env, enumerable: false },
			__flowMaterializationLock: {
				value: typeof env.createBlockMaterializationLock === "function"
					? env.createBlockMaterializationLock()
					: null,
				enumerable: false
			}
		});
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
		blocks[name] = placeholder(blocks, name, file, origin, provider, blocksDir, env);
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
