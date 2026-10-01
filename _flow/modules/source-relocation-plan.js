(function () {
	// Resource intentions are format-independent plans. The model applies the
	// whole plan to its working copies; only Save publishes it to disk.
	function plan(mutation, context, env) {
		var File = env.File, sources = env.sources, raise = env.raise;
		var projectRoot = new File(String(context.root)).getCanonicalFile().toPath();
		function confined(file, root) {
			var path = file.getCanonicalFile().toPath();
			if (!path.startsWith(root) || path.equals(root)) {
				raise("INVALID_SOURCE_RELOCATION_PATH", "Source relocation must stay below its source root.");
			}
			return path.toFile();
		}
		var root = new File(String(mutation.sourceRoot || context.root)).getCanonicalFile().toPath();
		if (!root.startsWith(projectRoot)) raise("INVALID_SOURCE_RELOCATION_PATH", "The source root is outside the project.");
		var sourceFile = new File(String(mutation.sourcePath || ""));
		if (env.isSymbolicLink(sourceFile)) raise("SOURCE_LINK_RELOCATION_UNSUPPORTED", "A symbolic link cannot be relocated as source text.");
		var source = confined(sourceFile, root);
		if (!sources.isFile(source) && !sources.isDirectory(source)) raise("SOURCE_NOT_FOUND", "The source no longer exists.");
		var name = String(mutation.value === undefined || mutation.value === null ? "" : mutation.value);
		var recipe = mutation.recipe || {};
		if (!name || /[\/\\\x00-\x1f\x7f]/.test(name) || name === "." || name === ".."
			|| recipe.pattern && !(new RegExp(String(recipe.pattern))).test(name)) {
			raise("INVALID_SOURCE_NAME", "The name does not match this source's naming contract.");
		}
		var fileName = String(recipe.prefix || "") + name + String(recipe.suffix || "");
		if (!fileName || /[\/\\\x00-\x1f\x7f]/.test(fileName) || fileName === "." || fileName === "..") {
			raise("INVALID_SOURCE_NAME", "The destination must be a single source name.");
		}
		var target = confined(new File(source.getParentFile(), fileName), root);
		var selection = String(new File(sourceFile.getParentFile(), fileName).toPath().toAbsolutePath().normalize());
		if (String(source.getName()) === fileName) return { ok: true, changed: false, target: "sources", selectionSourcePath: selection };
		// Case-only moves need an explicit intermediate publication on insensitive
		// filesystems. Do not pretend a text plan can safely perform that operation.
		if (String(source.getName()).toLowerCase() === fileName.toLowerCase()) raise("SOURCE_CASE_ONLY_RENAME_UNSUPPORTED", "Choose a different name before changing only its case.");
		if (sources.isFile(target) || sources.isDirectory(target)) raise("SOURCE_ALREADY_EXISTS", "The destination already exists.");
		var changes = {}, removals = [], visited = {};
		function collect(file, destination) {
			if (env.isSymbolicLink(file)) raise("SOURCE_LINK_RELOCATION_UNSUPPORTED", "A symbolic link cannot be relocated as source text.");
			file = confined(file, root);
			destination = confined(destination, root);
			var path = String(file.getCanonicalPath());
			if (visited[path]) raise("SOURCE_RELOCATION_CYCLE", "The source contains a directory cycle.");
			visited[path] = true;
			if (sources.isDirectory(file)) {
				sources.files(file).forEach(function (child) { collect(child, new File(destination, String(child.getName()))); });
			} else {
				var draft = sources.draft(file);
				// Saved bytes must be valid text, not a lossy UTF-8 decoding of an asset.
				var text = draft === null ? env.readText(file) : draft;
				changes[String(destination.getCanonicalPath())] = text;
				removals.push(path);
			}
		}
		collect(source, target);
		if (!removals.length) raise("SOURCE_RELOCATION_EMPTY", "There are no source files to relocate.");
		return { ok: true, changed: true, target: "sources", sourceChanges: changes,
			sourceRemovals: removals, selectionSourcePath: selection };
	}
	return { plan: plan };
}())
