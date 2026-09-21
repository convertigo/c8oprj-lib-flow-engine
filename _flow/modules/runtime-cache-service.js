(function () {
	function bridgeRuntimeCacheInfo(scope) {
		scope = scope || {};
		function value(name, fallback) {
			return typeof scope[name] !== "undefined" ? scope[name] : fallback;
		}
		return {
			enabled: value("__flowBridgeRuntimeCacheEnabled", false) === true,
			hit: value("__flowBridgeRuntimeCacheHit", false) === true,
			key: value("__flowBridgeRuntimeCacheKey", "") !== "" ? String(value("__flowBridgeRuntimeCacheKey", "")) : "",
			generation: Number(value("__flowBridgeRuntimeCacheGeneration", 0) || 0),
			size: Number(value("__flowBridgeRuntimeCacheSize", 0) || 0),
			classSource: value("__flowBridgeClassSource", "") !== "" ? String(value("__flowBridgeClassSource", "")) : "",
			classResource: value("__flowBridgeClassResource", "") !== "" ? String(value("__flowBridgeClassResource", "")) : ""
		};
	}

	function bridgeInfo(env) {
		var scope = env.globalScope || {};
		var raw = typeof scope.__flowBridgeInfo !== "undefined" ? String(scope.__flowBridgeInfo || "") : "";
		if (!raw && typeof env.bridgeInfo === "function") {
			try {
				raw = String(env.bridgeInfo() || "");
			} catch (e) {
				return { error: String(e) };
			}
		}
		if (!raw) {
			return {};
		}
		try {
			return JSON.parse(raw);
		} catch (e) {
			return {
				error: String(e)
			};
		}
	}

	function cacheSummary(name, cache, env) {
		return env.cacheUtils.summary(name, cache);
	}

	function frontendProviderInfo(env) {
		var providers = env.runtimeState.frontendProviders || {};
		var stats = providers.stats || {};
		return {
			compiledSelections: Number(stats.compiledSelections || 0),
			tsxSelections: Number(stats.tsxSelections || 0),
			validations: Number(stats.validations || 0),
			validationCacheHits: Number(stats.validationCacheHits || 0),
			valid: Number(stats.valid || 0),
			absent: Number(stats.absent || 0),
			stale: Number(stats.stale || 0),
			corrupt: Number(stats.corrupt || 0),
			unsupported: Number(stats.unsupported || 0),
			launchRejected: Number(stats.launchRejected || 0),
			launchFallbacks: Number(stats.launchFallbacks || 0),
			cachedRoots: Object.keys(providers.cache || {}).length,
			rejectedBundles: Object.keys(providers.rejected || {}).length
		};
	}

	function flowSnapshotInfo(env) {
		var stats = env.flowSnapshotStats || {};
		return {
			name: "flowSnapshots",
			compiles: Number(stats.compiles || 0),
			hydrations: Number(stats.hydrations || 0),
			sourceMs: Number(stats.sourceMs || 0),
			parseMs: Number(stats.parseMs || 0),
			createMs: Number(stats.createMs || 0),
			hydrateMs: Number(stats.hydrateMs || 0),
			payloadBytes: Number(stats.payloadBytes || 0),
			maxPayloadBytes: Number(stats.maxPayloadBytes || 0),
			sharedHits: Number(stats.sharedHits || 0),
			sharedMisses: Number(stats.sharedMisses || 0),
			sharedWrites: Number(stats.sharedWrites || 0),
			sharedErrors: Number(stats.sharedErrors || 0),
			sharedSkips: Number(stats.sharedSkips || 0),
			sharedDeserializeMs: Number(stats.sharedDeserializeMs || 0),
			machineHits: Number(stats.machineHits || 0),
			machineMisses: Number(stats.machineMisses || 0),
			machineStores: Number(stats.machineStores || 0),
			machineErrors: Number(stats.machineErrors || 0),
			sharedCache: typeof env.sharedFlowSnapshotInfo === "function" ? env.sharedFlowSnapshotInfo() : { available: false }
		};
	}

	function info(env) {
		var activeProjectDir = env.projectDir();
		var activeProjectPath = activeProjectDir ? env.canonicalPath(activeProjectDir) : "";
		var caches = env.runtimeState.caches;
		return {
			ok: true,
			runtimeId: env.runtimeState.id,
			startedAt: env.runtimeState.startedAt,
			threadName: String(env.Thread.currentThread().getName()),
			activeProjectDir: activeProjectPath,
			rawProjectDir: activeProjectDir ? String(activeProjectDir) : "",
			engineDir: env.canonicalPath(env.engineDir()),
			bridge: bridgeInfo(env),
			bridgeRuntimeCache: bridgeRuntimeCacheInfo(env.globalScope),
			caches: {
				blocks: cacheSummary("blocks", caches.blocks, env),
				coreBlocks: cacheSummary("coreBlocks", caches.coreBlocks, env),
				blockArtifacts: cacheSummary("blockArtifacts", caches.blockArtifacts, env),
				blockCatalogHeads: cacheSummary("blockCatalogHeads", caches.blockCatalogHeads, env),
				types: cacheSummary("types", caches.types, env),
				flowPlans: cacheSummary("flowPlans", caches.flowPlans, env),
				runPlanHeads: cacheSummary("runPlanHeads", caches.runPlanHeads, env),
				flowSnapshots: flowSnapshotInfo(env),
				configDefinitions: cacheSummary("configDefinitions", caches.configDefinitions, env),
				libraries: cacheSummary("libraries", caches.libraries, env),
				engineModules: cacheSummary("engineModules", caches.engineModules, env),
				compiledScripts: env.compiledScriptCacheInfo ? env.compiledScriptCacheInfo() : { name: "compiledScripts", size: 0 },
				propertyEditor: cacheSummary("propertyEditor", caches.propertyEditor, env),
				treeSnapshots: cacheSummary("treeSnapshots", caches.treeSnapshots, env),
				frontendDocuments: cacheSummary("frontendDocuments", caches.frontendDocuments, env),
				persistentFrontendDocuments: {
					hits: Number(env.runtimeState.persistentFrontendDocuments.hits || 0),
					misses: Number(env.runtimeState.persistentFrontendDocuments.misses || 0),
					writes: Number(env.runtimeState.persistentFrontendDocuments.writes || 0),
					errors: Number(env.runtimeState.persistentFrontendDocuments.errors || 0)
				},
				frontendDocumentServer: {
					starts: Number(env.runtimeState.frontendDocumentServerStats.starts || 0),
					reuses: Number(env.runtimeState.frontendDocumentServerStats.reuses || 0),
					fallbacks: Number(env.runtimeState.frontendDocumentServerStats.fallbacks || 0),
					errors: Number(env.runtimeState.frontendDocumentServerStats.errors || 0),
					active: Object.keys(env.runtimeState.frontendDocumentServers).length,
					lastError: String(env.runtimeState.frontendDocumentServerStats.lastError || "")
				},
				frontendProvider: frontendProviderInfo(env),
				expressions: cacheSummary("expressions", caches.expressionTokens, env),
				expressionPrograms: cacheSummary("expressionPrograms", caches.expressionPrograms, env)
			}
		};
	}

	function clear(env) {
		var caches = env.runtimeState.caches;
		env.cacheUtils.clearMap(caches.blocks);
		env.cacheUtils.clearMap(caches.coreBlocks);
		env.cacheUtils.clearMap(caches.blockArtifacts);
		env.cacheUtils.clearMap(caches.blockCatalogHeads);
		env.cacheUtils.clearMap(caches.types);
		env.cacheUtils.clearBoundedMap(caches.flowPlans);
		env.cacheUtils.clearBoundedMap(caches.runPlanHeads);
		env.cacheUtils.clearMap(caches.configDefinitions);
		env.cacheUtils.clearMap(caches.libraries);
		env.cacheUtils.clearMap(caches.engineModules);
		env.cacheUtils.clearValue(caches.propertyEditor);
		env.cacheUtils.clearBoundedMap(caches.treeSnapshots);
		env.cacheUtils.clearBoundedMap(caches.frontendDocuments);
		env.cacheUtils.clearBoundedMap(caches.expressionTokens);
		env.cacheUtils.clearBoundedMap(caches.expressionPrograms);
		Object.keys(env.flowSnapshotStats || {}).forEach(function (key) {
			env.flowSnapshotStats[key] = 0;
		});
		env.clearFrontendDocumentServers();
		env.clearFrontendProviderState();
		env.clearPersistentFrontendDocuments();
		env.resetModuleCaches();
		return info(env);
	}

	return {
		info: info,
		clear: clear
	};
}())
