(function () {
	function validateImplementationSource(name, source, env) {
		var block = eval(String(source || ""));
		if (!block || typeof block.run !== "function") {
			env.raise("INVALID_BLOCK_IMPLEMENTATION", "Invalid block implementation: " + name,
				null, "A Rhino .block.js implementation must evaluate to an object with run(ctx, node).");
		}
		["catalog", "name", "private", "displayName", "analyze", "analyzeShallow"].forEach(function (key) {
			if (block[key] !== undefined) {
				env.raise("INVALID_BLOCK_IMPLEMENTATION", "Rhino implementation must not define " + key + ": " + name,
					null, "Move static metadata to _meta in *.block.js and dynamic display/analyze code to hooks.file.");
			}
		});
		return block;
	}

	function rhinoImplementationWarnings(name, source) {
		var text = String(source || "");
		var warnings = [];
		function add(severity, code, message, hint) {
			warnings.push({
				severity: severity || "warning",
				code: code,
				block: String(name || ""),
				message: message,
				hint: hint
			});
		}
		if (/(?:java\.net\.URL|openConnection\s*\(|openStream\s*\(|URLConnection|HttpClient|setRequestProperty\s*\()/m.test(text)) {
			add("error", "RHINO_REIMPLEMENTS_HTTP",
				"Rhino implementation appears to perform HTTP directly.",
				"Use http.get/http.request in FlowScript and pass response.body or response.text to a small parser block.");
		}
		if (/(?:callSequence|callTransaction|executeSequence|executeTransaction)/m.test(text)) {
			add("error", "RHINO_REIMPLEMENTS_REQUESTABLE",
				"Rhino implementation appears to call Convertigo requestables directly.",
				"Use requestable.call in FlowScript so the requestable call stays visible in the graph.");
		}
		if (text.length > 3000 && /(?:for\s*\(|while\s*\(|\.sort\s*\(|\.map\s*\(|JSON\.parse|JSON\.stringify)/m.test(text)) {
			add("warning", "RHINO_BLOCK_MAY_BE_MONOLITHIC",
				"Large Rhino implementation contains algorithmic control flow or JSON/list processing.",
				"Keep only the missing low-level primitive in Rhino; compose fetch, loops, list transforms and response mapping with Flow blocks.");
		}
		return warnings;
	}

	function enforceRhinoImplementationPolicy(name, source, env) {
		var warnings = rhinoImplementationWarnings(name, source);
		for (var i = 0; i < warnings.length; i++) {
			var warning = warnings[i];
			if (warning.severity === "error") {
				env.raise(warning.code, warning.message, null, warning.hint);
			}
		}
		return warnings;
	}

	function validateHooksSource(name, source, env) {
		var hooks = eval(String(source || ""));
		if (!hooks || typeof hooks !== "object") {
			env.raise("INVALID_BLOCK_HOOKS", "Invalid block hooks: " + name,
				null, "A hooks script must evaluate to an object, usually with displayName(node), analyze(ctx, node), and/or analyzeShallow(ctx, node).");
		}
		return hooks;
	}

	return {
		validateImplementationSource: validateImplementationSource,
		rhinoImplementationWarnings: rhinoImplementationWarnings,
		enforceRhinoImplementationPolicy: enforceRhinoImplementationPolicy,
		validateHooksSource: validateHooksSource
	};
}())
