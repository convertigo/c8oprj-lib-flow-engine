/*
 * Copyright (c) 2001-2026 Convertigo SA.
 *
 * This program  is free software; you  can redistribute it and/or
 * Modify  it  under the  terms of the  GNU  Affero General Public
 * License  as published by  the Free Software Foundation;  either
 * version  3  of  the  License,  or  (at your option)  any  later
 * version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY;  without even the implied warranty of
 * MERCHANTABILITY  or  FITNESS  FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this program;
 * if not, see <http://www.gnu.org/licenses/>.
 */

package com.convertigo.libflowengine;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * The _meta header of a block source read in Java, as block-code-source-service.js extractMeta and
 * flow-script-parser-service.js parseFlowScriptMetadataValue (static metadata) read it, ported line by line. The caller
 * keeps the JavaScript reading as the fallback: any case this reader does not take on, an error included, answers null,
 * and the JavaScript then reads the header with its own messages. It never throws.
 *
 * extract(text) answers null (fall back), {"none":true} (no header), or {"meta":...,"start":n,"end":n}, the declaration
 * being text[start, end).
 */
public final class BlockMetaReader {
	private static final class Fallback extends RuntimeException {
		private static final long serialVersionUID = 1L;

		Fallback() {
			super(null, null, false, false);
		}
	}

	private static final Pattern NEXT = Pattern.compile(
			"^(?:function\\b|flow\\b|block\\b|(?:const|let|var)\\b|\\(|[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\s*\\()");
	private static final Pattern IDENTIFIER = Pattern.compile("^[A-Za-z_$][\\w$]*$");
	private static final Pattern DECIMAL = Pattern.compile("^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$");
	private static final Pattern HEX = Pattern.compile("^0[xX][0-9a-fA-F]+$");

	private BlockMetaReader() {
	}

	public static String extract(String text) {
		try {
			return extract0(text);
		} catch (RuntimeException | StackOverflowError e) {
			return null;
		}
	}

	/** parseFlowScriptMetadataValue of a whole token, as JSON; null to fall back. */
	public static String metadataValue(String token) {
		try {
			var sb = new StringBuilder();
			json(parseValue(token), sb);
			return sb.toString();
		} catch (RuntimeException | StackOverflowError e) {
			return null;
		}
	}

	// the characters of \s in a JavaScript regular expression
	static boolean space(char c) {
		return c == ' ' || c >= '\t' && c <= '\r' || c == '\u00a0' || c == '\u1680' || c >= '\u2000' && c <= '\u200a'
				|| c == '\u2028' || c == '\u2029' || c == '\u202f' || c == '\u205f' || c == '\u3000' || c == '\ufeff';
	}

	static boolean word(char c) {
		return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_';
	}

	static String trim(String s) {
		int a = 0, b = s.length();
		while (a < b && space(s.charAt(a))) a++;
		while (b > a && space(s.charAt(b - 1))) b--;
		return s.substring(a, b);
	}

	static int skipTrivia(String text, int start) {
		int i = start;
		while (i < text.length()) {
			if (space(text.charAt(i))) { i++; continue; }
			if (text.startsWith("//", i)) {
				while (i < text.length() && text.charAt(i) != '\n' && text.charAt(i) != '\r') i++;
			} else if (text.startsWith("/*", i)) {
				int end = text.indexOf("*/", i + 2);
				if (end < 0) throw new Fallback();
				i = end + 2;
			} else break;
		}
		return i;
	}

	static int metaDeclarationEnd(String text, int start) {
		int len;
		if (text.startsWith("const", start)) len = 5;
		else if (text.startsWith("let", start) || text.startsWith("var", start)) len = 3;
		else return -1;
		if (start + len < text.length() && word(text.charAt(start + len))) return -1;
		int name = skipTrivia(text, start + len);
		if (!text.startsWith("_meta", name)) return -1;
		if (name + 5 < text.length() && (word(text.charAt(name + 5)) || text.charAt(name + 5) == '$')) return -1;
		return name + 5;
	}

	static int metadataObjectEnd(String text, int start) {
		int depth = 0;
		char quote = 0;
		for (int i = start; i < text.length(); i++) {
			char ch = text.charAt(i);
			if (quote != 0) {
				if (ch == '\\') i++;
				else if (ch == quote) quote = 0;
			} else if (ch == '"' || ch == '\'' || ch == '`') quote = ch;
			else if (text.startsWith("//", i) || text.startsWith("/*", i)) i = skipTrivia(text, i) - 1;
			else if (ch == '{') depth++;
			else if (ch == '}' && --depth == 0) return i;
		}
		return -1;
	}

	static String stripMetadataComments(String text) {
		var out = new StringBuilder(text.length());
		char quote = 0;
		for (int i = 0; i < text.length(); i++) {
			char ch = text.charAt(i);
			if (quote != 0) {
				out.append(ch);
				if (ch == '\\') {
					// text.charAt(++i): "" past the end
					if (++i < text.length()) out.append(text.charAt(i));
				} else if (ch == quote) quote = 0;
			} else if (ch == '"' || ch == '\'' || ch == '`') {
				quote = ch;
				out.append(ch);
			} else if (text.startsWith("//", i) || text.startsWith("/*", i)) {
				int end = skipTrivia(text, i);
				for (int k = i; k < end; k++) {
					char c = text.charAt(k);
					out.append(c == '\r' || c == '\n' ? c : ' ');
				}
				i = end - 1;
			} else out.append(ch);
		}
		return out.toString();
	}

