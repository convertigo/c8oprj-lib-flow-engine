(function () {
	var DEFAULT_CONVERTIGO_URL = "http://localhost:18080/convertigo";

	function trim(value) {
		return value == null ? "" : String(value).trim();
	}

	function stripTrailingSlash(value) {
		return trim(value).replace(/\/+$/g, "");
	}

	function normalizePath(value) {
		var path = trim(value || "/api/flow-mcp");
		return path.charAt(0) === "/" ? path : "/" + path;
	}

	function configuredConvertigoUrl(warnings) {
		try {
			var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
			var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
			var value = stripTrailingSlash(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
			if (value) {
				return value;
			}
		} catch (e) {
			warnings.push("Unable to read APPLICATION_SERVER_CONVERTIGO_URL: " + String(e));
		}
		warnings.push("Using default local Convertigo URL.");
		return DEFAULT_CONVERTIGO_URL;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var warnings = [];
			var convertigoUrl = configuredConvertigoUrl(warnings);
			var mcpPath = normalizePath(ctx.template(props.mcpPath || "/api/flow-mcp"));
			return {
				convertigoUrl: convertigoUrl,
				apiUrl: convertigoUrl + "/api",
				adminUrl: convertigoUrl + "/admin",
				flowMcpUrl: convertigoUrl + mcpPath,
				mcpPath: mcpPath,
				warnings: warnings
			};
		}
	};
}())
