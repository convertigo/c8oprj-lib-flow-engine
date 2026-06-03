(function () {
	var File = Packages.java.io.File;
	var Files = Packages.java.nio.file.Files;
	var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
	var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
	var System = Packages.java.lang.System;

	function trim(value) {
		return value == null ? "" : String(value).trim();
	}

	function bool(value) {
		return value === true || String(value).toLowerCase() === "true";
	}

	function resolvePath(path) {
		var raw = trim(path);
		var home = trim(System.getProperty("user.home"));
		if (raw === "~") {
			raw = home;
		} else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
			raw = home + raw.substring(1);
		}
		return new File(raw).getCanonicalFile();
	}

	function readText(file) {
		if (!file || !file.isFile()) {
			return "";
		}
		return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
	}

	function writeText(file, text) {
		Files.createDirectories(file.getParentFile().toPath());
		Files.write(
			file.toPath(),
			new java.lang.String(String(text == null ? "" : text)).getBytes(StandardCharsets.UTF_8),
			StandardOpenOption.CREATE,
			StandardOpenOption.TRUNCATE_EXISTING,
			StandardOpenOption.WRITE
		);
	}

	function tomlEscape(value) {
		return String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
	}

	function tomlLine(key, value) {
		if (value === true || value === false) {
			return key + " = " + String(value);
		}
		if (typeof value === "number") {
			return key + " = " + value;
		}
		return key + " = \"" + tomlEscape(value) + "\"";
	}

	function lines(text) {
		return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
	}

	function sectionRange(sourceLines, sectionName) {
		var header = "[" + sectionName + "]";
		var start = -1;
		var end = sourceLines.length;
		for (var i = 0; i < sourceLines.length; i++) {
			if (trim(sourceLines[i]) === header) {
				start = i;
				break;
			}
		}
		if (start < 0) {
			return { found: false, start: -1, end: -1 };
		}
		for (var j = start + 1; j < sourceLines.length; j++) {
			if (/^\s*\[.+\]\s*$/.test(sourceLines[j])) {
				end = j;
				break;
			}
		}
		return { found: true, start: start, end: end };
	}

	function setSectionLine(sectionLines, key, line, insertIndex) {
		var pattern = new RegExp("^\\s*" + String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=");
		for (var i = 1; i < sectionLines.length; i++) {
			if (pattern.test(sectionLines[i])) {
				var changed = trim(sectionLines[i]) !== line;
				sectionLines[i] = line;
				return changed;
			}
		}
		sectionLines.splice(Math.min(insertIndex, sectionLines.length), 0, line);
		return true;
	}

	function patchSection(existingText, section, values) {
		var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
		var sourceLines = lines(text);
		var range = sectionRange(sourceLines, section);
		var keys = Object.keys(values || {});
		var status = "unchanged";

		if (!range.found) {
			if (sourceLines.length && trim(sourceLines[sourceLines.length - 1])) {
				sourceLines.push("");
			}
			sourceLines.push("[" + section + "]");
			keys.forEach(function (key) {
				sourceLines.push(tomlLine(key, values[key]));
			});
			return {
				status: text ? "updated" : "created",
				text: sourceLines.join("\n").replace(/\n+$/, "\n")
			};
		}

		var block = sourceLines.slice(range.start, range.end);
		keys.forEach(function (key, index) {
			if (setSectionLine(block, key, tomlLine(key, values[key]), index + 1)) {
				status = "updated";
			}
		});
		var next = sourceLines.slice(0, range.start).concat(block).concat(sourceLines.slice(range.end)).join("\n").replace(/\n+$/, "\n");
		if (next === text.replace(/\n+$/, "\n")) {
			status = "unchanged";
		}
		return { status: status, text: next };
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var file = resolvePath(ctx.template(props.path || ""));
			var section = String(ctx.template(props.section || "") || "");
			var values = ctx.template(props.values || {});
			if (!section) {
				ctx.raise("TOML_SECTION_REQUIRED", "toml.ensureSection needs a section name.");
			}
			var patched = patchSection(readText(file), section, values);
			var dryRun = bool(ctx.expr(props.dryRun));
			if (patched.status !== "unchanged" && !dryRun) {
				writeText(file, patched.text);
			}
			return {
				path: String(file.getAbsolutePath()),
				section: section,
				status: patched.status,
				changed: patched.status !== "unchanged",
				dryRun: dryRun
			};
		}
	};
}())
