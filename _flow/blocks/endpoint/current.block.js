const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:api",
  "tags": [
    "platform",
  ],
  "description": "Returns the current Convertigo endpoint URLs, and the trusted public URL of the server for links sent out.",
  "longDescription": "Uses the Convertigo engine configuration to expose common local URLs such as the Convertigo base URL, REST API URL and Flow MCP endpoint URL. publicUrl is the base of the links sent by email or shared outside: the configured public URL, else the environment variable CONVERTIGO_PUBLIC_URL, the engine endpoint URL, the server URL when it is not local, then the request URL in the Studio only; empty on a server without any of them (publicUrlSource tells which one applied). It never comes from the Host header of a request on a server.",
  "uses": [
    "public-url",
  ],
  "properties": {
    "publicUrl": {
      "label": "Configured public URL",
      "kind": "template",
      "type": "string",
      "default": "",
      "description": "Public URL of the server configured by the project, for example {{ config.publicUrl }} bound to a global symbol; used first for publicUrl.",
    },
    "mcpPath": {
      "label": "MCP endpoint path",
      "category": "Expert",
      "kind": "text",
      "type": "string",
      "default": "/api/flow-mcp",
      "description": "Endpoint path appended to the Convertigo base URL for the Flow MCP endpoint.",
    },
  },
  "runtime": "rhino",
  "hooks": {
    "file": "current.hooks.js",
  },
}

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

	// the sources of the public URL, read from the engine when it runs this block
	function publicUrlSettings(ctx, configured) {
		var settings = { configured: configured, environment: "", endpoint: "", localUrl: "", studio: false, requestUrl: "" };
		try {
			settings.environment = trim(java.lang.System.getenv("CONVERTIGO_PUBLIC_URL"));
		} catch (e) {
		}
		try {
			var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
			var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
			settings.endpoint = trim(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_ENDPOINT));
			settings.localUrl = trim(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
			settings.studio = Packages.com.twinsoft.convertigo.engine.Engine.isStudioMode() == true;
		} catch (e) {
		}
		if (settings.studio) {
			try {
				var context = ctx.convertigoContext();
				settings.requestUrl = context == null ? "" : trim(context.getConvertigoUrl());
			} catch (e) {
			}
		}
		return settings;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var warnings = [];
			var convertigoUrl = configuredConvertigoUrl(warnings);
			var mcpPath = normalizePath(ctx.template(props.mcpPath || "/api/flow-mcp"));
			var publicUrl;
			try {
				publicUrl = ctx.lib("public-url").publicUrl(publicUrlSettings(ctx, trim(ctx.template(props.publicUrl || ""))));
			} catch (e) {
				if (e && e.code === "PUBLIC_URL_INVALID") {
					return ctx.throwFlow({ code: e.code, message: e.message, status: e.status }, node);
				}
				throw e;
			}
			if (publicUrl === null) {
				warnings.push("No trusted public URL: set the configured public URL or CONVERTIGO_PUBLIC_URL.");
			}
			return {
				publicUrl: publicUrl === null ? "" : publicUrl.url,
				publicUrlSource: publicUrl === null ? "" : publicUrl.source,
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
