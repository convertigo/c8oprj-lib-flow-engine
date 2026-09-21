(function () {
	function sortedFiles(files, env) {
		if (!files) {
			return [];
		}
		files = env.Arrays.asList(files).toArray();
		files.sort(function (a, b) {
			return String(a.getName()).localeCompare(String(b.getName()));
		});
		return files;
	}

	function fileFingerprint(file, env) {
		if (!file) {
			return "null";
		}
		if (!file.exists()) {
			return "missing:" + env.canonicalPath(file);
		}
		return env.canonicalPath(file) + "#" + file.lastModified() + ":" + file.length();
	}

	function directoryFingerprint(dir, env) {
		if (!dir) {
			return "null";
		}
		if (!dir.exists()) {
			return "missing:" + env.canonicalPath(dir);
		}
		var root = env.canonicalPath(dir);
		var parts = [root];

		function walk(file, prefix) {
			var name = String(file.getName());
			var path = prefix ? prefix + "/" + name : name;
			if (file.isDirectory()) {
				parts.push("d:" + path + ":" + file.lastModified());
				sortedFiles(file.listFiles(), env).forEach(function (child) {
					walk(child, path);
				});
				return;
			}
			if (file.isFile()) {
				parts.push("f:" + path + ":" + file.lastModified() + ":" + file.length());
			}
		}

		sortedFiles(dir.listFiles(), env).forEach(function (file) {
			walk(file, "");
		});
		return parts.join("|");
	}

	return {
		fileFingerprint: fileFingerprint,
		directoryFingerprint: directoryFingerprint
	};
}())
