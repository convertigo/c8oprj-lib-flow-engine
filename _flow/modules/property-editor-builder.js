(function () {
	function resourceFile(env, name) {
		return env.engineResourceFile(name);
	}

	function resourceSource(env, name) {
		var file = resourceFile(env, name);
		if (!file.isFile()) {
			env.raise("MISSING_PROPERTY_EDITOR_RESOURCE", "Flow property editor resource not found: " + file.getAbsolutePath());
		}
		return String(env.FileUtils.readFileToString(file, "UTF-8"));
	}

	function injectTypeEditorChrome(source, chrome) {
		source = String(source || "");
		var marker = "</style>";
		var index = source.indexOf(marker);
		if (index < 0) {
			var template = source.indexOf("<template");
			var openingEnd = template < 0 ? -1 : source.indexOf(">", template);
			if (openingEnd < 0) {
				return source;
			}
			return source.substring(0, openingEnd + 1)
				+ "\n<style>\n/* Shared Flow type editor chrome. */\n" + chrome + "\n</style>"
				+ source.substring(openingEnd + 1);
		}
		return source.substring(0, index)
			+ "\n/* Shared Flow type editor chrome. */\n" + chrome + "\n"
			+ source.substring(index);
	}

	function typeEditorFragmentsHtml(env, chrome) {
		var out = "";
		var types = env.loadTypes();
		Object.keys(types).sort().forEach(function (name) {
			var type = types[name];
			var descriptor = env.typeDescriptor(type);
			var editor = type && type.editor;
			if (!editor || !editor.file) {
				return;
			}
			var baseDir = type && type.__flowFile ? new env.File(String(type.__flowFile)).getParentFile() : env.engineDir();
			var file = new env.File(String(editor.file));
			if (!file.isAbsolute()) {
				file = new env.File(baseDir, String(editor.file));
			}
			if (!file.isFile()) {
				return;
			}
			out += "\n<!-- Flow type editor: " + descriptor.name + " -->\n";
			out += injectTypeEditorChrome(
				String(env.FileUtils.readFileToString(file, "UTF-8")), chrome) + "\n";
		});
		return out;
	}

	return {
		cacheKey: function (env) {
			return [
				"propertyEditor",
				"engine", env.canonicalPath(env.engineDir()),
				"template", env.fileFingerprint(resourceFile(env, "property-editor.html")),
				"style", env.fileFingerprint(resourceFile(env, "property-editor.css")),
				"typeEditorChrome", env.fileFingerprint(resourceFile(env, "type-editor-chrome.css")),
				"script", env.fileFingerprint(resourceFile(env, "property-editor.js")),
				"builder", env.fileFingerprint(env.engineModuleFile("property-editor-builder.js")),
				"types", env.typesCacheKey()
			].join("\n");
		},

		html: function (env) {
			var typeEditorChrome = resourceSource(env, "type-editor-chrome.css");
			return resourceSource(env, "property-editor.html")
				.replace("<!-- FLOW_PROPERTY_EDITOR_STYLE -->", resourceSource(env, "property-editor.css"))
				.replace("<!-- FLOW_TYPE_EDITOR_FRAGMENTS -->", typeEditorFragmentsHtml(env, typeEditorChrome))
				.replace("<!-- FLOW_PROPERTY_EDITOR_SCRIPT -->", resourceSource(env, "property-editor.js"));
		}
	};
}())
