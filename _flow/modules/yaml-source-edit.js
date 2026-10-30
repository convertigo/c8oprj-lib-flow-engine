// Minimal edits of a YAML source (engine.yaml): a configuration mutation changes the lines of what it changes and keeps
// the other lines as they are (comments, blank lines, quoting, block scalars, flow collections, order), where a
// rewrite of the whole definition by Jackson moved every line and broke the line-numbered patches of an agent.
//
// The old text is read as nested block mappings (key: value lines, the value inline, a block scalar, a flow collection,
// a block sequence, or a deeper mapping), only as far as the edit needs: a key removed loses its lines, a key whose value
// changed is rendered again (by Jackson, at its indentation) unless both values are mappings written as blocks, which
// are then edited key by key, and a new key is added after the last key of its mapping. The text edited is parsed again
// and must give the new definition exactly (keys in order); otherwise, or for a text this reader does not follow (tabs,
// CR, documents, keys it does not read), the caller writes the whole definition as before (minimalEdit returns null).
//
// minimalEdit(oldSource, newDefinition, env) -> new text or null
//   env: parseYamlSource(text, fallback), toYamlSource(value), normalizeTree(value)
(function () {
	var KEY = /^([A-Za-z0-9_$][A-Za-z0-9_$.\-\/]*|"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'):(?=\s|$)(.*)$/;

	function Unsupported() {}

	function unsupported() {
		throw new Unsupported();
	}

	function indentOf(line) {
		var match = /^ */.exec(line);
		return match[0].length;
	}

	function blankOrComment(line) {
		return /^\s*(?:#.*)?$/.test(line);
	}

	function emptyValue(rest) {
		var text = String(rest || "").trim();
		return text === "" || text.charAt(0) === "#";
	}

	function unquote(key) {
		if (key.charAt(0) === "\"") {
			return JSON.parse(key);
		}
		if (key.charAt(0) === "'") {
			return key.substring(1, key.length - 1).replace(/''/g, "'");
		}
		return key;
	}

	function isMapping(value) {
		return !!value && typeof value === "object" && Object.prototype.toString.call(value) === "[object Object]";
	}

	function same(left, right) {
		return JSON.stringify(left) === JSON.stringify(right);
	}

	// The block mapping of the lines [from, to) at an indentation: its keys, each with the lines of its value.
	function scanMapping(lines, from, to, indent) {
		var entries = [];
		var keys = {};
		var i = from;
		while (i < to) {
			var line = lines[i];
			if (blankOrComment(line)) {
				i++;
				continue;
			}
			if (indentOf(line) !== indent) {
				unsupported();
			}
			var match = KEY.exec(line.substring(indent));
			if (!match) {
				unsupported();
			}
			var key = unquote(match[1]);
			if (Object.prototype.hasOwnProperty.call(keys, key)) {
				unsupported();
			}
			keys[key] = true;
			var rest = match[2];
			var empty = emptyValue(rest);
			if (!empty && /^\s*[&*!]/.test(rest)) {
				// anchors, aliases and tags: another node may depend on this one
				unsupported();
			}
			var last = i;
			for (var j = i + 1; j < to; j++) {
				var next = lines[j];
				if (next.trim() === "") {
					continue;
				}
				var nextIndent = indentOf(next);
				if (nextIndent > indent || empty && nextIndent === indent && /^-(?:\s|$)/.test(next.substring(indent))) {
					last = j;
					continue;
				}
				if (blankOrComment(next)) {
					continue;
				}
				break;
			}
			var entry = { key: key, start: i, end: last + 1, indent: indent, child: null };
			if (empty && last > i) {
				var first = i + 1;
				while (first < entry.end && blankOrComment(lines[first])) {
					first++;
				}
				var childIndent = first < entry.end ? indentOf(lines[first]) : -1;
				if (childIndent > indent && !/^-(?:\s|$)/.test(lines[first].substring(childIndent))) {
					entry.child = scanMapping(lines, i + 1, entry.end, childIndent);
				}
			}
			entries.push(entry);
			i = entry.end;
		}
		return { indent: indent, entries: entries };
	}

	function render(key, value, indent, env) {
		var pair = {};
		pair[key] = value;
		var text = String(env.toYamlSource(pair)).replace(/\n+$/, "");
		var prefix = new Array(indent + 1).join(" ");
		return text.split("\n").map(function (line) {
			return line === "" ? line : prefix + line;
		});
	}

	// The edits turning the mapping of the old value into the new one.
	function editMapping(mapping, oldValue, newValue, edits, env) {
		var textKeys = mapping.entries.map(function (entry) { return entry.key; });
		var oldKeys = Object.keys(oldValue);
		if (oldKeys.length !== textKeys.length || oldKeys.some(function (key, index) { return textKeys[index] !== key; })) {
			unsupported();
		}
		if (!mapping.entries.length) {
			unsupported();
		}
		mapping.entries.forEach(function (entry) {
			var key = entry.key;
			if (!Object.prototype.hasOwnProperty.call(newValue, key) || newValue[key] === undefined) {
				edits.push({ start: entry.start, end: entry.end, lines: [] });
			} else if (same(oldValue[key], newValue[key])) {
				return;
			} else if (entry.child && isMapping(oldValue[key]) && isMapping(newValue[key]) && Object.keys(newValue[key]).length > 0) {
				editMapping(entry.child, oldValue[key], newValue[key], edits, env);
			} else {
				edits.push({ start: entry.start, end: entry.end, lines: render(key, newValue[key], entry.indent, env) });
			}
		});
		var added = [];
		Object.keys(newValue).forEach(function (key) {
			if (!Object.prototype.hasOwnProperty.call(oldValue, key) && newValue[key] !== undefined) {
				added = added.concat(render(key, newValue[key], mapping.indent, env));
			}
		});
		if (added.length) {
			var end = mapping.entries[mapping.entries.length - 1].end;
			edits.push({ start: end, end: end, lines: added });
		}
	}

	function minimalEdit(oldSource, newDefinition, env) {
		var text = String(oldSource === undefined || oldSource === null ? "" : oldSource);
		if (!text.trim() || /[\r\t]/.test(text) || /^(?:---|\.\.\.|%)/m.test(text)) {
			return null;
		}
		try {
			var oldDefinition = env.normalizeTree(env.parseYamlSource(text, "{}"));
			var target = env.normalizeTree(newDefinition);
			if (!isMapping(oldDefinition) || !isMapping(target)) {
				return null;
			}
			if (same(oldDefinition, target)) {
				return text;
			}
			var finalNewline = text.charAt(text.length - 1) === "\n";
			var lines = text.split("\n");
			if (finalNewline) {
				lines.pop();
			}
			var root = scanMapping(lines, 0, lines.length, 0);
			var edits = [];
			editMapping(root, oldDefinition, target, edits, env);
			edits.sort(function (left, right) { return right.start - left.start || right.end - left.end; });
			edits.forEach(function (edit) {
				Array.prototype.splice.apply(lines, [edit.start, edit.end - edit.start].concat(edit.lines));
			});
			var edited = lines.join("\n") + (finalNewline || !lines.length ? "\n" : "");
			// the edited text must say exactly what the new definition says, keys in order
			return same(env.normalizeTree(env.parseYamlSource(edited, "{}")), target) ? edited : null;
		} catch (e) {
			if (e instanceof Unsupported) {
				return null;
			}
			// a text the parser refuses, or a value the renderer cannot write: the caller rewrites it all
			return null;
		}
	}

	return {
		minimalEdit: minimalEdit
	};
}())
