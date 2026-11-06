/*
 * Regular expressions written in JavaScript syntax, run by java.util.regex under an execution budget: the one utility of
 * the blocks (text.match, text.replace and text.split with regex: true) and of the engine code that runs a pattern.
 *
 *   var patterns = ctx.lib("text-pattern");
 *   var compiled = patterns.compile("^(\\d+)-(\\d+)$", "i");      // TEXT_PATTERN_INVALID (400)
 *   patterns.match(compiled, text);           // { matched, groups }; with g, groups holds every whole match
 *   patterns.test(compiled, text);            // boolean
 *   patterns.replace(compiled, text, "$2-$1", all);   // $1, $&, $`, $', $<name>, $$ as in JavaScript
 *   patterns.split(compiled, text);           // as String.prototype.split, captured groups included
 *
 * Each call takes an optional last argument { maxInputLength, maxSteps, timeoutMs, budget } (compile: { maxPatternLength }).
 * budget, from patterns.budget({ maxSteps, timeoutMs }), is shared by several calls (a search through files can also
 * charge it the volume it reads with budget.charge(count)). Errors are thrown as Error objects with textPatternCode,
 * status and hint; their messages never repeat the pattern nor the text:
 *   TEXT_PATTERN_INVALID (400): a pattern too long, of an unsupported or invalid syntax, an unknown flag;
 *   TEXT_INPUT_TOO_LONG (413): a text longer than maxInputLength, or a result longer than ten times it;
 *   TEXT_PATTERN_TIMEOUT (422): the budget spent (maxSteps reads of the text by the matcher, or timeoutMs).
 *
 * The budget acts inside the matcher: java.util.regex reads the text only through CharSequence.charAt, which counts
 * (com.convertigo.libflowengine.TextPatterns, libs/src; a slower JavaScript CharSequence when it is not compiled).
 * The JavaScript syntax is translated to the same meaning in Java; what Java would read differently is refused:
 *   - flags g, i, m, s (y, u, d, v refused); i matches case as Java's Unicode case folding does (a few letters such
 *     as the Kelvin sign differ);
 *   - ^ $ . \s \S keep their JavaScript meaning (translated); \d \w \b are ASCII in both;
 *   - groups (...), (?:...), (?=...), (?!...), (?<=...), (?<!...), (?<name>...) with a name of ASCII letters and
 *     digits; other (? constructions (atomic, inline flags, comments) are refused; a lookbehind must have a bounded
 *     length (Java);
 *   - escapes \d \D \w \W \s \S \b \B \t \n \r \f \v \0 \xHH \uHHHH \cX \1-\99 \k<name> and a backslash before a
 *     punctuation character; any other letter escape (\p, \u{...}, \A, \Q, \e...) is refused;
 *   - [^] and [] as in JavaScript, [ and && inside a class are literal; a { that is not a quantifier is literal;
 *     possessive quantifiers (a*+) are refused as in JavaScript;
 *   - a back reference to a group that did not take part in the match fails in Java, where JavaScript matches the
 *     empty text.
 */
