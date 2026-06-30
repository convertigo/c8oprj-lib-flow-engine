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

	function bridgeInfo(scope) {
		scope = scope || {};
		var raw = typeof scope.__flowBridgeInfo !== "undefined" ? String(scope.__flowBridgeInfo || "") : "";
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
			bridge: bridgeInfo(env.globalScope),
			bridgeRuntimeCache: bridgeRuntimeCacheInfo(env.globalScope),
			caches: {
				blocks: cacheSummary("blocks", caches.blocks, env),
				types: cacheSummary("types", caches.types, env),
				libraries: cacheSummary("libraries", caches.libraries, env),
				engineModules: cacheSummary("engineModules", caches.engineModules, env),
				compiledScripts: env.compiledScriptCacheInfo ? env.compiledScriptCacheInfo() : { name: "compiledScripts", size: 0 },
				propertyEditor: cacheSummary("propertyEditor", caches.propertyEditor, env),
				treeSnapshots: cacheSummary("treeSnapshots", caches.treeSnapshots, env),
				expressions: cacheSummary("expressions", caches.expressionTokens, env)
			}
		};
	}

	function clear(env) {
		var caches = env.runtimeState.caches;
		env.cacheUtils.clearMap(caches.blocks);
		env.cacheUtils.clearMap(caches.types);
		env.cacheUtils.clearMap(caches.libraries);
		env.cacheUtils.clearMap(caches.engineModules);
		env.cacheUtils.clearValue(caches.propertyEditor);
		env.cacheUtils.clearMap(caches.treeSnapshots);
		env.cacheUtils.clearBoundedMap(caches.expressionTokens);
		env.resetModuleCaches();
		return info(env);
	}

	return {
		info: info,
		clear: clear
	};
}())
