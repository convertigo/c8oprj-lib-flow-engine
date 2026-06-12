(function () {
	function splitContentLines(content) {
		var text = String(content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		var trailingNewline = text.length > 0 && text.charAt(text.length - 1) === "\n";
		var lines = text.split("\n");
		if (trailingNewline) {
			lines.pop();
		}
		return {
			lines: lines,
			trailingNewline: trailingNewline
		};
	}

	function joinContentLines(parts) {
		return parts.lines.join("\n") + (parts.trailingNewline ? "\n" : "");
	}

	function assertPatchLine(actual, expected, lineNumber, env) {
		if (actual !== expected) {
			env.raise("PATCH_CONTEXT_MISMATCH", "Patch context mismatch at line " + lineNumber,
				null, "Read the resource again and regenerate the patch from the current content.");
		}
	}

	function oldLinesForHunk(hunkLines) {
		var oldLines = [];
		hunkLines.forEach(function (patchLine) {
			var marker = patchLine.charAt(0);
			if (marker === " " || marker === "-") {
				oldLines.push(patchLine.substring(1));
			}
		});
		return oldLines;
	}

	function hunkMatchesAt(lines, position, oldLines) {
		if (position < 0 || position + oldLines.length > lines.length) {
			return false;
		}
		for (var i = 0; i < oldLines.length; i++) {
			if (lines[position + i] !== oldLines[i]) {
				return false;
			}
		}
		return true;
	}

	function findHunkPosition(lines, preferred, oldLines, env) {
		if (oldLines.length === 0 || hunkMatchesAt(lines, preferred, oldLines)) {
			return preferred;
		}
		var best = -1;
		var bestDistance = Number.MAX_VALUE;
		for (var i = 0; i <= lines.length - oldLines.length; i++) {
			if (hunkMatchesAt(lines, i, oldLines)) {
				var distance = Math.abs(i - preferred);
				if (distance < bestDistance) {
					best = i;
					bestDistance = distance;
				}
			}
		}
		if (best >= 0) {
			return best;
		}
		assertPatchLine(lines[preferred], oldLines[0], preferred + 1, env);
		return preferred;
	}

	function applyHunkLines(lines, parts, position, hunkLines, env) {
		var delta = 0;
		hunkLines.forEach(function (patchLine) {
			if (patchLine.indexOf("\\ No newline at end of file") === 0) {
				parts.trailingNewline = false;
				return;
			}
			var marker = patchLine.charAt(0);
			var value = patchLine.substring(1);
			if (marker === " ") {
				assertPatchLine(lines[position], value, position + 1, env);
				position++;
			} else if (marker === "-") {
				assertPatchLine(lines[position], value, position + 1, env);
				lines.splice(position, 1);
				delta--;
			} else if (marker === "+") {
				lines.splice(position, 0, value);
				position++;
				delta++;
			}
		});
		return delta;
	}

	function applyUnifiedPatchText(content, patch, env) {
		var parts = splitContentLines(content);
		var lines = parts.lines.slice(0);
		var patchLines = String(patch || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		var hunkHeader = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;
		var delta = 0;
		var hunks = 0;
		var index = 0;
		while (index < patchLines.length) {
			var line = patchLines[index++];
			var match = line.match(hunkHeader);
			if (!match) {
				continue;
			}
			hunks++;
			var hunkLines = [];
			while (index < patchLines.length && !patchLines[index].match(hunkHeader)) {
				var patchLine = patchLines[index++];
				if (patchLine === "" && index >= patchLines.length) {
					break;
				}
				hunkLines.push(patchLine);
			}
			var preferred = Number(match[1]) - 1 + delta;
			var position = findHunkPosition(lines, preferred, oldLinesForHunk(hunkLines), env);
			delta += applyHunkLines(lines, parts, position, hunkLines, env);
		}
		if (hunks === 0) {
			env.raise("INVALID_PATCH", "Unified patch does not contain any @@ hunk.",
				null, "Send a real unified diff with an @@ header, or pass the full replacement source in the code argument instead of codepatch.");
		}
		parts.lines = lines;
		return {
			content: joinContentLines(parts),
			hunks: hunks
		};
	}

	return {
		applyUnifiedPatchText: applyUnifiedPatchText
	};
}())
