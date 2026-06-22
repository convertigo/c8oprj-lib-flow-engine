(function () {
	function isScopePath(value, env) {
		if (typeof value !== "string" || value.trim() === "" || value.indexOf(" ") !== -1) {
			return false;
		}
		var dot = value.indexOf(".");
		var first = dot < 0 ? value : value.substring(0, dot);
		return env.scopeNames.indexOf(first) !== -1;
	}

	function objectPathParts(path) {
		var parts = [];
		var text = String(path || "");
		var part = "";
		var i = 0;
		function pushPart() {
			if (part !== "") {
				parts.push(part);
				part = "";
			}
		}
		while (i < text.length) {
			var ch = text.charAt(i);
			if (ch === ".") {
				pushPart();
				i++;
				continue;
			}
			if (ch === "[") {
				pushPart();
				i++;
				while (i < text.length && /\s/.test(text.charAt(i))) {
					i++;
				}
				var bracket = "";
				ch = text.charAt(i);
				if (ch === "\"" || ch === "'") {
					var quote = ch;
					i++;
					while (i < text.length) {
						ch = text.charAt(i++);
						if (ch === quote) {
							break;
						}
						if (ch === "\\" && i < text.length) {
							bracket += text.charAt(i++);
						} else {
							bracket += ch;
						}
					}
				} else {
					while (i < text.length && text.charAt(i) !== "]") {
						bracket += text.charAt(i++);
					}
					bracket = String(bracket).trim();
				}
				while (i < text.length && text.charAt(i) !== "]") {
					i++;
				}
				if (text.charAt(i) === "]") {
					i++;
				}
				if (bracket !== "") {
					parts.push(bracket);
				}
				continue;
			}
			part += ch;
			i++;
		}
		pushPart();
		return parts;
	}

	function readObjectPath(root, path) {
		if (path === undefined || path === null || path === "") {
			return root;
		}
		var parts = objectPathParts(path);
		var current = root;
		for (var i = 0; i < parts.length; i++) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
	}

	function readScopePath(scopes, path, env) {
		if (!isScopePath(path, env)) {
			return undefined;
		}
		var parts = String(path).split(".");
		var current = scopes[parts[0]];
		for (var i = 1; i < parts.length; i++) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[parts[i]];
		}
		return current;
	}

	function writeScopePath(scopes, path, value, env) {
		var parts = String(path || "").split(".");
		if (parts.length === 0 || env.scopeNames.indexOf(parts[0]) === -1) {
			env.raise("INVALID_SCOPE_PATH", "Invalid scope path: " + path);
		}
		if (parts[0] === "result") {
			env.assertNoRuntimeHandle(value, "result");
		}
		var current = scopes[parts[0]];
		for (var i = 1; i < parts.length - 1; i++) {
			var part = parts[i];
			if (current[part] === undefined || current[part] === null) {
				current[part] = {};
			}
			current = current[part];
		}
		current[parts[parts.length - 1]] = value;
		return value;
	}

	function joinPath(base, leaf) {
		base = String(base || "");
		leaf = String(leaf || "");
		if (base === "") {
			return leaf;
		}
		if (leaf === "") {
			return base;
		}
		return base + "." + leaf;
	}

	function flowScriptPath(base, path) {
		var out = String(base || "");
		objectPathParts(path).filter(function (part) {
			return part !== "";
		}).forEach(function (part) {
			if (/^\d+$/.test(part)) {
				out += "[" + part + "]";
			} else {
				out += /^[A-Za-z_$][\w$]*$/.test(part) ? "." + part : "[" + JSON.stringify(part) + "]";
			}
		});
		return out;
	}

	return {
		isScopePath: isScopePath,
		objectPathParts: objectPathParts,
		readObjectPath: readObjectPath,
		readScopePath: readScopePath,
		writeScopePath: writeScopePath,
		joinPath: joinPath,
		flowScriptPath: flowScriptPath
	};
})();
