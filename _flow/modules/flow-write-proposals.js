(function () {
	// Text suggestions only: never repair an invalid program silently. The caller checks a brace repair
	// with the real compiler before publishing it. Strings/comments are opaque to the delimiter scan.
	function missingObjectBrace(source) {
		var stack = [], insertions = [], quote = "", comment = "";
		for (var i = 0; i < source.length; i++) {
			var ch = source.charAt(i), next = source.charAt(i + 1);
			if (comment === "line") { if (ch === "\n") comment = ""; continue; }
			if (comment === "block") { if (ch === "*" && next === "/") { comment = ""; i++; } continue; }
			if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = ""; continue; }
			if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
			if (ch === "/" && (next === "/" || next === "*")) { comment = next === "/" ? "line" : "block"; i++; continue; }
			if ("({[".indexOf(ch) >= 0) stack.push(ch);
			else if (")}]".indexOf(ch) >= 0) {
				var wanted = {')':'(', '}':'{', ']':'['}[ch];
				if (stack[stack.length - 1] !== wanted) {
					if (ch !== ")" || stack[stack.length - 1] !== "{" || stack[stack.length - 2] !== "(") return null;
					insertions.push(i); stack.pop();
				}
				if (stack.pop() !== wanted) return null;
			}
		}
		if (quote || comment === "block" || stack.length || !insertions.length) return null;
		var after = source;
		insertions.reverse().forEach(function (at) { after = after.substring(0, at) + "}" + after.substring(at); });
		return {code:after, reason:"Close the argument object after the slot function body: } }). Review the delimiter repair."};
	}
	function edit(source, after, reason) {
		var prefix = 0;
		while (prefix < source.length && prefix < after.length && source.charAt(prefix) === after.charAt(prefix)) prefix++;
		prefix = source.lastIndexOf("\n", prefix - 1) + 1;
		var oldEnd = source.length, newEnd = after.length;
		while (oldEnd > prefix && newEnd > prefix && source.charAt(oldEnd - 1) === after.charAt(newEnd - 1)) { oldEnd--; newEnd--; }
		var tail = source.indexOf("\n", oldEnd);
		if (tail < 0) tail = source.length;
		newEnd += tail - oldEnd; oldEnd = tail;
		var before = source.substring(prefix, oldEnd), next = after.substring(prefix, newEnd);
		if (!before || source.split(before).length !== 2) {prefix=0;before=source;next=after;}
		return {line:source.substring(0,prefix).split("\n").length, before:before, after:next, oldText:before, newText:next, reason:reason};
	}
	function literalCode(source, error) {
		if (!error || error.code !== "FLOWSCRIPT_TEXT_PROPERTY_PATH") return null;
		var match = /Property code of throw takes a literal text, not the value of (.+) \(line (\d+)\)/.exec(error.message || "");
		if (!match) return null;
		var lines = source.split("\n"), from = Math.max(0, Number(match[2]) - 1), expression = match[1];
		for (var i = from; i < Math.min(lines.length, from + 12); i++) {
			var at = lines[i].indexOf("code:"), value = at < 0 ? "" : lines[i].substring(at + 5).match(/^\s*/)[0];
			var start = at + 5 + value.length;
			if (at < 0 || lines[i].substring(start, start + expression.length) !== expression) continue;
			lines[i] = lines[i].substring(0,start) + '"CHOOSE_ERROR_CODE"' + lines[i].substring(start + expression.length);
			var result = edit(source,lines.join("\n"),"Choose the public literal error code before applying; a dynamic code cannot be inferred safely. Keep variable data in message/details.");
			result.requiresChoice = true;
			return result;
		}
		return null;
	}
	return {missingObjectBrace:missingObjectBrace, edit:edit, literalCode:literalCode};
}())
