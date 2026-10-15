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

	return {
		parts: parts,
		exactExpression: exactExpression,
		hasExpression: hasExpression,
		literal: literal,
		literalText: literalText,
		compose: compose,
		map: map,
		render: render,
		expressions: expressions
	};
}())