	static String extract0(String text) {
		int start = skipTrivia(text, 0);
		int declarationEndOffset = metaDeclarationEnd(text, start);
		if (declarationEndOffset < 0) return "{\"none\":true}";
		int valueStart = skipTrivia(text, declarationEndOffset);
		if (valueStart >= text.length() || text.charAt(valueStart) != '=') throw new Fallback();
		valueStart = skipTrivia(text, valueStart + 1);
		if (valueStart >= text.length() || text.charAt(valueStart) != '{') throw new Fallback();
		int end = metadataObjectEnd(text, valueStart);
		if (end < 0) throw new Fallback();
		int next = skipTrivia(text, end + 1);
		boolean hasSemicolon = next < text.length() && text.charAt(next) == ';';
		int declarationEnd = hasSemicolon ? next + 1 : end + 1;
		if (hasSemicolon) next = skipTrivia(text, next + 1);
		if (!hasSemicolon && next < text.length()) {
			var between = text.substring(end + 1, next);
			if (between.indexOf('\r') < 0 && between.indexOf('\n') < 0) throw new Fallback();
			if (!NEXT.matcher(text.substring(next)).lookingAt()) throw new Fallback();
		}
		if (metaDeclarationEnd(text, next) >= 0) throw new Fallback();
		var literal = stripMetadataComments(text.substring(valueStart, end + 1));
		var sb = new StringBuilder(literal.length() + 64);
		sb.append("{\"meta\":");
		json(parseValue(literal), sb);
		sb.append(",\"start\":").append(start).append(",\"end\":").append(declarationEnd).append('}');
		return sb.toString();
	}

	// flow-script-parser-service.js, static metadata

	static List<String> splitTopLevel(String text, char separator, boolean firstOnly) {
		var out = new ArrayList<String>();
		int start = 0, paren = 0, brace = 0, bracket = 0;
		boolean inString = false;
		char quote = 0;
		for (int i = 0; i < text.length(); i++) {
			char ch = text.charAt(i);
			if (inString) {
				if (ch == '\\' && i + 1 < text.length()) i++;
				else if (ch == quote) inString = false;
				continue;
			}
			if (ch == '"' || ch == '\'' || ch == '`') {
				inString = true;
				quote = ch;
			} else if (ch == '(') paren++;
			else if (ch == ')') paren--;
			else if (ch == '{') brace++;
			else if (ch == '}') brace--;
			else if (ch == '[') bracket++;
			else if (ch == ']') bracket--;
			else if (ch == separator && paren == 0 && brace == 0 && bracket == 0) {
				out.add(trim(text.substring(start, i)));
				start = i + 1;
				if (firstOnly) break;
			}
		}
		var last = trim(text.substring(start));
		if (!last.isEmpty()) out.add(last);
		return out;
	}

	static boolean isQuoted(String text) {
		text = trim(text);
		if (text.length() < 2) return false;
		char quote = text.charAt(0);
		if (quote != '"' && quote != '\'' || text.charAt(text.length() - 1) != quote) return false;
		for (int i = 1; i < text.length() - 1; i++) {
			char ch = text.charAt(i);
			if (ch == '\\') i++;
			else if (ch == quote) return false;
		}
		return true;
	}

	static boolean isObject(String text) {
		text = trim(text);
		return !text.isEmpty() && text.charAt(0) == '{' && text.charAt(text.length() - 1) == '}';
	}

	static boolean isArray(String text) {
		text = trim(text);
		return !text.isEmpty() && text.charAt(0) == '[' && text.charAt(text.length() - 1) == ']';
	}

	static Object parseValue(String token) {
		token = trim(token);
		if (isObject(token)) return parseObject(token);
		if (isArray(token)) {
			var items = new ArrayList<Object>();
			for (var item : splitTopLevel(token.substring(1, token.length() - 1), ',', false)) items.add(parseValue(item));
			return items;
		}
		if (isQuoted(token)) return parseString(token);
		// flowScriptLiteralTokenValue: a template literal, an expression: refused by the JavaScript
		if (token.length() >= 2 && token.charAt(0) == '`' && token.charAt(token.length() - 1) == '`') throw new Fallback();
		if (token.equals("true")) return Boolean.TRUE;
		if (token.equals("false")) return Boolean.FALSE;
		if (token.equals("null")) return null;
		double value;
		if (DECIMAL.matcher(token).matches()) value = Double.parseDouble(token);
		else if (HEX.matcher(token).matches() && token.length() <= 15) value = Long.parseLong(token.substring(2), 16);
		else throw new Fallback();
		if (Double.isNaN(value) || Double.isInfinite(value)) throw new Fallback();
		return value;
	}

