(function () {
	function normalizePath(path, env) {
		var text = String(path || "").trim().replace(/\\/g, "/");
		if (text === "") {
			env.raise("MISSING_RESOURCE_PATH", "A Flow resource path is required.");
		}
		if (text.charAt(0) === "/" || text.match(/^[A-Za-z]:\//)) {
			env.raise("INVALID_RESOURCE_PATH", "Flow resource paths must be project-relative: " + text);
		}
		var parts = [];
		text.split("/").forEach(function (part) {
			if (!part || part === ".") {
				return;
			}
			if (part === "..") {
				env.raise("INVALID_RESOURCE_PATH", "Flow resource paths cannot contain '..': " + text);
			}
			parts.push(part);
		});
		return parts.join("/");
	}

	function extension(path) {
		var dot = String(path || "").lastIndexOf(".");
		return dot < 0 ? "" : String(path).substring(dot + 1).toLowerCase();
	}

	function isAllowedPath(path) {
		var ext = extension(path);
		if (String(path).indexOf("libs/flow/blocks/") === 0) {
			return String(path).endsWith(".block.js") || String(path).endsWith(".hooks.js");
		}
		if (String(path).indexOf("libs/flow/fragments/") === 0) {
			return String(path).endsWith(".fragment.yaml");
		}
		if (String(path).indexOf("libs/flow/lib/") === 0) {
			return ext === "js";
		}
		if (String(path).indexOf("libs/flow/resources/") === 0) {
			return ["md", "txt", "json", "yaml", "yml"].indexOf(ext) !== -1;
		}
		if (String(path).indexOf("libs/flow/types/editors/") === 0) {
			return ["html", "css", "js"].indexOf(ext) !== -1;
		}
		if (String(path).indexOf("libs/flow/types/") === 0) {
			return ext === "js" || String(path).endsWith(".type.yaml");
		}
		return false;
	}

	function kind(path) {
		if (String(path).indexOf("libs/flow/blocks/") === 0) {
			if (String(path).endsWith(".block.js")) {
				return "graphBlockCode";
			}
			if (String(path).endsWith(".hooks.js")) {
				return "blockHooks";
			}
			return "block";
		}
		if (String(path).indexOf("libs/flow/fragments/") === 0) {
			return "fragment";
		}
		if (String(path).indexOf("libs/flow/lib/") === 0) {
			return "library";
		}
		if (String(path).indexOf("libs/flow/types/editors/") === 0) {
			return "typeEditor";
		}
		if (String(path).indexOf("libs/flow/types/") === 0) {
			return String(path).endsWith(".type.yaml") ? "typeDescriptor" : "typeResource";
		}
		return "resource";
	}

	function name(path) {
		var filename = String(path || "");
		var slash = filename.lastIndexOf("/");
		if (slash >= 0) {
			filename = filename.substring(slash + 1);
		}
		[".fragment.yaml", ".block.js", ".hooks.js", ".type.yaml", ".js"].some(function (suffix) {
			if (filename.endsWith(suffix)) {
				filename = filename.substring(0, filename.length - suffix.length);
				return true;
			}
			return false;
		});
		return filename;
	}

	function mimeType(path) {
		var ext = extension(path);
		if (ext === "md") {
			return "text/markdown";
		}
		if (ext === "txt") {
			return "text/plain";
		}
		if (ext === "json") {
			return "application/json";
		}
		if (ext === "yaml" || ext === "yml") {
			return "text/yaml";
		}
		if (ext === "html") {
			return "text/html";
		}
		if (ext === "css") {
			return "text/css";
		}
		if (ext === "js") {
			return "text/javascript";
		}
		return "application/octet-stream";
	}

	function uri(path) {
		var prefix = "libs/flow/resources/";
		var text = String(path || "");
		if (text.indexOf(prefix) !== 0) {
			return "";
		}
		text = text.substring(prefix.length);
		var dot = text.lastIndexOf(".");
		if (dot > 0) {
			text = text.substring(0, dot);
		}
		return "flow://" + text;
	}

	function markdownBody(content) {
		var text = String(content || "");
		var lines = text.split(/\r?\n/);
		if (lines.length && String(lines[0]).trim() === "---") {
			for (var i = 1; i < lines.length; i++) {
				if (String(lines[i]).trim() === "---") {
					return lines.slice(i + 1).join("\n");
				}
			}
		}
		return text;
	}

	function firstMarkdownHeading(content, fallback) {
		var lines = markdownBody(content).split(/\r?\n/);
		for (var i = 0; i < lines.length; i++) {
			var match = lines[i].match(/^#\s+(.+?)\s*$/);
			if (match) {
				return match[1];
			}
		}
		return fallback;
	}

	function firstMarkdownParagraph(content) {
		var lines = markdownBody(content).split(/\r?\n/);
		for (var i = 0; i < lines.length; i++) {
			var line = String(lines[i] || "").trim();
			if (line === "" || line.charAt(0) === "#") {
				continue;
			}
			if (line.charAt(0) === "-" || /^[0-9]+\.\s/.test(line)) {
				continue;
			}
			return line;
		}
		return "";
	}

	function blockIdFromPath(path) {
		var text = String(path || "").replace(/\\/g, "/");
		var prefix = "libs/flow/blocks/";
		if (text.indexOf(prefix) === 0) {
			text = text.substring(prefix.length);
		}
		[".block.js", ".hooks.js", ".js"].forEach(function (suffix) {
			if (text.endsWith(suffix)) {
				text = text.substring(0, text.length - suffix.length);
			}
		});
		return text.replace(/\//g, ".");
	}

	function globPatterns(value, fallback) {
		if (value === undefined || value === null || value === "") {
			value = fallback;
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value.map(function (item) {
				return String(item || "").trim().replace(/\\/g, "/");
			}).filter(function (item) {
				return item !== "";
			});
		}
		return String(value || "").split(/[\n,]/).map(function (item) {
			return item.trim().replace(/\\/g, "/");
		}).filter(function (item) {
			return item !== "";
		});
	}

	function globToRegExp(pattern) {
		var text = String(pattern || "").replace(/\\/g, "/");
		var out = "^";
		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			if (ch === "*") {
				if (text.charAt(i + 1) === "*") {
					i++;
					if (text.charAt(i + 1) === "/") {
						i++;
						out += "(?:.*/)?";
					} else {
						out += ".*";
					}
				} else {
					out += "[^/]*";
				}
				continue;
			}
			if (ch === "?") {
				out += "[^/]";
				continue;
			}
			if ("\\.^$+{}()|[]".indexOf(ch) !== -1) {
				out += "\\";
			}
			out += ch;
		}
		return new RegExp(out + "$");
	}

	function globMatches(path, patterns) {
		if (!patterns || patterns.length === 0) {
			return true;
		}
		for (var i = 0; i < patterns.length; i++) {
			if (globToRegExp(patterns[i]).test(path)) {
				return true;
			}
		}
		return false;
	}

	return {
		normalizePath: normalizePath,
		extension: extension,
		isAllowedPath: isAllowedPath,
		kind: kind,
		name: name,
		mimeType: mimeType,
		uri: uri,
		firstMarkdownHeading: firstMarkdownHeading,
		firstMarkdownParagraph: firstMarkdownParagraph,
		blockIdFromPath: blockIdFromPath,
		globPatterns: globPatterns,
		globMatches: globMatches
	};
}())
