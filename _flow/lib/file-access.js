(function () {
	var File = typeof flowEngineClass === "function" ? flowEngineClass("java.io.File") : Packages["java.io.File"];
	function resolve(ctx, value, unrestricted) {
		var path = String(value || "");
		if (!path) ctx.raise("MISSING_FILE_PATH", "A file path is required.");
		var project = new File(String(ctx.read("request.projectDir") || ".")).getCanonicalFile();
		var file = new File(path);
		if (!file.isAbsolute()) file = new File(project, path);
		file = file.getCanonicalFile();
		if (unrestricted === true) {
			ctx.requireAuthoring("file.unrestricted");
			return file;
		}
		// This directory contains application data only. Compare against the literal root as well, so a root
		// replaced by a link to project sources does not enlarge the permitted tree.
		var root = new File(project, "_private/flow-data");
		var expected = String(root.getAbsolutePath());
		var actual = String(file.getAbsolutePath());
		var separator = String(File.separator || "/");
		if (String(root.getCanonicalFile().getAbsolutePath()) !== expected || actual.indexOf(expected + separator) !== 0) {
			ctx.raise("FILE_PATH_NOT_ALLOWED", "File paths must stay under _private/flow-data; unrestrictedPath requires author permission.");
		}
		return file;
	}
	return { resolve: resolve };
}())
