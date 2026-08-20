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

	function applyStaticEntry(block) {
		if (block.__flowStaticLoaded === true) {
			return;
		}
		var accessor = block.__flowStaticEntryAccessor;
		var entry = accessor && typeof accessor.entryFor === "function"
			? accessor.entryFor(block.__flowFileObject)
			: null;
		if (entry === undefined) {
			return;
		}
		block.__flowStaticLoaded = true;
		if (!entry) {
			return;
		}
		block.__flowStaticCatalog = entry.catalog || null;
		block.__flowStaticRuntime = String(entry.runtime || "");
		block["private"] = entry["private"] === true;
		block.visibility = String(entry.visibility || "");
	}

	var placeholderPrototype = Object.freeze({
		materialize: function (targetBlocks) {
			return materializePlaceholder(this, targetBlocks);
		},
		implementationRuntime: function () {
			if (this.__flowStaticRuntime) {
				return String(this.__flowStaticRuntime);
			}
			var implementation = placeholderDescriptor(this).implementation || {};
			return String(implementation.runtime || "");
		},
		catalog: function () {
			if (this.__blockDefinition) {
				return this.__flowLoaderEnv.normalizeTree(this.__flowLoaderEnv.graphBlockCatalog(this.__blockDefinition));
			}
			applyStaticEntry(this);
			if (this.__flowStaticCatalog) {
				return this.__flowLoaderEnv.normalizeTree(this.__flowStaticCatalog);
			}
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

	function placeholder(blocks, name, file, origin, provider, blocksDir, env, staticEntry) {
		staticEntry = staticEntry || {};
		var staticAccessor = typeof staticEntry.entryFor === "function" ? staticEntry : null;
		var block = Object.assign(Object.create(placeholderPrototype), {
			name: String(name),
			"private": staticEntry["private"] === true,
			visibility: String(staticEntry.visibility || ""),
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
			__flowStaticCatalog: { value: staticEntry.catalog || null, enumerable: false, writable: true },
			__flowStaticRuntime: { value: String(staticEntry.runtime || ""), enumerable: false, writable: true },
			__flowStaticEntryAccessor: { value: staticAccessor, enumerable: false },
			__flowStaticLoaded: { value: !staticAccessor, enumerable: false, writable: true },
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

	function staticSourceForFile(file, env) {
		return String(typeof env.staticSourceForFile === "function"
			? env.staticSourceForFile(file)
			: env.FileUtils.readFileToString(file, "UTF-8"));
	}

	function staticCatalogEntryForFlowScriptBlockFile(file, origin, provider, blocksDir, env) {
		var name = nameFromBlockFile(file, blocksDir, ".block.js", env);
		var code = staticSourceForFile(file, env);
		var extracted = env.extractFlowScriptBlockMeta(code);
		var meta = Object.assign({}, env.flowScriptBlockMetaFromRequest(name, {}), env.normalizeTree(extracted.meta || {}));
		var runtime = env.blockCodeRuntimeFromMeta(meta);
		var descriptor = runtime === "rhino"
			? env.flowScriptBlockDescriptorFromMeta(name, meta, "", code)
			: env.flowScriptBlockDescriptorFromMeta(name, meta, { version: 1, nodes: [] }, code);
		return env.normalizeTree({
			name: name,
			runtime: runtime,
			"private": descriptor["private"] === true,
			visibility: descriptor.visibility || "",
			catalog: env.graphBlockCatalog(descriptor)
		});
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

	function reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env, staticEntry) {
		var name = nameFromBlockFile(file, blocksDir, ".block.js", env);
		var cached = readArtifact(name, file, origin, provider, env);
		if (cached) {
			return installArtifact(blocks, name, cached, env);
		}
		ensureNotDuplicate(blocks, name, "Rename the project block or remove the duplicate.", env);
		blocks[name] = placeholder(blocks, name, file, origin, provider, blocksDir, env, staticEntry);
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
		reserveFlowScriptBlockFile: function (blocks, file, origin, provider, blocksDir, env, staticEntry) {
			return reserveFlowScriptBlockFile(blocks, file, origin, provider, blocksDir, env, staticEntry);
		},
		staticCatalogEntryForFlowScriptBlockFile: function (file, origin, provider, blocksDir, env) {
			return staticCatalogEntryForFlowScriptBlockFile(file, origin, provider, blocksDir, env);
		},
		materializeFlowScriptBlock: function (blocks, name, runtime) {
			return materializeFlowScriptBlock(blocks, name, runtime);
		}
	};
}())
