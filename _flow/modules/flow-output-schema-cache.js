(function () {
	// Only the native XSD bridge's static, read-only request is shared. Interactive
	// inspections (full detail, overrides, draft definitions) keep their normal path.
	function eligible(request) {
		var allowed = ["engineQName", "flowQName", "flowSource", "flowName", "name", "projectDir", "project", "allowRequestableSchema", "tagContext", "frontendSourceDrafts", "sourceRemovals"];
		return request && Object.keys(request).every(function (key) { return allowed.indexOf(key) >= 0; }) &&
			Object.keys(request.frontendSourceDrafts || {}).length === 0 && Object.keys(request.sourceRemovals || {}).length === 0 &&
			request.allowRequestableSchema === false && request.flowSource &&
			!request.definition && !request.config && !request.input && !request.engineSource &&
			!request.detail && !request.schemaDetail && !request.source && !request.schemaSource &&
			!request.ignoreDeclared && !request.action;
	}
	function run(request, env, build) {
		if (!eligible(request)) return build();
		var identity = env.identity(request);
		if (!identity) return build();
		var saved = env.read(identity.key);
		if (saved) {
			try {
				var entry = JSON.parse(String(saved));
				if (entry.fingerprint === identity.fingerprint && (!env.valid || env.valid(identity))) {
					env.count("hits");
					return entry.response;
				}
			} catch (_invalidCacheEntry) { /* Rebuild, never publish a partial schema. */ }
		}
		env.count("misses");
		var capture = { safe: true };
		var response = env.capture(capture, build);
		if (capture.safe && response && response.ok === true && (!env.valid || env.valid(identity))) {
			var encoded = JSON.stringify({ fingerprint: identity.fingerprint, response: response });
			if (encoded.length <= 262144) { env.write(identity.key, encoded); env.count("writes"); }
		} else env.count("bypasses");
		return response;
	}
	return { eligible: eligible, run: run };
}())