	static String parseString(String token) {
		char quote = token.charAt(0);
		var value = new StringBuilder(token.length());
		for (int i = 1; i < token.length() - 1; i++) {
			char ch = token.charAt(i);
			if (ch == quote || ch == '\n' || ch == '\r') throw new Fallback();
			if (ch == '\\') {
				++i;
				if (i >= token.length() - 1) throw new Fallback();
				char escaped = token.charAt(i);
				if (escaped == 'u' || escaped == 'x') {
					int size = escaped == 'u' ? 4 : 2;
					if (i + 1 + size > token.length()) throw new Fallback();
					var hex = token.substring(i + 1, i + 1 + size);
					for (int k = 0; k < hex.length(); k++) if (Character.digit(hex.charAt(k), 16) < 0 || hex.charAt(k) > 'f') throw new Fallback();
					value.append((char) Integer.parseInt(hex, 16));
					i += size;
				} else {
					switch (escaped) {
					case 'n': value.append('\n'); break;
					case 'r': value.append('\r'); break;
					case 't': value.append('\t'); break;
					case 'b': value.append('\b'); break;
					case 'f': value.append('\f'); break;
					case 'v': value.append('\u000B'); break;
					case '0':
						if (i + 1 < token.length() && token.charAt(i + 1) >= '0' && token.charAt(i + 1) <= '9') throw new Fallback();
						value.append('\0');
						break;
					case '\\': case '"': case '\'': case '/': value.append(escaped); break;
					default: throw new Fallback();
					}
				}
			} else value.append(ch);
		}
		return value.toString();
	}

	// parseFlowScriptObjectLiteral: comments blanked (strings kept), as its regular expression does
	private static final Pattern TRIVIA = Pattern.compile(
			"\"(?:\\\\[\\s\\S]|[^\"\\\\])*+\"|'(?:\\\\[\\s\\S]|[^'\\\\])*+'|`(?:\\\\[\\s\\S]|[^`\\\\])*+`|/\\*[\\s\\S]*?\\*/|//[^\\r\\n]*");

	static String blankComments(String text) {
		if (text.indexOf('/') < 0) return text;
		var m = TRIVIA.matcher(text);
		var sb = new StringBuilder(text.length());
		int last = 0;
		while (m.find()) {
			if (text.charAt(m.start()) == '/') {
				sb.append(text, last, m.start());
				for (int k = m.start(); k < m.end(); k++) {
					char c = text.charAt(k);
					sb.append(c == '\r' || c == '\n' ? c : ' ');
				}
				last = m.end();
			}
		}
		if (last == 0) return text;
		sb.append(text, last, text.length());
		return sb.toString();
	}

	static Map<String, Object> parseObject(String text) {
		text = trim(blankComments(text));
		if (!isObject(text)) throw new Fallback();
		var body = text.substring(1, text.length() - 1);
		var tokens = new LinkedHashMap<String, String>();
		for (var part : splitTopLevel(body, ',', false)) {
			var pair = splitTopLevel(part, ':', true);
			if (pair.size() < 2) throw new Fallback();
			var keyToken = trim(pair.get(0));
			String key;
			if (isQuoted(keyToken)) {
				key = parseString(trim(keyToken));
			} else {
				if (!IDENTIFIER.matcher(keyToken).matches()) throw new Fallback();
				key = keyToken;
			}
			if (tokens.containsKey(key)) throw new Fallback();
			tokens.put(key, pair.get(1));
		}
		var value = new LinkedHashMap<String, Object>();
		for (var e : tokens.entrySet()) value.put(e.getKey(), parseValue(e.getValue()));
		return value;
	}

	@SuppressWarnings("unchecked")
	static void json(Object value, StringBuilder sb) {
		if (value == null) sb.append("null");
		else if (value instanceof Boolean b) sb.append(b ? "true" : "false");
		else if (value instanceof Double d) sb.append(d.doubleValue() == Math.rint(d) && Math.abs(d) < 1e15 && !(d == 0 && 1 / d < 0)
				? Long.toString(d.longValue()) : Double.toString(d));
		else if (value instanceof String s) quote(s, sb);
		else if (value instanceof List<?> l) {
			sb.append('[');
			for (int i = 0; i < l.size(); i++) {
				if (i > 0) sb.append(',');
				json(l.get(i), sb);
			}
			sb.append(']');
		} else if (value instanceof Map<?, ?> m) {
			sb.append('{');
			var first = true;
			for (var e : ((Map<String, Object>) m).entrySet()) {
				if (!first) sb.append(',');
				first = false;
				quote(e.getKey(), sb);
				sb.append(':');
				json(e.getValue(), sb);
			}
			sb.append('}');
		} else throw new Fallback();
	}

	static void quote(String s, StringBuilder sb) {
		sb.append('"');
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);
			if (c == '"' || c == '\\') sb.append('\\').append(c);
			else if (c < 0x20 || c > 0x7e) sb.append(String.format("\\u%04x", (int) c));
			else sb.append(c);
		}
		sb.append('"');
	}
}
