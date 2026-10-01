(function () {
	// A source is either saved, replaced by text (including ""), or removed.
	// The same view serves reads and discovery; it never publishes to disk.
	function create(request, env) {
		request = request || {};
		var File = env.File;
		var writes = request.sourceDrafts || request.frontendSourceDrafts || request.drafts || {};
		var removals = request.sourceRemovals || [];
		if (!writes || typeof writes !== "object" || Array.isArray(writes) || !Array.isArray(removals)) {
			throw new Error("FLOW_SOURCE_WORKING_COPIES_INVALID");
		}
		var entries = Object.create(null);
		var canonicalPaths = Object.create(null);
		function canonical(file) {
			var path = String(file);
			return canonicalPaths[path] || (canonicalPaths[path] = String(new File(path).getCanonicalPath()));
		}
		function add(path, value) {
			if (typeof path !== "string" || !path) throw new Error("FLOW_SOURCE_PATH_REQUIRED");
			path = canonical(path);
			if (Object.prototype.hasOwnProperty.call(entries, path) && entries[path] !== value) {
				throw new Error("FLOW_SOURCE_ENTRY_CONFLICT: " + path);
			}
			entries[path] = value;
		}
		Object.keys(writes).forEach(function (path) {
			if (typeof writes[path] !== "string") throw new Error("FLOW_SOURCE_DRAFT_TEXT_REQUIRED: " + path);
			add(path, writes[path]);
		});
		removals.forEach(function (path) { add(path, false); });
		var paths = Object.keys(entries).sort();
		function below(root, path) { return path.indexOf(root + File.separator) === 0; }
		function removed(file) { return paths.length > 0 && entries[canonical(file)] === false; }
		function affected(dir) {
			var root = canonical(dir);
			return paths.some(function (path) { return entries[path] === false && below(root, path); });
		}
		function draft(file) {
			if (!paths.length) return null;
			var path = canonical(file);
			if (entries[path] === false) throw new Error("FLOW_SOURCE_REMOVED: " + path);
			return Object.prototype.hasOwnProperty.call(entries, path) ? entries[path] : null;
		}
		function read(file) {
			var text = draft(file);
			return text === null ? String(env.FileUtils.readFileToString(file, "UTF-8")) : text;
		}
		function isFile(file) {
			if (!paths.length) return file.isFile();
			var path = canonical(file);
			return Object.prototype.hasOwnProperty.call(entries, path) ? entries[path] !== false : file.isFile();
		}
		function isDirectory(file) {
			if (!paths.length) return file.isDirectory();
			var root = canonical(file);
			if (Object.prototype.hasOwnProperty.call(entries, root)) return false;
			if (paths.some(function (path) { return entries[path] !== false && below(root, path); })) return true;
			return file.isDirectory() && (!affected(file) || files(file).length > 0);
		}
		function files(dir) {
			var root = canonical(dir);
			var byName = Object.create(null);
			var saved = dir.listFiles();
			for (var i = 0; saved && i < saved.length; i++) byName[String(saved[i].getName())] = saved[i];
			paths.forEach(function (path) {
				if (!below(root, path)) return;
				var relative = path.substring(root.length + 1);
				var separator = relative.indexOf(File.separator);
				var name = separator < 0 ? relative : relative.substring(0, separator);
				if (entries[path] === false) {
					if (separator < 0) delete byName[name];
					return;
				}
				var child = new File(dir, name);
				if (separator >= 0 && isFile(child) || separator < 0 && child.isDirectory()) {
					throw new Error("FLOW_SOURCE_ENTRY_CONFLICT: " + child);
				}
				byName[name] = child;
			});
			return Object.keys(byName).sort().map(function (name) { return byName[name]; }).filter(function (file) {
				return !removed(file) && (!file.isDirectory() || !affected(file) || isDirectory(file));
			});
		}
		function under(dir) {
			var root = canonical(dir);
			return paths.filter(function (path) { return entries[path] !== false && below(root, path); }).map(function (path) {
				return { file: new File(path), relativePath: path.substring(root.length + 1), content: entries[path] };
			});
		}
		return { read: read, draft: draft, files: files, isFile: isFile, isDirectory: isDirectory,
			removed: removed, entriesUnder: under,
			hasChangesUnder: function (dir) {
				var root = canonical(dir);
				return paths.some(function (path) { return below(root, path); });
			},
			fingerprint: function () {
				return paths.map(function (path) { return path + ":" + (entries[path] === false ? "removed" : env.hash(entries[path])); }).join("|");
			},
			count: paths.length };
	}
	return { create: create };
}())
