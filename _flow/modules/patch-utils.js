// Unified patches of Flow sources and project resources (code-patch, flow-source-patch, resource patches). Agents send
// hunks whose empty context lines lost their space, whose line numbers are off or count the new file, several hunks
// at once, git headers or code fences, or an insertion without any context. Every hunk is located in the original text
// in order, with offset tracking: at its numbered position, then where its lines match once (exactly, then ignoring
// trailing spaces); what cannot be placed is refused with the expected and actual lines around, never applied
// elsewhere. The same contract as the patch library of lib_flow_mcp (_flow/lib/patch.js).
(function () {
	var HEADER = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;
	var BARE_HEADER = /^@@(?:\s.*)?$/;
	var FENCE = /^```[A-Za-z0-9_-]*\s*$/;
	var AROUND = 3;
	var CONTEXT_HINT = "Copy the unchanged and removed lines exactly from the text read (an empty line of the file is a hunk line " +
		"made of one space), or send the whole new text.";

	function fail(code, message, hint, details) {
		var error = new Error(message);
		error.code = code;
		error.path = "";
		error.hint = hint || "";
		if (details !== undefined) {
			error.details = details;
		}
		throw error;
	}

	function normalize(text) {
		return String(text === undefined || text === null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	}

	// LF lines, and whether the text ends with a new line; an empty file has no line, and the lines a patch adds to it
	// end with a new line, unless the patch says otherwise.
	function split(content) {
		var text = normalize(content);
		if (text === "") {
			return { lines: [], finalNewline: true };
		}
		var finalNewline = text.charAt(text.length - 1) === "\n";
		var lines = text.split("\n");
		if (finalNewline) {
			lines.pop();
		}
		return { lines: lines, finalNewline: finalNewline };
	}

	function join(lines, finalNewline) {
		return lines.length ? lines.join("\n") + (finalNewline ? "\n" : "") : "";
	}

	function rtrim(text) {
		return String(text).replace(/\s+$/, "");
	}

	function quote(text) {
		return text === undefined ? "(end of file)" : JSON.stringify(String(text));
	}

	function onlyFencesAfter(raw, index) {
		for (var i = index + 1; i < raw.length; i++) {
			if (raw[i] !== "" && !FENCE.test(raw[i])) {
				return false;
			}
		}
		return true;
	}

	function parse(patch) {
		var raw = normalize(patch).split("\n");
		while (raw.length && raw[raw.length - 1] === "") {
			raw.pop();
		}
		var hunks = [];
		var current = null;
		var secondFile = false;
		for (var i = 0; i < raw.length; i++) {
			var line = raw[i];
			var header = HEADER.exec(line);
			if (header || BARE_HEADER.test(line)) {
				if (secondFile) {
					fail("INVALID_PATCH", "The patch changes several files: one patch changes one source.",
						"Send one patch per file.", { patchLine: i + 1 });
				}
				current = {
					index: hunks.length + 1,
					header: line,
					patchLine: i + 1,
					numbered: !!header,
					oldStart: header ? Number(header[1]) : null,
					oldCount: header ? (header[2] === undefined ? 1 : Number(header[2])) : null,
					newStart: header ? Number(header[3]) : null,
					newCount: header ? (header[4] === undefined ? 1 : Number(header[4])) : null,
					lines: []
				};
				hunks.push(current);
				continue;
			}
			if (!current) {
				// diff --git, index, ---, +++ headers, or a fence, before the first hunk
				continue;
			}
			if (/^diff --git /.test(line) || /^--- /.test(line) && i + 1 < raw.length && /^\+\+\+ /.test(raw[i + 1])) {
				secondFile = true;
				current = null;
				continue;
			}
			var marker = line.charAt(0);
			if (marker === " " || marker === "-" || marker === "+") {
				current.lines.push({ op: marker, text: line.substring(1), blank: false });
			} else if (marker === "\\") {
				if (current.lines.length) {
					current.lines[current.lines.length - 1].noNewline = true;
				}
			} else if (line === "") {
				// an unchanged empty line that lost its leading space, or a blank line between two hunks
				current.lines.push({ op: " ", text: "", blank: true });
			} else if (FENCE.test(line) && onlyFencesAfter(raw, i)) {
				break;
			} else {
				fail("INVALID_PATCH", "Line " + (i + 1) + " of the patch is neither a hunk header nor a hunk line: " + quote(line) + ".",
					"Start every hunk line with a space (unchanged), - (removed) or + (added), and every hunk with @@ -old,count +new,count @@.",
					{ patchLine: i + 1, text: line });
			}
		}
		if (!hunks.length) {
			fail("INVALID_PATCH", "Unified patch requires @@ -old,count +new,count @@ hunk headers.",
				"Send a unified diff (--- a/ and +++ b/ headers are optional), without *** Begin Patch wrappers, or the whole new text " +
				"instead (the code argument of code-patch).");
		}
		hunks.forEach(function (hunk) {
			if (!hunk.lines.some(function (line) { return !line.blank; })) {
				fail("INVALID_PATCH", "Hunk " + hunk.index + " (" + hunk.header + ") has no line.",
					"Follow every hunk header with its unchanged ( ), removed (-) and added (+) lines.", { hunk: hunk.index, patchLine: hunk.patchLine });
			}
		});
		return hunks;
	}

	function oldOf(lines) {
		return lines.filter(function (line) { return line.op !== "+"; }).map(function (line) { return line.text; });
	}

	function optionalTail(lines) {
		var count = 0;
		for (var i = lines.length - 1; i >= 0 && lines[i].blank; i--) {
			count++;
		}
		return count;
	}

	function matchesAt(fileLines, position, old, loose) {
		if (position < 0 || position + old.length > fileLines.length) {
			return false;
		}
		for (var i = 0; i < old.length; i++) {
			if (loose ? rtrim(fileLines[position + i]) !== rtrim(old[i]) : fileLines[position + i] !== old[i]) {
				return false;
			}
		}
		return true;
	}

	// Hunks never overlap; an insertion may not fall strictly inside another hunk.
	function free(position, length, taken) {
		for (var i = 0; i < taken.length; i++) {
			var start = taken[i].start, end = taken[i].end;
			if (length === 0 ? (start < position && position < end)
					: (start === end ? (position < start && start < position + length) : (position < end && start < position + length))) {
				return false;
			}
		}
		return true;
	}

	function around(fileLines, from, to) {
		var out = [];
		for (var i = Math.max(0, from); i < Math.min(fileLines.length, to); i++) {
			out.push({ line: i + 1, text: fileLines[i] });
		}
		return out;
	}

	function mismatch(fileLines, hunk, old, expected, taken) {
		var center = expected === null ? 0 : Math.max(0, Math.min(expected, fileLines.length));
		var best = center, bestRun = -1, bestDistance = Infinity;
		for (var position = 0; position < fileLines.length; position++) {
			if (!free(position, 1, taken)) {
				continue;
			}
			var run = 0;
			while (run < old.length && position + run < fileLines.length && rtrim(fileLines[position + run]) === rtrim(old[run])) {
				run++;
			}
			var distance = Math.abs(position - center);
			if (run > bestRun || run === bestRun && distance < bestDistance) {
				best = position;
				bestRun = run;
				bestDistance = distance;
			}
		}
		if (bestRun <= 0) {
			best = center;
			bestRun = 0;
		}
		var index = best + bestRun;
		var message = "Patch context mismatch: hunk " + hunk.index + " (" + hunk.header + ") does not match the text: ";
		message += bestRun > 0
			? "its lines match from line " + (best + 1) + ", but line " + (index + 1) + " is " + quote(fileLines[index]) + " where the patch expects " + quote(old[bestRun]) + "."
			: "line " + (index + 1) + " is " + quote(fileLines[index]) + " where the patch expects " + quote(old[0]) + ".";
		fail("PATCH_CONTEXT_MISMATCH", message, CONTEXT_HINT, {
			hunk: hunk.index,
			header: hunk.header,
			expectedLine: expected === null ? null : expected + 1,
			mismatch: { line: index + 1, expected: old[bestRun], actual: fileLines[index] === undefined ? null : fileLines[index] },
			expected: old,
			actual: around(fileLines, best - AROUND, best + old.length + AROUND)
		});
	}

	function located(hunk, lines, position, expected, how, trimmed) {
		var added = 0, removed = 0;
		lines.forEach(function (line) {
			if (line.op === "+") added++;
			else if (line.op === "-") removed++;
		});
		return {
			hunk: hunk,
			lines: lines,
			position: position,
			oldLength: oldOf(lines).length,
			expected: expected,
			how: how,
			trimmed: trimmed || 0,
			added: added,
			removed: removed
		};
	}

	// A hunk without unchanged or removed lines has its line numbers alone: -N,0 inserts after line N, and +M says the
	// first added line becomes line M. They must agree.
	function locateInsertion(fileLines, hunk, state, taken) {
		if (!hunk.numbered) {
			fail("PATCH_INSERT_WITHOUT_CONTEXT", "Hunk " + hunk.index + " adds lines without any unchanged or removed line, and its header has no line number: nothing tells where to insert them.",
				"Add one unchanged line before or after the added lines (a space then the line), or send the whole new text.",
				{ hunk: hunk.index, header: hunk.header });
		}
		var oldSide = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
		var newSide = hunk.newStart - 1 - state.delta;
		if (oldSide < 0 || oldSide > fileLines.length) {
			fail("PATCH_LINE_OUT_OF_RANGE", "Hunk " + hunk.index + " (" + hunk.header + ") inserts after line " + oldSide + ", but the text has " + fileLines.length + " lines.",
				CONTEXT_HINT, { hunk: hunk.index, header: hunk.header, lines: fileLines.length });
		}
		if (oldSide !== newSide) {
			fail("PATCH_INSERT_AMBIGUOUS", "Hunk " + hunk.index + " (" + hunk.header + ") adds lines without context and its two line numbers disagree: " +
				"the old side inserts them after line " + oldSide + " (" + quote(fileLines[oldSide - 1]) + "), the new side after line " + newSide +
				" (" + quote(fileLines[newSide - 1]) + ").",
				"Add one unchanged line before or after the added lines so the position is checked (a space then the line), or send the whole new text.",
				{ hunk: hunk.index, header: hunk.header, oldSideAfterLine: oldSide, newSideAfterLine: newSide,
					actual: around(fileLines, Math.min(oldSide, newSide) - AROUND, Math.max(oldSide, newSide) + AROUND) });
		}
		if (!free(oldSide, 0, taken)) {
			fail("PATCH_HUNKS_OVERLAP", "Hunk " + hunk.index + " (" + hunk.header + ") inserts inside the lines of another hunk.",
				"Merge the two hunks into one, or send the whole new text.", { hunk: hunk.index, header: hunk.header });
		}
		return located(hunk, hunk.lines, oldSide, oldSide, "insertion", 0);
	}

	function locate(fileLines, hunk, state, taken) {
		var old = oldOf(hunk.lines);
		if (!old.length) {
			return locateInsertion(fileLines, hunk, state, taken);
		}
		var expected = hunk.numbered ? hunk.oldStart - 1 : null;
		var candidates = [];
		if (hunk.numbered) {
			[expected, expected + state.lastOffset, expected - state.delta, hunk.newStart - 1 - state.delta].forEach(function (position) {
				if (candidates.indexOf(position) === -1) candidates.push(position);
			});
		}
		var tail = optionalTail(hunk.lines);
		var attempts = [{ lines: hunk.lines, loose: false, trimmed: 0 }];
		if (tail) attempts.push({ lines: hunk.lines.slice(0, hunk.lines.length - tail), loose: false, trimmed: tail });
		attempts.push({ lines: hunk.lines, loose: true, trimmed: 0 });
		if (tail) attempts.push({ lines: hunk.lines.slice(0, hunk.lines.length - tail), loose: true, trimmed: tail });
		for (var a = 0; a < attempts.length; a++) {
			var attempt = attempts[a];
			var lines = oldOf(attempt.lines);
			if (!lines.length) {
				continue;
			}
			for (var c = 0; c < candidates.length; c++) {
				if (matchesAt(fileLines, candidates[c], lines, attempt.loose) && free(candidates[c], lines.length, taken)) {
					return located(hunk, attempt.lines, candidates[c], expected, attempt.loose ? "whitespace" : candidates[c] === expected ? "exact" : "offset", attempt.trimmed);
				}
			}
			var matches = [];
			for (var position = 0; position + lines.length <= fileLines.length; position++) {
				if (matchesAt(fileLines, position, lines, attempt.loose) && free(position, lines.length, taken)) {
					matches.push(position);
				}
			}
			if (matches.length === 1) {
				return located(hunk, attempt.lines, matches[0], expected, attempt.loose ? "whitespace" : hunk.numbered ? "offset" : "context", attempt.trimmed);
			}
			if (matches.length > 1) {
				fail("PATCH_CONTEXT_AMBIGUOUS", "Hunk " + hunk.index + " (" + hunk.header + ") matches the text at lines " +
					matches.slice(0, 8).map(function (match) { return match + 1; }).join(", ") + (matches.length > 8 ? "…" : "") +
					(hunk.numbered ? ", not at line " + hunk.oldStart : "") + ": its position is not certain.",
					"Fix the line numbers of the hunk header, or add unchanged lines around the change so that it matches once.",
					{ hunk: hunk.index, header: hunk.header, expectedLine: expected === null ? null : expected + 1,
						matchingLines: matches.slice(0, 20).map(function (match) { return match + 1; }) });
			}
		}
		return mismatch(fileLines, hunk, old, expected, taken);
	}

	function notesOf(place) {
		var hunk = place.hunk;
		var notes = [];
		if (place.how === "offset" && place.expected !== null) {
			notes.push("Hunk " + hunk.index + " was applied at line " + (place.position + 1) + " instead of line " + (place.expected + 1) + " (unique match of its lines).");
		} else if (place.how === "context") {
			notes.push("Hunk " + hunk.index + " has no line numbers and was applied at line " + (place.position + 1) + " (unique match of its lines).");
		} else if (place.how === "whitespace") {
			notes.push("Hunk " + hunk.index + " matched line " + (place.position + 1) + " ignoring trailing spaces; its unchanged lines keep the text as it was.");
		}
		var blanks = place.lines.filter(function (line) { return line.blank; }).length;
		if (blanks) {
			notes.push("Hunk " + hunk.index + ": " + blanks + " empty patch line(s) read as unchanged empty line(s).");
		}
		return notes;
	}

	// content patched: { content, hunks (their number), appliedHunks (where each one applied), notes (how, when not
	// exactly at its line) }; a hunk that cannot be placed raises PATCH_CONTEXT_MISMATCH, PATCH_CONTEXT_AMBIGUOUS,
	// PATCH_INSERT_AMBIGUOUS... with details. The final new line follows git: a hunk reaching the end of the text decides
	// it ("\ No newline at end of file" after its last line removes it, an added or replaced last line has one).
	function applyUnifiedPatch(content, patch) {
		var file = split(content);
		var hunks = parse(patch);
		var taken = [];
		var places = [];
		var state = { delta: 0, lastOffset: 0 };
		hunks.forEach(function (hunk) {
			var place = locate(file.lines, hunk, state, taken);
			taken.push({ start: place.position, end: place.position + place.oldLength });
			places.push(place);
			state.delta += place.added - place.removed;
			if (place.expected !== null) {
				state.lastOffset = place.position - place.expected;
			}
		});
		var ordered = places.slice().sort(function (left, right) {
			return left.position - right.position || left.hunk.index - right.hunk.index;
		});
		var out = [];
		var cursor = 0;
		var finalNewline = file.finalNewline;
		ordered.forEach(function (place) {
			for (; cursor < place.position; cursor++) {
				out.push(file.lines[cursor]);
			}
			var line = place.position;
			var lastNew = null;
			var removedLast = false;
			place.lines.forEach(function (hunkLine) {
				if (hunkLine.op === " ") {
					// the text's own line: a whitespace match changes nothing on unchanged lines
					out.push(file.lines[line]);
					line++;
					lastNew = hunkLine;
				} else if (hunkLine.op === "-") {
					removedLast = removedLast || line === file.lines.length - 1;
					line++;
				} else {
					out.push(hunkLine.text);
					lastNew = hunkLine;
				}
			});
			cursor = line;
			if (place.position + place.oldLength === file.lines.length) {
				if (lastNew && lastNew.noNewline) {
					finalNewline = false;
				} else if (removedLast || lastNew && lastNew.op === "+") {
					finalNewline = true;
				}
			}
		});
		for (; cursor < file.lines.length; cursor++) {
			out.push(file.lines[cursor]);
		}
		var notes = [];
		places.forEach(function (place) {
			notes = notes.concat(notesOf(place));
		});
		return {
			content: join(out, finalNewline),
			hunks: places.length,
			appliedHunks: places.map(function (place) {
				var report = {
					hunk: place.hunk.index,
					header: place.hunk.header,
					match: place.how,
					added: place.added,
					removed: place.removed
				};
				if (place.how === "insertion") {
					report.afterLine = place.position;
				} else {
					report.line = place.position + 1;
				}
				if (place.expected !== null && place.position !== place.expected) {
					report.offset = place.position - place.expected;
				}
				return report;
			}),
			notes: notes
		};
	}

	return {
		normalize: normalize,
		split: split,
		join: join,
		applyUnifiedPatch: applyUnifiedPatch,
		// the historical entry point of the engine (env is no longer needed: errors carry their details)
		applyUnifiedPatchText: function (content, patch) {
			return applyUnifiedPatch(content, patch);
		}
	};
}())