(function () {
	// Stateless: constants, Java classes and a thread-safe cache. The classes of the JDK come from the engine that
	// evaluates the module (flowEngineClass), else by their full names.
	function javaClass(name) {
		return typeof flowEngineClass === "function" ? flowEngineClass(name) : Packages[name];
	}
	var Pattern = javaClass("java.util.regex.Pattern");
	var JavaString = javaClass("java.lang.String");
	var JavaSystem = javaClass("java.lang.System");
	var CharSequence = javaClass("java.lang.CharSequence");
	var IllegalStateException = javaClass("java.lang.IllegalStateException");
	var FutureTask = javaClass("java.util.concurrent.FutureTask");
	var Callable = javaClass("java.util.concurrent.Callable");
	var StackOverflowError = javaClass("java.lang.StackOverflowError");
	var LIMITS = Object.freeze({ maxPatternLength: 500, maxInputLength: 100000, maxSteps: 10000000, timeoutMs: 500 });
	var SPACE = "\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
	var LINE = "\\n\\r\\u2028\\u2029";
	var HINT = "Write the pattern in JavaScript syntax as a quoted text (backslashes doubled), at most " + LIMITS.maxPatternLength +
		" characters, with flags among g, i, m and s. Supported: classes, quantifiers, groups (...), (?:...), lookarounds, " +
		"(?<name>...), back references; not supported: \\p{...}, \\u{...}, atomic groups, inline flags, possessive quantifiers.";
	// compiled patterns by flags and spelling (java.util.regex.Pattern is immutable and thread safe)
	var cache = new (javaClass("java.util.concurrent.ConcurrentHashMap"))();

	function failure(code, message, status, hint) {
		var error = new Error(message);
		error.textPatternCode = code;
		error.status = status;
		error.hint = hint;
		return error;
	}

	function invalid(message) {
		return failure("TEXT_PATTERN_INVALID", message, 400, HINT);
	}

	function limit(options, name) {
		var value = options && options[name] !== undefined && options[name] !== null ? Number(options[name]) : LIMITS[name];
		return isFinite(value) && value > 0 ? Math.floor(value) : LIMITS[name];
	}

	function parseFlags(spelling) {
		var flags = { global: false, ignoreCase: false, multiline: false, dotAll: false, text: "" };
		var text = spelling === undefined || spelling === null ? "" : String(spelling);
		for (var i = 0; i < text.length; i++) {
			var letter = text.charAt(i), name = { g: "global", i: "ignoreCase", m: "multiline", s: "dotAll" }[letter];
			if (!name || flags[name]) {
				throw invalid("The flags of a pattern are letters among g, i, m and s, each written once; y, u, d and v are not supported.");
			}
			flags[name] = true;
		}
		flags.text = (flags.global ? "g" : "") + (flags.ignoreCase ? "i" : "") + (flags.multiline ? "m" : "") + (flags.dotAll ? "s" : "");
		return flags;
	}

	function hex(code) {
		var digits = code.toString(16);
		return "\\x" + (digits.length < 2 ? "0" : "") + digits;
	}

	// The JavaScript spelling of a pattern in the syntax of java.util.regex, with the same meaning; the names of its groups.
	function translate(source, flags) {
		var out = "", i = 0, n = source.length, inClass = false, groups = 0, names = {}, atom = false;
		function quantified(at) {
			// after a quantifier: ? makes it lazy; another quantifier repeats nothing in JavaScript (a*+ is possessive in Java)
			if (source.charAt(i) === "?") {
				out += "?";
				i++;
			}
			var next = source.charAt(i);
			if (next === "*" || next === "+" || next === "?" || next === "{" && /^\{\d+(,\d*)?\}/.test(source.substring(i))) {
				throw invalid("Nothing to repeat at position " + i + " of the pattern.");
			}
			atom = false;
		}
		while (i < n) {
			var c = source.charAt(i);
			if (c === "\\") {
				if (i + 1 >= n) {
					throw invalid("A pattern cannot end with a backslash.");
				}
				var e = source.charAt(i + 1), at = i;
				i += 2;
				atom = true;
				if (e === "d" || e === "D" || e === "w" || e === "W") {
					out += "\\" + e;
				} else if (e === "b" || e === "B") {
					if (inClass && e === "B") {
						throw invalid("The escape at position " + at + " of the pattern is not supported in a class.");
					}
					out += inClass ? "\\x08" : "\\" + e;
					atom = inClass;
				} else if (e === "s") {
					out += inClass ? SPACE : "[" + SPACE + "]";
				} else if (e === "S") {
					out += "[^" + SPACE + "]";
				} else if (e === "t" || e === "n" || e === "r" || e === "f") {
					out += "\\" + e;
				} else if (e === "v") {
					out += "\\x0b";
				} else if (e === "0" && !/[0-9]/.test(source.charAt(i))) {
					out += "\\x00";
				} else if (/[1-9]/.test(e)) {
					if (inClass) {
						throw invalid("An octal escape at position " + at + " of the pattern is not supported.");
					}
					var reference = e;
					if (/[0-9]/.test(source.charAt(i))) {
						reference += source.charAt(i++);
					}
					out += "\\" + reference;
				} else if (e === "x" && /^[0-9A-Fa-f]{2}/.test(source.substring(i))) {
					out += "\\x" + source.substring(i, i + 2);
					i += 2;
				} else if (e === "u" && /^[0-9A-Fa-f]{4}/.test(source.substring(i))) {
					out += "\\u" + source.substring(i, i + 4);
					i += 4;
				} else if (e === "c" && /^[A-Za-z]/.test(source.substring(i))) {
					out += hex(source.charCodeAt(i) % 32);
					i++;
				} else if (e === "k" && !inClass && /^<[A-Za-z][A-Za-z0-9]*>/.test(source.substring(i))) {
					var name = /^<([A-Za-z][A-Za-z0-9]*)>/.exec(source.substring(i));
					out += "\\k" + name[0];
					i += name[0].length;
				} else if (/[A-Za-z0-9]/.test(e)) {
					throw invalid("The escape at position " + at + " of the pattern is not supported.");
				} else {
					out += "\\" + e;
				}
				continue;
			}
			if (inClass) {
				if (c === "]") {
					inClass = false;
					atom = true;
					out += "]";
				} else if (c === "[" || c === "&") {
					out += "\\" + c;
				} else {
					out += c;
				}
				i++;
				continue;
			}
			if (c === "[") {
				if (source.substring(i, i + 3) === "[^]") {
					out += "[\\s\\S]";
					i += 3;
					atom = true;
				} else if (source.substring(i, i + 2) === "[]") {
					out += "(?!)";
					i += 2;
					atom = true;
				} else {
					inClass = true;
					out += "[";
					i++;
					if (source.charAt(i) === "^") {
						out += "^";
						i++;
					}
				}
				continue;
			}
			if (c === "(") {
				atom = false;
				if (source.charAt(i + 1) === "?") {
					var rest = source.substring(i + 2), named = /^<([A-Za-z][A-Za-z0-9]*)>/.exec(rest);
					if (/^[:=!]/.test(rest)) {
						out += "(?" + rest.charAt(0);
						i += 3;
					} else if (/^<[=!]/.test(rest)) {
						out += "(?" + rest.substring(0, 2);
						i += 4;
					} else if (named) {
						groups++;
						if (Object.prototype.hasOwnProperty.call(names, named[1])) {
							throw invalid("Two groups of the pattern have the same name.");
						}
						names[named[1]] = groups;
						out += "(?" + named[0];
						i += 2 + named[0].length;
					} else {
						throw invalid("The group at position " + i + " of the pattern is not supported: use (...), (?:...), (?=...), (?!...), (?<=...), (?<!...) or (?<name>...) with a name of letters and digits.");
					}
					continue;
				}
				groups++;
				out += "(";
				i++;
				continue;
			}
			if (c === ")") {
				out += ")";
				i++;
				atom = true;
				continue;
			}
			if (c === "{") {
				var quantifier = /^\{\d+(,\d*)?\}/.exec(source.substring(i));
				if (quantifier && atom) {
					out += quantifier[0];
					i += quantifier[0].length;
					quantified();
				} else if (quantifier) {
					throw invalid("Nothing to repeat at position " + i + " of the pattern.");
				} else {
					out += "\\{";
					i++;
					atom = true;
				}
				continue;
			}
			if (c === "}") {
				out += "\\}";
				i++;
				atom = true;
				continue;
			}
			if (c === "*" || c === "+" || c === "?") {
				if (!atom) {
					throw invalid("Nothing to repeat at position " + i + " of the pattern.");
				}
				out += c;
				i++;
				quantified();
				continue;
			}
			if (c === "^") {
				out += flags.multiline ? "(?:(?<![\\s\\S])|(?<=[" + LINE + "]))" : "(?<![\\s\\S])";
				i++;
				atom = false;
				continue;
			}
			if (c === "$") {
				out += flags.multiline ? "(?:(?![\\s\\S])|(?=[" + LINE + "]))" : "(?![\\s\\S])";
				i++;
				atom = false;
				continue;
			}
			if (c === ".") {
				out += flags.dotAll ? "[\\s\\S]" : "[^" + LINE + "]";
				i++;
				atom = true;
				continue;
			}
			if (c === "|") {
				atom = false;
			} else {
				atom = true;
			}
			out += c;
			i++;
		}
		if (inClass) {
			throw invalid("A class of the pattern is not closed with ].");
		}
		return { source: out, groups: groups, names: names };
	}

	/**
	 * @param pattern the pattern in JavaScript syntax (without the slashes)
	 * @param flags letters among g, i, m, s
	 * @return the compiled pattern, kept for the same pattern and flags
	 */
	function compile(pattern, flags, options) {
		var source = pattern === undefined || pattern === null ? "" : String(pattern);
		if (source.length > limit(options, "maxPatternLength")) {
			throw invalid("The pattern is longer than " + limit(options, "maxPatternLength") + " characters.");
		}
		var parsed = parseFlags(flags), key = parsed.text + "/" + source, cached = cache.get(key);
		if (cached !== null) {
			return cached;
		}
		var translated = translate(source, parsed), java;
		try {
			java = Pattern.compile(translated.source, parsed.ignoreCase ? Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE : 0);
		} catch (e) {
			var cause = e && e.javaException ? e.javaException : e;
			var description = cause && typeof cause.getDescription === "function" ? String(cause.getDescription()) : "invalid syntax";
			throw invalid("The pattern is not valid: " + description + ".");
		}
		var compiled = Object.freeze({ pattern: java, flags: parsed, groups: translated.groups, names: Object.freeze(translated.names) });
		if (cache.size() > 512) {
			cache.clear();
		}
		cache.put(key, compiled);
		return compiled;
	}

	function kernel() {
		try {
			// the class path of the project of the call (libs/src compiled by the server), kept by generation; elsewhere
			// by its full name
			var found = typeof flowProjectClass === "function" ? flowProjectClass("com.convertigo.libflowengine.TextPatterns")
				: Packages["com.convertigo.libflowengine.TextPatterns"];
			return typeof found === "function" && typeof found.budget === "function" ? found : null;
		} catch (e) {
			return null;
		}
	}

	// The budget in JavaScript when the Java class is not compiled: the same counting, slower.
	function scriptBudget(maxSteps, timeoutMs) {
		var deadline = JavaSystem.nanoTime() + timeoutMs * 1000000;
		var state = { steps: 0, exceeded: false };
		return {
			script: true,
			state: state,
			charge: function (count) {
				state.steps += Math.max(0, Number(count) || 0);
				if (state.steps > maxSteps || JavaSystem.nanoTime() > deadline) {
					state.exceeded = true;
					throw failure("TEXT_PATTERN_TIMEOUT", "The pattern took more than its budget on this text.", 422, "");
				}
			},
			exceeded: function () { return state.exceeded; },
			text: function (value) {
				return new CharSequence({
					charAt: function (index) {
						if (++state.steps > maxSteps || (state.steps & 255) === 0 && JavaSystem.nanoTime() > deadline) {
							state.exceeded = true;
							throw new IllegalStateException("text pattern budget exceeded");
						}
						return value.charAt(index);
					},
					length: function () { return value.length; },
					subSequence: function (start, end) { return new JavaString(value.substring(start, end)); },
					toString: function () { return new JavaString(value); }
				});
			}
		};
	}

	/** @return a budget of at most maxSteps reads of texts by the matcher, for at most timeoutMs from now */
	function budget(options) {
		var maxSteps = limit(options, "maxSteps"), timeoutMs = limit(options, "timeoutMs"), native = kernel();
		if (native === null) {
			return scriptBudget(maxSteps, timeoutMs);
		}
		var held = native.budget(maxSteps, timeoutMs);
		return {
			script: false,
			native: native,
			held: held,
			charge: function (count) {
				try {
					held.charge(count);
				} catch (e) {
					throw failure("TEXT_PATTERN_TIMEOUT", "The pattern took more than its budget on this text.", 422, "");
				}
			},
			exceeded: function () { return !!held.exceeded(); },
			text: function (value) { return native.budgeted(value, held); }
		};
	}

	function timeout() {
		return failure("TEXT_PATTERN_TIMEOUT", "The pattern took more than its budget on this text (too much backtracking).", 422,
			"Rewrite the pattern without a repetition of a repetition such as (a+)+ or (a|a)*, anchor it, or test a shorter text.");
	}

	// A matcher of compiled on value under the budget of options; its find(from) gives true, false or throws the timeout.
	function operation(compiled, value, options) {
		var text = value === undefined || value === null ? "" : String(value);
		var maxInput = limit(options, "maxInputLength");
		if (text.length > maxInput) {
			throw failure("TEXT_INPUT_TOO_LONG", "The text is longer than " + maxInput + " characters for a pattern.", 413,
				"Test a shorter text, or cut it first (text.split or a substring).");
		}
		if (!compiled || !compiled.pattern) {
			throw invalid("The pattern is not compiled.");
		}
		var spent = options && options.budget ? options.budget : budget(options);
		var matcher = compiled.pattern.matcher(spent.text(text));
		return {
			text: text,
			matcher: matcher,
			find: function (from) {
				var found;
				if (!spent.script) {
					found = spent.native.find(matcher, from === undefined ? -1 : from);
				} else {
					// a FutureTask runs the search: it catches the StackOverflowError of a deep recursion, which a
					// script cannot catch, as TextPatterns.find does
					var task = new FutureTask(new Callable({ call: function () {
						return (from === undefined ? matcher.find() : matcher.find(from)) ? "1" : "0";
					} }));
					task.run();
					try {
						found = String(task.get()) === "1" ? 1 : 0;
					} catch (e) {
						var cause = e && e.javaException ? e.javaException.getCause() : null;
						if (!spent.exceeded() && !(cause instanceof StackOverflowError)) {
							throw e;
						}
						found = -1;
					}
				}
				if (found < 0) {
					throw timeout();
				}
				return found > 0;
			},
			group: function (index) {
				var group = matcher.group(index);
				return group === null ? "" : String(group);
			}
		};
	}

	function groupsOf(run, compiled) {
		var groups = [];
		for (var g = 0; g <= compiled.groups; g++) {
			groups.push(run.group(g));
		}
		return groups;
	}

	/** @return { matched, groups }: the whole match then each group (an unmatched one is empty); with g, every whole match */
	function match(compiled, value, options) {
		var run = operation(compiled, value, options);
		if (compiled.flags.global) {
			var all = [];
			while (run.find()) {
				all.push(run.group(0));
			}
			return { matched: all.length > 0, groups: all };
		}
		return run.find() ? { matched: true, groups: groupsOf(run, compiled) } : { matched: false, groups: [] };
	}

	function test(compiled, value, options) {
		return operation(compiled, value, options).find();
	}

	// the replacement text of JavaScript: $$, $&, $`, $', $n and $nn, $<name> when the pattern has named groups
	function expand(replacement, run, compiled, start, end) {
		if (replacement.indexOf("$") < 0) {
			return replacement;
		}
		var out = "", text = run.text;
		for (var i = 0; i < replacement.length; i++) {
			var c = replacement.charAt(i), next = replacement.charAt(i + 1);
			if (c !== "$" || i + 1 >= replacement.length) {
				out += c;
			} else if (next === "$") {
				out += "$";
				i++;
			} else if (next === "&") {
				out += text.substring(start, end);
				i++;
			} else if (next === "`") {
				out += text.substring(0, start);
				i++;
			} else if (next === "'") {
				out += text.substring(end);
				i++;
			} else if (/[0-9]/.test(next)) {
				var two = replacement.substring(i + 1, i + 3), number = /^[0-9]{2}$/.test(two) ? Number(two) : -1;
				if (number >= 1 && number <= compiled.groups) {
					out += run.group(number);
					i += 2;
				} else if (Number(next) >= 1 && Number(next) <= compiled.groups) {
					out += run.group(Number(next));
					i++;
				} else {
					out += c;
				}
			} else if (next === "<" && Object.keys(compiled.names).length > 0) {
				var close = replacement.indexOf(">", i + 2);
				if (close < 0) {
					out += c;
				} else {
					var name = replacement.substring(i + 2, close);
					out += Object.prototype.hasOwnProperty.call(compiled.names, name) ? run.group(compiled.names[name]) : "";
					i = close;
				}
			} else {
				out += c;
			}
		}
		return out;
	}

	/** @return the text with the first match, or every match when all, replaced as String.prototype.replace does */
	function replace(compiled, value, replacement, all, options) {
		var run = operation(compiled, value, options), text = run.text, out = "", last = 0;
		var spelling = replacement === undefined || replacement === null ? "" : String(replacement);
		var maxResult = limit(options, "maxInputLength") * 10;
		while (run.find()) {
			var start = run.matcher.start(), end = run.matcher.end();
			out += text.substring(last, start) + expand(spelling, run, compiled, start, end);
			last = end;
			if (out.length > maxResult) {
				throw failure("TEXT_INPUT_TOO_LONG", "The replaced text would be longer than " + maxResult + " characters.", 413, "");
			}
			if (!all) {
				break;
			}
		}
		return out + text.substring(last);
	}

	/** @return the items of String.prototype.split on the pattern (g is ignored), captured groups included */
	function split(compiled, value, options) {
		var run = operation(compiled, value, options), text = run.text, size = text.length, items = [], p = 0, q = 0;
		if (size === 0) {
			return run.find(0) ? [] : [""];
		}
		while (q < size) {
			if (!run.find(q)) {
				break;
			}
			var start = run.matcher.start(), end = run.matcher.end();
			if (start >= size) {
				break;
			}
			if (end === p) {
				q = start + 1;
				continue;
			}
			items.push(text.substring(p, start));
			for (var g = 1; g <= compiled.groups; g++) {
				items.push(run.group(g));
			}
			p = end;
			q = p;
		}
		items.push(text.substring(p));
		return items;
	}

	return {
		stateless: true,
		limits: LIMITS,
		compile: compile,
		budget: budget,
		match: match,
		test: test,
		replace: replace,
		split: split,
		// whether an error thrown by this library is one of its coded errors
		failure: function (error) {
			return error && typeof error === "object" && typeof error.textPatternCode === "string" ? error : null;
		}
	};
}())
