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

	function typeEditorFragmentsHtml(env) {
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
			out += String(env.FileUtils.readFileToString(file, "UTF-8")) + "\n";
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
				"script", env.fileFingerprint(resourceFile(env, "property-editor.js")),
				"builder", env.fileFingerprint(resourceFile(env, "property-editor-builder.js")),
				"types", env.typesCacheKey()
			].join("\n");
		},

		html: function (env) {
			return resourceSource(env, "property-editor.html")
				.replace("<!-- FLOW_PROPERTY_EDITOR_STYLE -->", resourceSource(env, "property-editor.css"))
				.replace("<!-- FLOW_TYPE_EDITOR_FRAGMENTS -->", typeEditorFragmentsHtml(env))
				.replace("<!-- FLOW_PROPERTY_EDITOR_SCRIPT -->", resourceSource(env, "property-editor.js"));
		}
	};
}())
