(function () {
	// Interpret a catalog recipe without publishing files. The loaded model owns
	// the returned working copies; only its Save operation may persist them.
	function plan(recipe, context, env) {
		var File = env.File;
		var raise = env.raise;
		var root = new File(String(context.root)).getCanonicalFile();
		var rootPath = root.toPath();
		var drafts = context.drafts || {};
		var draftPaths = Object.keys(drafts).map(function (path) { return new File(path).getCanonicalFile().toPath(); });
		function confined(file) {
			var path = file.getCanonicalFile().toPath();
			if (!path.startsWith(rootPath) || path.equals(rootPath)) {
				raise("INVALID_SOURCE_CREATION_PATH", "Source creation must stay below its source root.");
			}
			return path.toFile();
		}
		function occupied(file) {
			var path = file.getCanonicalFile().toPath();
			return file.exists() || draftPaths.some(function (draft) { return draft.startsWith(path); });
		}
		function validateParents(file) {
			var parent = file.getParentFile();
			while (parent && parent.toPath().startsWith(rootPath)) {
				if (parent.exists() && !parent.isDirectory() || draftPaths.some(function (draft) { return draft.equals(parent.toPath()); })) {
					raise("SOURCE_CREATION_PARENT_NOT_DIRECTORY", "A source file cannot contain another source.");
				}
				parent = parent.getParentFile();
			}
		}
		var baseId = String(recipe.baseId || "");
		if (!/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(baseId)) raise("INVALID_SOURCE_CREATION_RECIPE", "Missing or invalid source identifier.");
		var lastDot = baseId.lastIndexOf(".");
		var namespace = String(context.namespace || (lastDot < 0 ? "" : baseId.substring(0, lastDot)));
		if (namespace && !/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(namespace)) raise("INVALID_SOURCE_CREATION_RECIPE", "Invalid source namespace.");
		var baseName = lastDot < 0 ? baseId : baseId.substring(lastDot + 1);
		var directoryTemplate = String(recipe.directory || "");
		var fileTemplate = String(recipe.directoryOnly === true ? recipe.markerFile || "" : recipe.fileName || "");
		var sourceTemplate = recipe.directoryOnly === true ? recipe.markerSource : recipe.source;
		if (!directoryTemplate || !fileTemplate || typeof sourceTemplate !== "string") {
			raise("INVALID_SOURCE_CREATION_RECIPE", "Source creation requires a directory, file name and source text.");
		}
		var targetDirectory = String(context.targetDirectory || "");
		if (targetDirectory) {
			var target = new File(targetDirectory).getCanonicalFile().toPath();
			if (!target.startsWith(rootPath)) raise("INVALID_SOURCE_CREATION_PATH", "The destination is outside the source root.");
			targetDirectory = String(rootPath.relativize(target)).replace(/\\/g, "/");
		} else {
			targetDirectory = String(recipe.fallbackDirectory || "");
		}
		if (directoryTemplate.indexOf("${targetDirectory}") >= 0 && !targetDirectory) {
			raise("MISSING_SOURCE_CREATION_TARGET", "Select a source directory before creating this object.");
		}
		function template(text, values) {
			return String(text).replace(/\$\{([a-zA-Z][a-zA-Z0-9]*)\}/g, function (all, key) {
				if (!Object.prototype.hasOwnProperty.call(values, key)) raise("INVALID_SOURCE_CREATION_RECIPE", "Unknown template value: " + key);
				return values[key];
			});
		}
		function singleFileName(value) {
			if (!value || value.indexOf("/") >= 0 || value.indexOf("\\") >= 0 || value === "." || value === "..") {
				raise("INVALID_SOURCE_CREATION_RECIPE", "The source file name must be a single name.");
			}
			return value;
		}
		var exclusiveNames = recipe.exclusiveFileNames || [];
		if (Object.prototype.toString.call(exclusiveNames) !== "[object Array]" || exclusiveNames.some(function (name) { return typeof name !== "string"; })) {
			raise("INVALID_SOURCE_CREATION_RECIPE", "Exclusive source names must be a list of file names.");
		}
		var previousPath = "";
		for (var attempt = 1; attempt <= 100; attempt++) {
			var localName = baseName + (attempt === 1 ? "" : attempt);
			var id = namespace ? namespace + "." + localName : localName;
			var tag = localName.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, function (_, separator, letter) { return letter.toUpperCase(); });
			var values = { builder: String(context.builder || ""), id: id, namespace: namespace,
				namespacePath: namespace.replace(/\./g, "/"), localName: localName, LocalName: tag,
				tag: tag, actionName: tag.charAt(0).toLowerCase() + tag.substring(1), targetDirectory: targetDirectory };
			var directory = new File(root, template(directoryTemplate, values));
			var fileName = singleFileName(template(fileTemplate, values));
			var exclusiveFiles = exclusiveNames.map(function (name) {
				return confined(new File(directory, singleFileName(template(name, values))));
			});
			var file = confined(new File(directory, fileName));
			var selection = recipe.directoryOnly === true ? confined(directory) : file;
			var path = String(file.getCanonicalPath());
			if (path === previousPath) raise("SOURCE_ALREADY_EXISTS", "This source already exists in the selected directory.");
			previousPath = path;
			validateParents(file);
			if (occupied(selection) || exclusiveFiles.some(occupied) || (context.usedIds || []).indexOf(id) >= 0) continue;
			values.fileName = fileName;
			var changes = {};
			changes[path] = template(sourceTemplate, values);
			return { ok: true, target: "sources", sourceChanges: changes, sourceId: id,
				selectionSourcePath: String(new File(String(context.root), String(rootPath.relativize(selection.toPath())))
					.toPath().toAbsolutePath().normalize()) };
		}
		raise("SOURCE_CREATION_EXHAUSTED", "Unable to allocate an unused source name.");
	}
	return { plan: plan };
}())
