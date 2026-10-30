/*
 * The universal value notation of Flow: the content of a JavaScript template literal.
 *
 *   texte " avec guillemet                      a literal
 *   ${local.count + 1}                          an expression (alone: its native type is kept)
 *   Bonjour ${input.name}, ${local.n} messages  a composition (text)
 *
 * \${ writes a literal ${ and nothing else is escaped: a backslash is a backslash, except right before ${ where,
 * as in JavaScript, \\ is one backslash (C:\\${local.file} is C:\ followed by the file). An expression ends at the }
 * that closes its ${, braces of object literals and strings inside it included: ${ default(x, {}) } and ${ "}" } are
 * expressions.
 *
 * The former {{ expression }} notation is still read, as an expression, until every project is migrated; it is
 * never written.
 */
(function () {
	// The parts of a value: [{ literal: "..." } | { expression: "..." }], or null when an expression is not closed.
	// legacyOnly reads {{ }} only, ${ and backslashes being plain text (a former quoted FlowScript string).
	function parts(value, legacyOnly) {
		var text = String(value === undefined || value === null ? "" : value);
		var out = [];
		var literal = "";
		var i = 0;
		function flushLiteral() {
			if (literal !== "") {
				out.push({ literal: literal });
				literal = "";
			}
		}
		while (i < text.length) {
			var ch = text.charAt(i);
			if (ch === "\\" && !legacyOnly) {
				var run = 0;
				while (text.charAt(i + run) === "\\") {
					run++;
				}
				if (text.charAt(i + run) === "$" && text.charAt(i + run + 1) === "{") {
					literal += repeat("\\", Math.floor(run / 2));
					if (run % 2 === 1) {
						literal += "${";
						i += run + 2;
					} else {
						i += run;
					}
					continue;
				}
				literal += repeat("\\", run);
				i += run;
				continue;
			}
			var legacy = ch === "{" && text.charAt(i + 1) === "{";
			if ((ch === "$" && text.charAt(i + 1) === "{" && !legacyOnly) || legacy) {
				var end = legacy ? closingLegacy(text, i + 2) : closing(text, i + 2);
				if (end < 0) {
					if (legacy) {
						literal += ch;
						i++;
						continue;
					}
					return null;
				}
				var expression = text.substring(i + 2, end).trim();
				var next = end + (legacy ? 2 : 1);
				if (expression === "") {
					// {{}} or ${} hold nothing to evaluate: they stay text
					literal += text.substring(i, next);
				} else {
					flushLiteral();
					out.push({ expression: expression });
				}
				i = next;
				continue;
			}
			literal += ch;
			i++;
		}
		flushLiteral();
		return out;
	}

	// Index of the } closing a ${ opened before start, or -1.
	function closing(text, start) {
		var depth = 1;
		var quote = "";
		for (var i = start; i < text.length; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\") {
					i++;
				} else if (ch === quote) {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				quote = ch;
			} else if (ch === "{") {
				depth++;
			} else if (ch === "}") {
				depth--;
				if (depth === 0) {
					return i;
				}
			}
		}
		return -1;
	}

	// Index of the }} closing a former {{ outside its strings, or -1. As the former notation, a lone } outside strings
	// means there is no expression there.
	function closingLegacy(text, start) {
		var quote = "";
		for (var i = start; i < text.length - 1; i++) {
			var ch = text.charAt(i);
			if (quote) {
				if (ch === "\\") {
					i++;
				} else if (ch === quote) {
					quote = "";
				}
				continue;
			}
			if (ch === "\"" || ch === "'" || ch === "`") {
				quote = ch;
			} else if (ch === "}") {
				return text.charAt(i + 1) === "}" ? i : -1;
			}
		}
		return -1;
	}

	// The expression of a value made of one expression only (spaces around allowed), else null.
	function exactExpression(value) {
		if (typeof value !== "string") {
			return null;
		}
		var found = parts(value.trim());
		return found && found.length === 1 && found[0].expression !== undefined && found[0].expression !== "" ? found[0].expression : null;
	}

	function hasExpression(value) {
		if (typeof value !== "string" || (value.indexOf("${") === -1 && value.indexOf("{{") === -1)) {
			return false;
		}
		var found = parts(value);
		return !!found && found.some(function (part) { return part.expression !== undefined; });
	}

	function repeat(text, count) {
		return new Array(count + 1).join(text);
	}

	// A literal text written as a value: each ${ is escaped (with the backslashes before it doubled); before an
	// expression, trailing backslashes are doubled too.
	function literal(text, beforeExpression) {
		var escaped = String(text === undefined || text === null ? "" : text).replace(/(\\*)\$\{/g, function (_, slashes) {
			return slashes + slashes + "\\${";
		});
		return beforeExpression ? escaped.replace(/(\\+)$/, "$1$1") : escaped;
	}

	// A value from its parts ([{ literal } | { expression }]).
	function compose(items) {
		return items.map(function (part, index) {
			if (part.expression !== undefined) {
				return "${" + part.expression + "}";
			}
			var next = items[index + 1];
			return literal(part.literal, !!next && next.expression !== undefined);
		}).join("");
	}

	// The literal text of a value without expression (its \${ unescaped), or null when it has expressions.
	function literalText(value) {
		var found = parts(value);
		if (!found) {
			return null;
		}
		var text = "";
		for (var i = 0; i < found.length; i++) {
			if (found[i].expression !== undefined) {
				return null;
			}
			text += found[i].literal;
		}
		return text;
	}

	// The value rebuilt in the current notation, each expression passed through rewrite (identity by default).
	function map(value, rewrite, legacyOnly) {
		var found = parts(value, legacyOnly);
		if (!found) {
			return String(value);
		}
		return compose(found.map(function (part) {
			return part.expression !== undefined ? { expression: rewrite ? rewrite(part.expression) : part.expression } : part;
		}));
	}

	// The text of a value, each expression rendered by evaluate(expression) -> text.
	function render(value, evaluate) {
		var found = parts(value);
		if (!found) {
			return String(value);
		}
		return found.map(function (part) {
			return part.expression !== undefined ? evaluate(part.expression) : part.literal;
		}).join("");
	}

	// Each expression of a value, in order.
	function expressions(value) {
		var found = typeof value === "string" ? parts(value) : null;
		return found ? found.filter(function (part) { return part.expression !== undefined; }).map(function (part) { return part.expression; }) : [];
	}

	// The escape sequences of the string and template literals of JavaScript, read as JavaScript reads them: \n \r \t
	// \b \f \v, \0 (not before a digit), \xHH, \uHHHH, \u{H...} up to 10FFFF, a backslash before a line ending (a
	// continuation, nothing), and any other character for itself (\" \' \` \\ \$ \/). escapeSequence(text, i) reads the
	// sequence whose backslash is at i: { value, end } (end: the index after it), or { error, end } for what JavaScript
	// refuses (a malformed \x or \u, a legacy octal escape \1 to \9 or \0 before a digit, a final backslash).
	var SINGLE_ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };

	function codePointText(code) {
		if (code < 0x10000) {
			return String.fromCharCode(code);
		}
		code -= 0x10000;
		return String.fromCharCode(0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF));
	}

	function escapeSequence(text, i) {
		text = String(text);
		var ch = text.charAt(i + 1);
		if (ch === "") {
			return { error: "A backslash ends the text: write \\\\ for a backslash.", end: i + 1 };
		}
		if (Object.prototype.hasOwnProperty.call(SINGLE_ESCAPES, ch)) {
			return { value: SINGLE_ESCAPES[ch], end: i + 2 };
		}
		if (ch >= "0" && ch <= "9") {
			var next = text.charAt(i + 2);
			if (ch === "0" && !(next >= "0" && next <= "9")) {
				return { value: "\u0000", end: i + 2 };
			}
			return { error: "\\" + ch + (ch === "0" ? next : "") + " is a legacy octal escape, which JavaScript refuses here: write \\u0000 to \\u00FF (\\u000D for a carriage return).", end: i + 2 };
		}
		if (ch === "x" || ch === "u") {
			var braced = ch === "u" && text.charAt(i + 2) === "{";
			if (braced) {
				var close = text.indexOf("}", i + 3);
				var digits = close < 0 ? "" : text.substring(i + 3, close);
				var code = /^[0-9a-fA-F]{1,6}$/.test(digits) ? parseInt(digits, 16) : -1;
				if (code < 0 || code > 0x10FFFF) {
					return { error: "\\u{" + digits + (close < 0 ? "" : "}") + " is not a code point: write \\u{1F600} (at most 10FFFF) or \\uXXXX.", end: close < 0 ? text.length : close + 1 };
				}
				return { value: codePointText(code), end: close + 1 };
			}
			var size = ch === "u" ? 4 : 2;
			var hex = text.substr(i + 2, size);
			if (hex.length !== size || !/^[0-9a-fA-F]+$/.test(hex)) {
				return { error: "\\" + ch + hex + " is a malformed escape: write " + (ch === "u" ? "\\u and four hexadecimal digits (\\uFEFF), or \\u{...}" : "\\x and two hexadecimal digits (\\x41)") + ".", end: i + 2 };
			}
			return { value: String.fromCharCode(parseInt(hex, 16)), end: i + 2 + size };
		}
		if (ch === "\r") {
			return { value: "", end: text.charAt(i + 2) === "\n" ? i + 3 : i + 2 };
		}
		if (ch === "\n" || ch === "\u2028" || ch === "\u2029") {
			return { value: "", end: i + 2 };
		}
		return { value: ch, end: i + 2 };
	}

	// The text of the body of a string literal (without its quotes), its escape sequences read: { value } or { error }.
	function unescape(text) {
		text = String(text === undefined || text === null ? "" : text);
		var out = "";
		var i = 0;
		while (i < text.length) {
			var slash = text.indexOf("\\", i);
			if (slash < 0) {
				out += text.substring(i);
				break;
			}
			out += text.substring(i, slash);
			var sequence = escapeSequence(text, slash);
			if (sequence.error) {
				return { error: sequence.error, index: slash };
			}
			out += sequence.value;
			i = sequence.end;
		}
		return { value: out };
	}

	return {
		parts: parts,
		exactExpression: exactExpression,
		hasExpression: hasExpression,
		literal: literal,
		literalText: literalText,
		compose: compose,
		map: map,
		render: render,
		expressions: expressions,
		escapeSequence: escapeSequence,
		unescape: unescape
	};
}())
