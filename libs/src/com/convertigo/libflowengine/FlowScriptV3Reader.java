package com.convertigo.libflowengine;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.mozilla.javascript.CompilerEnvirons;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.Parser;
import org.mozilla.javascript.ast.AstNode;
import org.mozilla.javascript.ast.AstRoot;
import org.mozilla.javascript.ast.AbstractObjectProperty;
import org.mozilla.javascript.ast.CatchClause;
import org.mozilla.javascript.ast.ConditionalExpression;
import org.mozilla.javascript.ast.FunctionCall;
import org.mozilla.javascript.ast.FunctionNode;
import org.mozilla.javascript.ast.InfixExpression;
import org.mozilla.javascript.ast.Name;
import org.mozilla.javascript.ast.NodeVisitor;
import org.mozilla.javascript.ast.ObjectLiteral;
import org.mozilla.javascript.ast.ObjectProperty;
import org.mozilla.javascript.ast.PropertyGet;
import org.mozilla.javascript.ast.StringLiteral;
import org.mozilla.javascript.ast.VariableDeclaration;
import org.mozilla.javascript.ast.VariableInitializer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Reads the FlowScript v3 JavaScript subset as an AST. It never evaluates the submitted source. */
public final class FlowScriptV3Reader {
	private static final ObjectMapper JSON = new ObjectMapper();
	private static final Set<String> RESERVED = Set.of("flow", "input", "config", "local", "result", "request", "current", "parent", "trace");
	private static final Set<String> BLOCK_NAMESPACES = Set.of("text", "list", "json", "http", "object", "email", "sql", "date", "number", "crypto", "requestable");
	private static final Map<String, String> RULES = Map.ofEntries(
		Map.entry("FLOWSCRIPT_V3_IMPORT_SYNTAX", "JavaScript import declarations are unavailable in FlowScript v3"),
		Map.entry("FLOWSCRIPT_V3_RESERVED_WORD", "default is a reserved word of JavaScript, not a function: the default function is flow.default"),
		Map.entry("FLOWSCRIPT_V3_RESERVED_NAME", "This name is reserved for a Flow scope or the bridge"),
		Map.entry("FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK", "This local name hides a block namespace"),
		Map.entry("FLOWSCRIPT_V3_LOCAL_ALIAS", "A local cannot be written both by its declared name and by local.*"),
		Map.entry("FLOWSCRIPT_V3_OUT_OF_SCOPE", "A local can only be read inside its declaring block"),
		Map.entry("FLOWSCRIPT_V3_SHADOWING", "A local or import cannot be declared again in a nested scope"),
		Map.entry("FLOWSCRIPT_V3_CONST_ASSIGN", "A const binding cannot be reassigned"),
		Map.entry("FLOWSCRIPT_V3_DESTRUCTURING", "Only one-level object patterns without defaults or rest are supported"),
		Map.entry("FLOWSCRIPT_V3_COMPOUND_CONTEXT", "Assignments and updates must be standalone statements"),
		Map.entry("FLOWSCRIPT_V3_RESULT_MIXED", "A Flow must use either result fields or return an object consistently"),
		Map.entry("FLOWSCRIPT_V3_BREAK", "break has no equivalent in a Flow loop body"),
		Map.entry("FLOWSCRIPT_V3_FINALLY", "finally has no equivalent in a Flow try block"),
		Map.entry("FLOWSCRIPT_V3_RETURN_IN_LOOP", "return inside a loop would leave the Flow rather than the iteration"),
		Map.entry("FLOWSCRIPT_V3_FOR_FORM", "Only for (let i = start; i < end; i++) can be lowered as a counted loop"),
		Map.entry("FLOWSCRIPT_V3_SWITCH_FALLTHROUGH", "Flow switch cases must be literal, terminate explicitly, and put default last"),
		Map.entry("FLOWSCRIPT_V3_LOOP_FORM", "This loop form cannot be lowered to a Flow loop"),
		Map.entry("FLOWSCRIPT_V3_FUNCTION", "Only top-level helpers, list arrows, and slot functions are supported"),
		Map.entry("FLOWSCRIPT_V3_CHAIN", "A list operation in this expression cannot be lowered in its JavaScript evaluation order"),
		Map.entry("FLOWSCRIPT_V3_LIST_METHOD", "This list method or comparator cannot be lowered with the same JavaScript meaning"),
		Map.entry("FLOWSCRIPT_V3_UNTYPED_LIST", "The item type of this list cannot be proven from the values pushed into it"),
		Map.entry("FLOWSCRIPT_V3_GLOBAL_CALL", "This global call cannot be lowered in this expression or with these arguments"),
		Map.entry("FLOWSCRIPT_V3_ERROR_CODE_CHOICE", "throw new Error lacks the literal public error code required by Flow"),
		Map.entry("FLOWSCRIPT_V3_UNSUPPORTED", "This JavaScript construct is outside the FlowScript v3 subset"),
		Map.entry("FLOWSCRIPT_V3_OBJECT_CONDITION", "An object literal is not a Flow if or while condition")
	);
	private static final Set<String> LIST_STEPS = Set.of("filter", "map", "find", "some", "every", "toSorted", "sort");
	private static final Set<String> FLOW_NAMESPACES = Set.of("list", "json", "object", "text");

	private final String source;
	private final Function catalog;
	private final int[] lineStarts;
	private final Map<String, Map<String, Object>> catalogs = new HashMap<>();
	private final Map<String, String> imports = new HashMap<>();
	private final Set<String> allNames = new HashSet<>();
	private final Set<String> blockNamespaces = new HashSet<>();
	private final Set<String> helpers = new HashSet<>();
	private final Set<String> typedLists = new HashSet<>();
	private final Set<String> typedMaps = new HashSet<>();
	private int chain;
	private String resultStyle = "";
	// A refusal of the v2 checks of a block call (an unknown slot, an assignment and $$out): raised when the whole source
	// is read, so that a FlowScript v3 refusal, wherever it stands, comes first.
	private Map<String, Object> deferred;

	private FlowScriptV3Reader(String source, Function catalog) {
		this.source = source == null ? "" : source;
		this.catalog = catalog;
		var starts = new ArrayList<Integer>();
		starts.add(0);
		for (int i = 0; i < this.source.length(); i++) if (this.source.charAt(i) == '\n') starts.add(i + 1);
		lineStarts = starts.stream().mapToInt(Integer::intValue).toArray();
	}

	/** Returns {definition, diagnostics}; all values cross LiveConnect as a JSON string. */
	public static String read(String source, Function catalog) {
		var reader = new FlowScriptV3Reader(source, catalog);
		try {
			return json(map("definition", reader.parse(), "diagnostics", List.of()));
		} catch (Refusal refusal) {
			return json(map("definition", null, "diagnostics", List.of(refusal.diagnostic)));
		} catch (Exception unexpected) {
			var message = "This JavaScript construct cannot be translated faithfully (FLOWSCRIPT_V3_UNSUPPORTED at line 1): " + unexpected;
			return json(map("definition", null, "diagnostics", List.of(map("severity", "error", "code", "FLOWSCRIPT_V3_UNSUPPORTED", "line", 1,
				"message", message, "hint", "Rewrite as explicit Flow block calls."))));
		}
	}

	private static String json(Object value) {
		try { return JSON.writeValueAsString(value); }
		catch (JsonProcessingException e) { throw new IllegalStateException(e); }
	}

	private static Map<String, Object> map(Object... entries) {
		var result = new LinkedHashMap<String, Object>();
		for (int i = 0; i < entries.length; i += 2) result.put((String) entries[i], entries[i + 1]);
		return result;
	}

	private static final class Refusal extends RuntimeException {
		final Map<String, Object> diagnostic;
		Refusal(Map<String, Object> diagnostic) { super(String.valueOf(diagnostic.get("message"))); this.diagnostic = diagnostic; }
	}

	private void reject(String code, AstNode node, String hint) {
		if (code.equals("FLOWSCRIPT_V3_LIST_METHOD") && node instanceof FunctionCall call && method(call).equals("sort") &&
			!raw(call.getTarget()).replaceAll("\\.sort$", "").matches("(?s)\\s*\\[.*")) {
			int line = line(pos(node));
			throw new Refusal(map("severity", "error", "code", code, "line", line, "message", "xs.sort(…) sorts in place and is refused (" + code + " at line " + line + ").",
				"hint", "Write xs.toSorted((a, b) => …)."));
		}
		rejectAt(code, node == null ? 0 : pos(node), hint);
	}
	private void rejectAt(String code, int at, String hint) {
		int line = line(at);
		String message = RULES.getOrDefault(code, "This FlowScript v3 construct cannot be lowered faithfully") +
			" (" + code + " at line " + line + ").";
		throw new Refusal(map("severity", "error", "code", code, "line", line, "message", message, "hint", hint));
	}

	private void defer(String code, int line, String message, String hint) {
		if (deferred == null) deferred = map("severity", "error", "code", code, "line", line, "message", message, "hint", hint);
	}
	private int line(int at) {
		int index = Arrays.binarySearch(lineStarts, Math.max(0, Math.min(source.length(), at)));
		return index >= 0 ? index + 1 : -index - 1;
	}
	private int pos(AstNode node) {
		int at = Math.max(0, node.getAbsolutePosition());
		if (node instanceof org.mozilla.javascript.ast.UnaryExpression unary) {
			String operator = switch (unary.getOperator()) {
				case org.mozilla.javascript.Token.NOT -> "!";
				case org.mozilla.javascript.Token.NEG -> "-";
				case org.mozilla.javascript.Token.POS -> "+";
				case org.mozilla.javascript.Token.BITNOT -> "~";
				case org.mozilla.javascript.Token.TYPEOF -> "typeof";
				default -> "";
			};
			int cursor = at - 1;
			while (cursor >= 0 && Character.isWhitespace(source.charAt(cursor))) cursor--;
			if (!operator.isEmpty() && cursor + 1 >= operator.length() && source.substring(cursor + 1 - operator.length(), cursor + 1).equals(operator))
				return cursor + 1 - operator.length();
		}
		if (node instanceof org.mozilla.javascript.ast.InfixExpression infix) return Math.min(at, pos(infix.getLeft()));
		return at;
	}
	private int end(AstNode node) {
		int finish = Math.min(source.length(), Math.max(0, node.getAbsolutePosition()) + node.getLength());
		// Rhino 1.9.2 extends an infix or conditional expression over the closing parentheses that follow it
		AstNode last = node instanceof InfixExpression infix ? infix.getRight() : node instanceof ConditionalExpression conditional ? conditional.getFalseExpression() : null;
		if (last != null) {
			int right = end(last);
			// … and over the character that follows a keyword literal ending it (null, true, false), a character Rhino 1.9.2
			// counts in the keyword: c ? a : null, in an object literal or an argument list
			if (finish > right && (source.substring(right, finish).matches("[\\s)\\]}]+") || finish == right + 1 && endsWithKeyword(last))) return right;
		}
		if (node instanceof org.mozilla.javascript.ast.KeywordLiteral) {
			String keyword = node.toSource().trim();
			if (source.startsWith(keyword, pos(node))) return pos(node) + keyword.length();
		}
		return finish;
	}
	private static boolean endsWithKeyword(AstNode node) {
		if (node instanceof org.mozilla.javascript.ast.KeywordLiteral) return true;
		if (node instanceof InfixExpression infix) return endsWithKeyword(infix.getRight());
		if (node instanceof ConditionalExpression conditional) return endsWithKeyword(conditional.getFalseExpression());
		return false;
	}
	private String raw(AstNode node) { return source.substring(pos(node), end(node)); }
	private static String kind(AstNode node) { return node == null ? "" : node.getClass().getSimpleName(); }
	private static String name(AstNode node) { return node instanceof Name n ? n.getIdentifier() : ""; }
	private ObjectProperty property(AbstractObjectProperty node) {
		if (node instanceof ObjectProperty field) return field;
		reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Use one-level object fields.");
		throw new AssertionError();
	}
	/** AstNode.visit, and the body of a catch without parameter (catch { … }), which Rhino 1.9.2 CatchClause.visit cannot visit. */
	private static void visit(AstNode root, NodeVisitor callback) {
		root.visit(new NodeVisitor() {
			@Override
			public boolean visit(AstNode node) {
				boolean deeper = callback.visit(node);
				if (deeper && node instanceof CatchClause clause && clause.getVarName() == null) {
					if (clause.getCatchCondition() != null) clause.getCatchCondition().visit(this);
					clause.getBody().visit(this);
					return false;
				}
				return deeper;
			}
		});
	}
	private List<AstNode> children(AstNode node) {
		var result = new ArrayList<AstNode>();
		for (var part = node.getFirstChild(); part != null; part = part.getNext()) result.add((AstNode) part);
		return result;
	}

	// The preparation of the whole source (specification section 1): token scan, not a text-wide regular expression, with
	// same-length rewrites only, so that every AST position is a source position. Each const declaration keyword becomes
	// let: Rhino 1.9.2 refuses const in a for…of head and gives a const the scope of the whole function, so a const
	// declared again in a sibling block (valid JavaScript) is a redeclaration for its parser. Whether a declaration is
	// const is read from the source text.
	private static String prepared(String text) {
		char[] out = text.toCharArray();
		String state = "code";
		char quote = 0;
		for (int i = 0; i < text.length();) {
			char c = text.charAt(i), next = i + 1 < text.length() ? text.charAt(i + 1) : 0;
			if (state.equals("line")) { if (c == '\n') state = "code"; i++; continue; }
			if (state.equals("block")) { if (c == '*' && next == '/') { state = "code"; i += 2; } else i++; continue; }
			if (state.equals("string")) { if (c == '\\') i += 2; else if (c == quote) { state = "code"; i++; } else i++; continue; }
			if (c == '/' && next == '/') { state = "line"; i += 2; continue; }
			if (c == '/' && next == '*') { state = "block"; i += 2; continue; }
			if (c == '"' || c == '\'' || c == '`') { state = "string"; quote = c; i++; continue; }
			if (text.startsWith("const", i) && (i == 0 || !Character.isJavaIdentifierPart(text.charAt(i - 1)) && text.charAt(i - 1) != '.') &&
				(i + 5 == text.length() || !Character.isJavaIdentifierPart(text.charAt(i + 5)))) {
				int j = i + 5;
				while (j < text.length() && Character.isWhitespace(text.charAt(j))) j++;
				// const x, const { a }, const [a], and const{ a } without a space
				if (j < text.length() && (j > i + 5 && Character.isJavaIdentifierStart(text.charAt(j)) || text.charAt(j) == '{' || text.charAt(j) == '[')) {
					out[i] = 'l'; out[i + 1] = 'e'; out[i + 2] = 't'; out[i + 3] = ' '; out[i + 4] = ' ';
				}
				i += 5; continue;
			}
			i++;
		}
		return new String(out);
	}
	/** The parenthesis closing the one at open, strings and comments skipped; -1 when there is none. */
	private static int closing(String text, int open) {
		int depth = 0;
		String state = "code";
		char quote = 0;
		for (int i = open; i < text.length(); i++) {
			char c = text.charAt(i), next = i + 1 < text.length() ? text.charAt(i + 1) : 0;
			if (state.equals("line")) { if (c == '\n') state = "code"; continue; }
			if (state.equals("block")) { if (c == '*' && next == '/') { state = "code"; i++; } continue; }
			if (state.equals("string")) { if (c == '\\') i++; else if (c == quote) state = "code"; continue; }
			if (c == '/' && next == '/') { state = "line"; i++; continue; }
			if (c == '/' && next == '*') { state = "block"; i++; continue; }
			if (c == '"' || c == '\'' || c == '`') { state = "string"; quote = c; continue; }
			if (c == '(') depth++;
			if (c == ')' && --depth == 0) return i;
		}
		return -1;
	}
	private static String codeOnly(String text) {
		char[] out = text.toCharArray();
		String state = "code";
		char quote = 0;
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i), next = i + 1 < text.length() ? text.charAt(i + 1) : 0;
			if (state.equals("line")) { if (c == '\n') state = "code"; else out[i] = ' '; continue; }
			if (state.equals("block")) {
				out[i] = c == '\n' ? c : ' ';
				if (c == '*' && next == '/') { out[++i] = ' '; state = "code"; }
				continue;
			}
			if (state.equals("string")) {
				out[i] = c == '\n' ? c : ' ';
				if (c == '\\' && i + 1 < text.length()) out[++i] = ' ';
				else if (c == quote) state = "code";
				continue;
			}
			if (c == '/' && next == '/') { out[i] = out[++i] = ' '; state = "line"; continue; }
			if (c == '/' && next == '*') { out[i] = out[++i] = ' '; state = "block"; continue; }
			if (c == '"' || c == '\'' || c == '`') { out[i] = ' '; quote = c; state = "string"; }
		}
		return new String(out);
	}

	private Map<String, Object> parse() {
		var bareDefault = java.util.regex.Pattern.compile("(?<![\\w$.])default\\s*\\(").matcher(codeOnly(source));
		if (bareDefault.find()) {
			// default is a reserved word, not a function name: the proposal keeps the arguments
			int open = bareDefault.end() - 1, close = closing(source, open);
			rejectAt("FLOWSCRIPT_V3_RESERVED_WORD", bareDefault.start(), "Write " + (close < 0 ? "flow.default(x, y)" : "flow.default(" + source.substring(open + 1, close) + ")") + ".");
		}
		AstRoot ast;
		try {
			var options = new CompilerEnvirons();
			options.setLanguageVersion(200);
			options.setRecoverFromErrors(false);
			ast = new Parser(options).parse(prepared(source), "flowscript-v3", 1);
		} catch (Exception e) {
			int number = e instanceof org.mozilla.javascript.EvaluatorException x ? x.lineNumber() : 1;
			int at = lineStarts[Math.max(0, Math.min(lineStarts.length - 1, number - 1))];
			String text = source.substring(at, source.indexOf('\n', at) < 0 ? source.length() : source.indexOf('\n', at));
			boolean importSyntax = text.matches("\\s*import\\b.*"), loopSyntax = text.matches(".*\\bfor\\s*\\([^)]*\\bin\\b.*");
			rejectAt(importSyntax ? "FLOWSCRIPT_V3_IMPORT_SYNTAX" : loopSyntax ? "FLOWSCRIPT_V3_LOOP_FORM" : "FLOWSCRIPT_V3_UNSUPPORTED", at,
				importSyntax ? "Use const { name } = flow.import(\"module\")." : loopSyntax ? "Use for (const key of Object.keys(o))." : "Use a JavaScript form from the FlowScript v3 grammar.");
			throw new AssertionError();
		}
		// A function declared in a body is refused where it stands (statement), in the order of the source.
		visit(ast, part -> {
			if (part instanceof VariableDeclaration declaration) for (var variable : declaration.getVariables()) {
				if (variable.getTarget() instanceof Name n) allNames.add(n.getIdentifier());
			}
			if (part instanceof FunctionCall call && call.getTarget() instanceof PropertyGet property && property.getTarget() instanceof Name n)
				blockNamespaces.add(n.getIdentifier());
			return true;
		});
		var statements = ast.getStatements();
		FunctionNode main = null;
		var helperNodes = new ArrayList<FunctionNode>();
		var flow = new LinkedHashMap<String, Object>();
		for (AstNode statement : statements) {
			if (statement instanceof FunctionNode fn) { if (main == null) main = fn; else { helperNodes.add(fn); helpers.add(fn.getName()); } continue; }
			if (main != null) reject("FLOWSCRIPT_V3_FUNCTION", statement, "Put helpers after the Flow function.");
			if (!(statement instanceof VariableDeclaration)) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Put metadata and imports before the function.");
			var declaration = (VariableDeclaration) statement;
			for (var variable : declaration.getVariables()) {
				AstNode target = variable.getTarget(), init = variable.getInitializer();
				if (!source.substring(pos(declaration), pos(target)).trim().equals("const")) reject("FLOWSCRIPT_V3_UNSUPPORTED", declaration, "Use const for metadata and imports.");
				if (target instanceof Name n && n.getIdentifier().equals("_flow")) {
					if (!(init instanceof ObjectLiteral)) reject("FLOWSCRIPT_V3_UNSUPPORTED", init, "Use a literal _flow object.");
					var object = (ObjectLiteral) init;
					flow.putAll(literalObject(object));
					continue;
				}
				if (!(init instanceof FunctionCall call) || !compact(raw(call.getTarget())).equals("flow.import"))
					reject("FLOWSCRIPT_V3_IMPORT_SYNTAX", statement, "Use const { name } = flow.import(\"module\").");
				var call = (FunctionCall) init;
				if (call.getArguments().size() != 1 || !(call.getArguments().get(0) instanceof StringLiteral)) reject("FLOWSCRIPT_V3_IMPORT_SYNTAX", statement, "Use a literal module name.");
				var module = (StringLiteral) call.getArguments().get(0);
				String moduleName = module.getValue();
				if (target instanceof Name n) { if (RESERVED.contains(n.getIdentifier())) reject("FLOWSCRIPT_V3_RESERVED_NAME", target, "Choose another import alias."); imports.put(n.getIdentifier() + ".*", moduleName); }
				else if (target instanceof ObjectLiteral object) for (var member : object.getElements()) {
					if (!(member instanceof ObjectProperty field) || !(field.getKey() instanceof Name) || !(field.getValue() instanceof Name))
						reject("FLOWSCRIPT_V3_DESTRUCTURING", statement, "Use one-level named imports.");
					var field = (ObjectProperty) member;
					var key = (Name) field.getKey(); var alias = (Name) field.getValue();
					if (RESERVED.contains(alias.getIdentifier())) reject("FLOWSCRIPT_V3_RESERVED_NAME", field, "Choose another import alias.");
					imports.put(alias.getIdentifier(), moduleName + "." + key.getIdentifier());
				}
				else reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Use one-level named imports.");
			}
		}
		if (main == null) rejectAt("FLOWSCRIPT_V3_FUNCTION", 0, "Declare one Flow function.");
		var definition = map("version", 1, "helpers", new ArrayList<>(), "nodes", new ArrayList<>());
		if (!flow.isEmpty()) { flow.put("sourceVersion", 3); definition.put("flow", flow); }
		@SuppressWarnings("unchecked") var nodes = (List<Map<String, Object>>) definition.get("nodes");
		body(main.getBody(), new Scope(null), nodes);
		@SuppressWarnings("unchecked") var helperDefinitions = (List<Map<String, Object>>) definition.get("helpers");
		for (FunctionNode helper : helperNodes) {
			if (helper.getParams().size() != 1 || !(helper.getParams().get(0) instanceof ObjectLiteral))
				reject("FLOWSCRIPT_V3_FUNCTION", helper, "Use one object parameter in a top-level helper.");
			var parameters = (ObjectLiteral) helper.getParams().get(0);
			var scope = new Scope(null);
			var names = new ArrayList<String>();
			var props = new LinkedHashMap<String, Object>();
			for (var member : parameters.getElements()) {
				var field = property(member);
				if (!(field.getKey() instanceof Name) || !(field.getValue() instanceof Name)) reject("FLOWSCRIPT_V3_FUNCTION", field, "Use one-level object fields without defaults or rest.");
				var key = (Name) field.getKey(); var alias = (Name) field.getValue();
				declare(alias.getIdentifier(), "const", field, scope, "input." + key.getIdentifier());
				names.add(key.getIdentifier());
				props.put(key.getIdentifier(), map("kind", "expression", "type", "unknown", "description", "Helper argument " + key.getIdentifier() + "."));
			}
			var helperDefinition = map("name", helper.getName(), "params", names, "props", props, "nodes", new ArrayList<>());
			resultStyle = "";
			@SuppressWarnings("unchecked") var helperBody = (List<Map<String, Object>>) helperDefinition.get("nodes");
			body(helper.getBody(), scope, helperBody);
			helperDefinitions.add(helperDefinition);
		}
		if (deferred != null) throw new Refusal(deferred);
		assignNames(definition);
		return definition;
	}

	private static String compact(String text) { return text.replaceAll("\\s+", ""); }
	private Object literal(AstNode node) {
		if (node instanceof StringLiteral string) return string.getValue();
		if (node instanceof org.mozilla.javascript.ast.NumberLiteral number) return number.getNumber();
		if (node instanceof ObjectLiteral object) return literalObject(object);
		if (node instanceof org.mozilla.javascript.ast.ArrayLiteral array) {
			var values = new ArrayList<Object>();
			for (var item : array.getElements()) values.add(literal(item));
			return values;
		}
		String text = raw(node).trim();
		if (numberToken(text) != null) return numberToken(text);
		return switch (text) { case "true" -> true; case "false" -> false; case "null" -> null; default -> text; };
	}
	private Map<String, Object> literalObject(ObjectLiteral object) {
		var value = new LinkedHashMap<String, Object>();
		for (var member : object.getElements()) { var field = property(member); value.put(key(field.getKey()), literal(field.getValue())); }
		return value;
	}
	private String key(AstNode node) { return node instanceof Name n ? n.getIdentifier() : node instanceof StringLiteral s ? s.getValue() : raw(node); }

	private static final class Binding {
		final String type;
		String mapped;
		boolean typedList, typedMap;
		// the parameter of a catch: throw of this name raises the caught error again
		boolean caught;
		Binding(String type, String mapped) { this.type = type; this.mapped = mapped; }
	}
	private static final class Scope {
		final Scope parent;
		final Map<String, Binding> names = new HashMap<>();
		Scope(Scope parent) { this.parent = parent; }
	}
	private int loopDepth, countedDepth, counted;
	private Binding lookup(String name, Scope scope) {
		for (Scope current = scope; current != null; current = current.parent) if (current.names.containsKey(name)) return current.names.get(name);
		return null;
	}
	/** A name imported by flow.import, named (const { a } = …) or as a namespace (const ns = …). */
	private boolean imported(String name) { return imports.containsKey(name) || imports.containsKey(name + ".*"); }
	private Binding declare(String name, String type, AstNode node, Scope scope, String mapped) {
		if (RESERVED.contains(name) || name.startsWith("__")) reject("FLOWSCRIPT_V3_RESERVED_NAME", node, "Choose another local name.");
		if (blockNamespaces.contains(name) && BLOCK_NAMESPACES.contains(name) && !imported(name)) reject("FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK", node, "Choose a name different from the block namespace.");
		if (lookup(name, scope) != null || imported(name)) reject("FLOWSCRIPT_V3_SHADOWING", node, "Choose another local name.");
		var binding = new Binding(type, mapped == null ? "local." + name : mapped);
		scope.names.put(name, binding);
		allNames.add(name);
		return binding;
	}

	private record Edit(int start, int end, String value) { }
	private String rewritten(AstNode root, Scope scope) { return rewritten(root, scope, Map.of()); }
	/** The text of an expression with its names mapped; a node of replaced (a step lifted before the statement) is its hidden local. */
	private String rewritten(AstNode root, Scope scope, Map<AstNode, String> replaced) {
		if (root == null) return "";
		int start = pos(root), end = end(root);
		var edits = new ArrayList<Edit>();
		visit(root, part -> {
			String lifted = replaced.get(part);
			if (lifted != null) { edits.add(new Edit(pos(part), end(part), lifted)); return false; }
			if (part instanceof FunctionCall call && compact(raw(call.getTarget())).matches("(?:Object|JSON|Date)\\.[A-Za-z_$][\\w$]*"))
				reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Move the global call into its own assignment or return.");
			if (part instanceof FunctionCall nested && part != root && LIST_STEPS.contains(method(nested)))
				reject("FLOWSCRIPT_V3_CHAIN", part, "Split the chain into two const declarations.");
			if (part instanceof FunctionNode) reject("FLOWSCRIPT_V3_FUNCTION", part, "Write the expression inline or use a project block.");
			if (part instanceof org.mozilla.javascript.ast.Assignment && part != root || part instanceof org.mozilla.javascript.ast.UpdateExpression)
				reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", part, "Move the assignment to its own statement.");
			if (part instanceof org.mozilla.javascript.ast.NewExpression && raw(part).matches("(?s)new\\s+Date\\b.*")) reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Use date blocks.");
			if (part instanceof org.mozilla.javascript.ast.NewExpression || part instanceof org.mozilla.javascript.ast.Yield || raw(part).equals("this"))
				reject("FLOWSCRIPT_V3_UNSUPPORTED", part, "Use Flow blocks.");
			if (part instanceof Name n) {
				var parent = part.getParent();
				if (parent instanceof PropertyGet property && property.getProperty() == part) return true;
				if (parent instanceof ObjectProperty field && field.getKey() == part && !raw(field).trim().equals(n.getIdentifier())) return true;
				var binding = lookup(n.getIdentifier(), scope);
				if (binding == null) { if (allNames.contains(n.getIdentifier()) && !imported(n.getIdentifier())) reject("FLOWSCRIPT_V3_OUT_OF_SCOPE", part, "Declare the name in the enclosing block."); return true; }
				String replacement = binding.mapped;
				if (parent instanceof ObjectProperty field && field.getKey() == part && raw(field).trim().equals(n.getIdentifier())) replacement = n.getIdentifier() + ": " + replacement;
				edits.add(new Edit(pos(part), end(part), replacement));
			}
			if (part instanceof PropertyGet property && property.getTarget() instanceof Name n && n.getIdentifier().equals("flow") && property.getProperty().getIdentifier().equals("default"))
				edits.add(new Edit(pos(part), end(part), "default"));
			if (part instanceof PropertyGet property && property.getTarget() instanceof Name n && n.getIdentifier().equals("local") && allNames.contains(property.getProperty().getIdentifier()))
				reject("FLOWSCRIPT_V3_LOCAL_ALIAS", part, "Use one spelling for the local.");
			if (part instanceof PropertyGet property) {
				int targetEnd = end(property.getTarget()), propertyStart = pos(property.getProperty());
				int optional = source.substring(Math.min(targetEnd, propertyStart), Math.max(targetEnd, propertyStart)).indexOf("?.");
				if (optional >= 0) edits.add(new Edit(targetEnd + optional, targetEnd + optional + 2, "."));
			}
			if (part instanceof org.mozilla.javascript.ast.ElementGet element) {
				int targetEnd = end(element.getTarget()), elementEnd = end(element);
				int optional = source.substring(Math.min(targetEnd, elementEnd), Math.max(targetEnd, elementEnd)).indexOf("?.");
				if (optional >= 0) edits.add(new Edit(targetEnd + optional, targetEnd + optional + 2, ""));
			}
			return true;
		});
		edits.sort((a, b) -> Integer.compare(b.start, a.start));
		String result = source.substring(start, end);
		for (Edit edit : edits) if (edit.start >= start && edit.end <= end) result = result.substring(0, edit.start - start) + edit.value + result.substring(edit.end - start);
		return oneLine(result);
	}
	// An expression written on several lines is one line for the Flow evaluator, as the v2 reading joins the lines of a
	// statement: each line without its // comment (ignored, as in JavaScript) and trimmed, the lines joined by a space.
	// Strings and template literals are kept as written.
	private static String oneLine(String text) {
		if (text.indexOf('\n') < 0 && text.indexOf('\r') < 0) return text;
		var lines = new ArrayList<String>();
		var current = new StringBuilder();
		char quote = 0;
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (quote != 0) {
				current.append(c);
				if (c == '\\' && i + 1 < text.length()) current.append(text.charAt(++i));
				else if (c == quote) quote = 0;
				continue;
			}
			if (c == '"' || c == '\'' || c == '`') { quote = c; current.append(c); continue; }
			if (c == '/' && i + 1 < text.length() && text.charAt(i + 1) == '/') {
				while (i + 1 < text.length() && text.charAt(i + 1) != '\n' && text.charAt(i + 1) != '\r') i++;
				continue;
			}
			if (c == '\r' || c == '\n') {
				if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
				lines.add(current.toString().trim());
				current.setLength(0);
				continue;
			}
			current.append(c);
		}
		lines.add(current.toString().trim());
		return String.join(" ", lines);
	}
	// A signed number written without space (-1, +1, -1.5, 1e3, 0x1f) is that number, as the v2 reading of a value reads it;
	// - 1 stays an expression.
	private static final java.util.regex.Pattern NUMBER_TOKEN = java.util.regex.Pattern.compile("[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?|0[xX][0-9a-fA-F]+");
	private static Double numberToken(String text) {
		if (!NUMBER_TOKEN.matcher(text).matches()) return null;
		return text.matches("0[xX].*") ? (double) Long.parseLong(text.substring(2), 16) : Double.parseDouble(text);
	}

	private Map<String, Object> node(String block, Map<String, Object> props, AstNode at) {
		return map("block", block, "props", props, "__flowScriptLine", line(pos(at)));
	}
	private void set(List<Map<String, Object>> output, String path, AstNode value, Scope scope, AstNode at) {
		output.add(node("set", map("path", path, "value", value(value, scope)), at));
	}
	private Object value(AstNode expression, Scope scope) {
		if (expression instanceof StringLiteral string) return literalText(string.getValue());
		if (expression instanceof org.mozilla.javascript.ast.NumberLiteral number) return number.getNumber();
		if (expression instanceof ObjectLiteral object) {
			var result = new LinkedHashMap<String, Object>();
			for (var member : object.getElements()) { var field = property(member); result.put(key(field.getKey()), value(field.getValue(), scope)); }
			return result;
		}
		if (expression instanceof org.mozilla.javascript.ast.ArrayLiteral array) {
			var result = new ArrayList<Object>();
			for (AstNode item : array.getElements()) result.add(value(item, scope));
			return result;
		}
		String text = raw(expression).trim();
		if (expression instanceof org.mozilla.javascript.ast.UnaryExpression && numberToken(text) != null) return numberToken(text);
		if (text.length() >= 2 && text.charAt(0) == '`' && text.charAt(text.length() - 1) == '`') {
			String rendered = rewritten(expression, scope).trim();
			return rendered.substring(1, rendered.length() - 1).replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t");
		}
		return switch (text) { case "true" -> true; case "false" -> false; case "null" -> null; default -> "${" + rewritten(expression, scope).trim() + "}"; };
	}

	@SuppressWarnings("unchecked")
	private Map<String, Object> catalog(String block) {
		return catalogs.computeIfAbsent(block, key -> {
			if (catalog == null) return Map.of();
			try {
				Object answer = catalog.call(Context.getCurrentContext(), catalog.getParentScope(), catalog.getParentScope(), new Object[] { key });
				return JSON.readValue(String.valueOf(answer), Map.class);
			} catch (Exception e) { return Map.of(); }
		});
	}
	/** The slot names (and aliases) the catalog gives a block, or null when the catalog does not tell them. */
	private List<String> slotNames(String block) {
		var names = catalog(block).get("slots");
		if (!(names instanceof List<?> list)) return null;
		var out = new ArrayList<String>();
		for (Object name : list) out.add(String.valueOf(name));
		return out;
	}
	@SuppressWarnings("unchecked")
	private String propertyKind(String block, String key) {
		if (helpers.contains(block)) return "expression";
		if (block.equals("throw") && key.equals("status")) return "text";
		if ((block.equals("object.keys") || block.equals("object.values")) && key.equals("source")) return "expression";
		if (block.equals("json.parse") && key.equals("text")) return "template";
		var descriptor = catalog(block);
		var props = descriptor.get("props") instanceof Map<?, ?> value ? (Map<String, Object>) value : Map.<String, Object>of();
		var prop = props.get(key) instanceof Map<?, ?> value ? (Map<String, Object>) value : Map.<String, Object>of();
		String kind = String.valueOf(prop.getOrDefault("kind", ""));
		if (!kind.isEmpty()) return kind;
		String type = String.valueOf(prop.getOrDefault("type", ""));
		return switch (type) {
			case "path" -> "path"; case "template", "string" -> "template"; case "expression", "array", "object", "boolean", "number", "integer" -> "expression";
			default -> "value";
		};
	}
	private Object propertyValue(String block, String key, AstNode expression, Scope scope) {
		if (expression instanceof FunctionCall call && isBlockCall(call)) {
			String nested = resolve(compact(raw(call.getTarget())));
			var properties = new LinkedHashMap<String, Object>();
			for (var member : ((ObjectLiteral) call.getArguments().get(0)).getElements()) {
				var field = property(member);
				String memberKey = key(field.getKey());
				properties.put(memberKey, propertyValue(nested, memberKey, field.getValue(), scope));
			}
			return map("__flowBlock", nested, "properties", properties);
		}
		String kind = propertyKind(block, key);
		if (kind.equals("expression")) return expression instanceof ObjectLiteral || expression instanceof org.mozilla.javascript.ast.ArrayLiteral ? value(expression, scope) : rewritten(expression, scope);
		if (kind.equals("path")) return expression instanceof StringLiteral s ? s.getValue() : rewritten(expression, scope);
		if (kind.equals("text") || kind.equals("secret")) return expression instanceof StringLiteral s ? s.getValue() : raw(expression).trim();
		if (kind.equals("schema")) return literal(expression);
		// A quoted text is text: in a template property, ${ in it would not interpolate, which is refused as the v2 reading
		// refuses it; a fixed property (literal, select…) takes it as written; a value escapes its ${ (value).
		if (kind.equals("template") && expression instanceof StringLiteral quoted && quoted.getValue().contains("${")) {
			int line = line(pos(expression));
			defer("FLOWSCRIPT_QUOTED_TEMPLATE", line, block + "." + key + " at line " + line + " receives quoted text containing ${...}; it will not interpolate.",
				"Use a backtick template literal for interpolation, or escape ${ in a backtick literal for intentional text.");
		}
		if (!Set.of("template", "value", "binding").contains(kind) && expression instanceof StringLiteral fixed && !fixed.getValue().contains("{{")) return fixed.getValue();
		return value(expression, scope);
	}
	// A quoted text written as a value stays text: each ${ is escaped (\${, with the backslashes before it doubled), so
	// that the Flow template does not read it as an expression (template-syntax.js literal).
	private static String literalText(String text) {
		return java.util.regex.Pattern.compile("(\\\\*)\\$\\{").matcher(text).replaceAll(found -> java.util.regex.Matcher.quoteReplacement(found.group(1) + found.group(1) + "\\${"));
	}
	private record Lowered(List<Map<String, Object>> before, String expression) { }
	private String method(FunctionCall call) {
		return call.getTarget() instanceof PropertyGet property ? property.getProperty().getIdentifier() : "";
	}
	private AstNode arrowBody(FunctionNode fn, int count, AstNode call) {
		if (fn.getParams().size() != count) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use " + count + " callback parameter(s).");
		AstNode body = fn.getBody();
		if (body instanceof org.mozilla.javascript.ast.Block || body instanceof org.mozilla.javascript.ast.Scope) {
			var parts = children(body);
			if (parts.size() != 1 || !(parts.get(0) instanceof org.mozilla.javascript.ast.ReturnStatement))
				reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use an expression body.");
			return ((org.mozilla.javascript.ast.ReturnStatement) parts.get(0)).getReturnValue();
		}
		return body;
	}
	private Map<String, Object> capture(String block, Map<String, Object> props, String path, AstNode at) {
		var result = node(block, props, at);
		result.put("out", path);
		return result;
	}
	private Object listSource(AstNode receiver, Scope scope, Lowered prefix) {
		return prefix.before.isEmpty() && receiver instanceof org.mozilla.javascript.ast.ArrayLiteral ? value(receiver, scope) : prefix.expression;
	}
	private AstNode unparen(AstNode node) {
		while (node instanceof org.mozilla.javascript.ast.ParenthesizedExpression wrapper) node = wrapper.getExpression();
		return node;
	}
	private String operator(AstNode node) {
		return org.mozilla.javascript.ast.AstNode.operatorToString(((org.mozilla.javascript.ast.InfixExpression) node).getOperator());
	}
	private record Side(String name, String path) { }
	private record PairKey(String path, boolean swapped) { }
	private record SortKey(String path, String compare, String direction) { }
	private Side side(AstNode operand, String first, String second) {
		AstNode at = unparen(operand);
		var path = new ArrayList<String>();
		while (at instanceof PropertyGet property) {
			path.add(0, property.getProperty().getIdentifier());
			at = unparen(property.getTarget());
		}
		String name = name(at);
		return name.equals(first) || name.equals(second) ? new Side(name, String.join(".", path)) : null;
	}
	private PairKey pair(AstNode left, AstNode right, String first, String second) {
		Side a = side(left, first, second), b = side(right, first, second);
		return a != null && b != null && a.path.equals(b.path) && !a.name.equals(b.name) ? new PairKey(a.path, a.name.equals(second)) : null;
	}
	private AstNode unstring(AstNode operand) {
		AstNode at = unparen(operand);
		return at instanceof FunctionCall call && compact(raw(call.getTarget())).equals("String") && call.getArguments().size() == 1 ? call.getArguments().get(0) : operand;
	}
	private static final String[] ORDER_CLASSES = { "LT", "GT", "EQS", "EQL", "EQN", "NCS", "NCL", "NCN" };
	private boolean holds(String relation, String category) {
		if (relation.equals("!=")) return !holds("==", category);
		if (relation.equals("!==")) return !holds("===", category);
		return switch (relation) {
			case "<" -> category.equals("LT");
			case ">" -> category.equals("GT");
			case "<=" -> Set.of("LT", "EQS", "EQL", "EQN").contains(category);
			case ">=" -> Set.of("GT", "EQS", "EQL", "EQN").contains(category);
			case "==" -> Set.of("EQS", "EQL", "NCS", "NCL").contains(category);
			case "===" -> Set.of("EQS", "NCS").contains(category);
			default -> false;
		};
	}
	private Integer comparatorSign(AstNode input, String first, String second, String category, String[] keyPath) {
		AstNode node = unparen(input);
		if (node instanceof org.mozilla.javascript.ast.ConditionalExpression conditional) {
			AstNode test = unparen(conditional.getTestExpression());
			if (!(test instanceof org.mozilla.javascript.ast.InfixExpression infix)) return null;
			String relation = operator(infix);
			if (!Set.of("<", ">", "<=", ">=", "==", "!=", "===", "!==").contains(relation)) return null;
			PairKey pair = pair(infix.getLeft(), infix.getRight(), first, second);
			if (pair == null || keyPath[0] != null && !keyPath[0].equals(pair.path)) return null;
			keyPath[0] = pair.path;
			if (pair.swapped) relation = switch (relation) { case "<" -> ">"; case ">" -> "<"; case "<=" -> ">="; case ">=" -> "<="; default -> relation; };
			return comparatorSign(holds(relation, category) ? conditional.getTrueExpression() : conditional.getFalseExpression(), first, second, category, keyPath);
		}
		if (node instanceof org.mozilla.javascript.ast.NumberLiteral number) {
			double value = number.getNumber();
			return value < 0 ? -1 : value > 0 ? 1 : 0;
		}
		if (node instanceof org.mozilla.javascript.ast.UnaryExpression unary && (unary.getOperator() == org.mozilla.javascript.Token.POS || unary.getOperator() == org.mozilla.javascript.Token.NEG) && unparen(unary.getOperand()) instanceof org.mozilla.javascript.ast.NumberLiteral number) {
			double value = number.getNumber();
			if (unary.getOperator() == org.mozilla.javascript.Token.NEG) value = -value;
			return value < 0 ? -1 : value > 0 ? 1 : 0;
		}
		return null;
	}
	private SortKey keyComparator(AstNode input, String first, String second) {
		AstNode node = unparen(input);
		if (node instanceof org.mozilla.javascript.ast.InfixExpression infix && operator(infix).equals("-")) {
			PairKey found = pair(infix.getLeft(), infix.getRight(), first, second);
			if (found != null) return new SortKey(found.path, "number", found.swapped ? "desc" : "asc");
		}
		if (node instanceof FunctionCall call && method(call).equals("localeCompare") && call.getArguments().size() == 1) {
			PairKey found = pair(unstring(((PropertyGet) call.getTarget()).getTarget()), unstring(call.getArguments().get(0)), first, second);
			if (found != null) return new SortKey(found.path, "locale", found.swapped ? "desc" : "asc");
		}
		if (!(node instanceof org.mozilla.javascript.ast.ConditionalExpression)) return null;
		String[] path = { null };
		boolean ascending = true, descending = true;
		for (String category : ORDER_CLASSES) {
			Integer sign = comparatorSign(node, first, second, category, path);
			if (sign == null) return null;
			int natural = category.equals("LT") ? -1 : category.equals("GT") ? 1 : 0;
			if (sign != natural) ascending = false;
			if (sign != -natural) descending = false;
		}
		return ascending || descending ? new SortKey(path[0], "natural", ascending ? "asc" : "desc") : null;
	}
	private List<SortKey> comparatorKeys(AstNode input, String first, String second) {
		AstNode node = unparen(input);
		if (node instanceof org.mozilla.javascript.ast.InfixExpression infix && operator(infix).equals("||")) {
			List<SortKey> left = comparatorKeys(infix.getLeft(), first, second), right = comparatorKeys(infix.getRight(), first, second);
			if (left == null || right == null) return null;
			var both = new ArrayList<SortKey>(left); both.addAll(right); return both;
		}
		SortKey key = keyComparator(node, first, second);
		return key == null ? null : List.of(key);
	}
	private Map<String, Object> sortProperties(SortKey key) {
		var props = map("compare", key.compare, "direction", key.direction);
		if (!key.path.isEmpty()) props.put("by", "current." + key.path);
		return props;
	}
	private static final Map<String, Object> TYPE_BOTTOM = Map.of("bottom", true);
	private static final Map<String, Object> TYPE_ANY = Map.of("any", true);
	private Map<String, Object> numberType(double value) {
		return Double.isFinite(value) ? map("type", value == Math.floor(value) ? "integer" : "number") : null;
	}
	private String typeName(Map<String, Object> type) { return type == null ? "" : String.valueOf(type.getOrDefault("type", "")); }
	@SuppressWarnings("unchecked")
	private Map<String, Object> staticType(AstNode input) {
		AstNode node = unparen(input);
		if (node instanceof StringLiteral || kind(node).equals("TemplateLiteral")) return map("type", "string");
		if (node instanceof org.mozilla.javascript.ast.NumberLiteral number) return numberType(number.getNumber());
		if (node instanceof org.mozilla.javascript.ast.UnaryExpression unary) {
			String spelling = raw(node).trim();
			String op = spelling.startsWith("typeof") ? "typeof" : spelling.isEmpty() ? "" : spelling.substring(0, 1);
			AstNode operand = unparen(unary.getOperand());
			if ((op.equals("-") || op.equals("+")) && operand instanceof org.mozilla.javascript.ast.NumberLiteral number)
				return numberType(number.getNumber());
			if (op.equals("!")) return map("type", "boolean");
			if (op.equals("typeof")) return map("type", "string");
		}
		if (node instanceof org.mozilla.javascript.ast.KeywordLiteral) {
			String word = raw(node).trim();
			if (word.equals("true") || word.equals("false")) return map("type", "boolean");
			if (word.equals("null")) return map("type", "null");
		}
		if (node.getClass() == org.mozilla.javascript.ast.InfixExpression.class && Set.of("==", "!=", "===", "!==", "<", "<=", ">", ">=").contains(operator(node))) return map("type", "boolean");
		if (node instanceof org.mozilla.javascript.ast.ConditionalExpression conditional) {
			var yes = staticType(conditional.getTrueExpression());
			return yes == null ? null : mergeTypes(yes, staticType(conditional.getFalseExpression()));
		}
		if (node instanceof org.mozilla.javascript.ast.ArrayLiteral array) {
			Map<String, Object> items = TYPE_BOTTOM;
			for (AstNode element : array.getElements()) {
				if (element instanceof org.mozilla.javascript.ast.Spread) return null;
				items = mergeTypes(items, staticType(element));
				if (items == null) return null;
			}
			return map("type", "array", "items", items);
		}
		if (node instanceof ObjectLiteral object) {
			var fields = new LinkedHashMap<String, Object>();
			for (var member : object.getElements()) {
				if (!(member instanceof ObjectProperty field) || field.getValue() instanceof FunctionNode) return map("type", "object", "fields", map());
				AstNode keyNode = field.getKey();
				if (!(keyNode instanceof Name || keyNode instanceof StringLiteral || keyNode instanceof org.mozilla.javascript.ast.NumberLiteral)) return map("type", "object", "fields", map());
				fields.put(key(keyNode), staticType(field.getValue()) == null ? TYPE_ANY : staticType(field.getValue()));
			}
			return map("type", "object", "fields", fields);
		}
		return null;
	}
	@SuppressWarnings("unchecked")
	private Map<String, Object> mergeTypes(Map<String, Object> a, Map<String, Object> b) {
		if (a == null || b == null) return null;
		if (a == TYPE_BOTTOM) return b;
		if (b == TYPE_BOTTOM) return a;
		if (a == TYPE_ANY || b == TYPE_ANY) return TYPE_ANY;
		String left = typeName(a), right = typeName(b);
		if (left.equals("null") && right.equals("null")) return a;
		if (left.equals("null") || right.equals("null")) {
			var copy = new LinkedHashMap<String, Object>(left.equals("null") ? b : a);
			copy.put("nullable", true);
			return copy;
		}
		String type = left.equals(right) ? left : Set.of("integer", "number").contains(left) && Set.of("integer", "number").contains(right) ? "number" : "";
		if (type.isEmpty()) return null;
		var merged = map("type", type);
		if (Boolean.TRUE.equals(a.get("nullable")) || Boolean.TRUE.equals(b.get("nullable"))) merged.put("nullable", true);
		if (type.equals("array")) {
			var items = mergeTypes((Map<String, Object>) a.get("items"), (Map<String, Object>) b.get("items"));
			if (items == null) return null;
			merged.put("items", items);
		}
		if (type.equals("object")) {
			var af = (Map<String, Object>) a.getOrDefault("fields", Map.of());
			var bf = (Map<String, Object>) b.getOrDefault("fields", Map.of());
			var fields = new LinkedHashMap<String, Object>();
			for (String key : af.keySet()) fields.put(key, bf.containsKey(key) ? mergeTypes((Map<String, Object>) af.get(key), (Map<String, Object>) bf.get(key)) : af.get(key));
			for (String key : bf.keySet()) fields.putIfAbsent(key, bf.get(key));
			fields.replaceAll((key, value) -> value == null ? TYPE_ANY : value);
			merged.put("fields", fields);
		}
		return merged;
	}
	@SuppressWarnings("unchecked")
	private Map<String, Object> schemaOf(Map<String, Object> type) {
		if (type == null || type == TYPE_BOTTOM || type == TYPE_ANY) return null;
		var schema = map("type", type.get("type"));
		if (Boolean.TRUE.equals(type.get("nullable")) && !typeName(type).equals("null")) schema.put("nullable", true);
		if (typeName(type).equals("array")) {
			var items = schemaOf((Map<String, Object>) type.get("items"));
			if (items == null) return null;
			schema.put("items", items);
		}
		if (typeName(type).equals("object")) {
			var fields = (Map<String, Object>) type.getOrDefault("fields", Map.of());
			var properties = new LinkedHashMap<String, Object>();
			for (var entry : fields.entrySet()) {
				var field = schemaOf((Map<String, Object>) entry.getValue());
				if (field != null) properties.put(entry.getKey(), field);
			}
			if (!properties.isEmpty()) schema.put("properties", properties);
		}
		return schema;
	}
	// const rows = [] (or let) followed by rows.push(v): the item type proven by every push and every later assignment of
	// the list, or a refusal at the first value that has no certain type or disagrees, with the type it would take.
	private Map<String, Object> inferredList(VariableDeclaration declaration, String name) {
		AstNode parent = declaration.getParent();
		final Map<String, Object>[] itemType = new Map[] { TYPE_BOTTOM };
		final Map<String, Object>[] likely = new Map[] { null };
		final AstNode[] refused = { null };
		final boolean[] conflict = { false };
		final int[] pushes = { 0 };
		java.util.function.BiConsumer<Map<String, Object>, AstNode> add = (found, at) -> {
			if (refused[0] != null) return;
			var next = found == null ? null : mergeTypes(itemType[0], found);
			if (next == null) { refused[0] = at; conflict[0] = found != null; likely[0] = found == null ? likelyType(at) : null; }
			else itemType[0] = next;
		};
		visit(parent, part -> {
			if (refused[0] != null || pos(part) < end(declaration)) return refused[0] == null;
			if (part instanceof FunctionCall call && method(call).equals("push") && call.getTarget() instanceof PropertyGet property && name(property.getTarget()).equals(name)) {
				pushes[0]++;
				for (AstNode argument : call.getArguments()) add.accept(staticType(argument), argument);
			}
			if (part instanceof org.mozilla.javascript.ast.Assignment assignment && name(assignment.getLeft()).equals(name)) {
				var assigned = staticType(assignment.getRight());
				if (assigned == null || !typeName(assigned).equals("array")) { if (refused[0] == null) refused[0] = assignment.getRight(); }
				else {
					@SuppressWarnings("unchecked") var items = (Map<String, Object>) assigned.get("items");
					add.accept(items, assignment.getRight());
				}
			}
			return true;
		});
		if (pushes[0] == 0) return null;
		if (refused[0] == null && schemaOf(itemType[0]) == null) refused[0] = declaration;
		if (refused[0] != null) {
			var known = conflict[0] ? null : schemaOf(likely[0] != null && itemType[0] != TYPE_BOTTOM ? mergeTypes(itemType[0], likely[0]) : likely[0] != null ? likely[0] : itemType[0]);
			String keyword = source.substring(pos(declaration), pos(declaration.getVariables().get(0).getTarget())).trim();
			reject("FLOWSCRIPT_V3_UNTYPED_LIST", refused[0], "Declare the list with the type of every value pushed into it: " + keyword + " " + name + " = json.array({ itemType: " +
				(known != null ? jsLiteral(known) : "{ type: \"CHOOSE_TYPE\" }") + " })" +
				(conflict[0] ? "; the pushed values have different types, and a list has one item type." : known != null ? ", if the value at line " + line(pos(refused[0])) + " has that type." : "."));
		}
		return schemaOf(itemType[0]);
	}
	// For the proposal only: arithmetic gives a number, except NaN and Infinity, which no item type accepts.
	private Map<String, Object> likelyType(AstNode input) {
		AstNode node = unparen(input);
		if (node.getClass() == InfixExpression.class && Set.of("-", "*", "/", "%").contains(operator(node)) ||
			node instanceof org.mozilla.javascript.ast.UnaryExpression unary && unary.getOperator() == org.mozilla.javascript.Token.NEG) return map("type", "number");
		return null;
	}
	// A JavaScript object literal of a schema: { type: "object", properties: { id: { type: "integer" } } }
	@SuppressWarnings("unchecked")
	private static String jsLiteral(Object value) {
		if (value instanceof Map<?, ?> object) {
			if (object.isEmpty()) return "{}";
			var parts = new ArrayList<String>();
			for (var entry : ((Map<String, Object>) object).entrySet())
				parts.add((entry.getKey().matches("[A-Za-z_$][\\w$]*") ? entry.getKey() : json(entry.getKey())) + ": " + jsLiteral(entry.getValue()));
			return "{ " + String.join(", ", parts) + " }";
		}
		return json(value);
	}
	private String globalBlock(FunctionCall call) {
		String name = compact(raw(call.getTarget()));
		return switch (name) {
			case "Object.keys" -> "object.keys";
			case "Object.values" -> "object.values";
			case "JSON.parse" -> "json.parse";
			case "JSON.stringify" -> "json.stringify";
			default -> "";
		};
	}
	private Map<String, Object> globalProps(FunctionCall call, Scope scope) {
		String block = globalBlock(call);
		var args = call.getArguments();
		boolean pretty = block.equals("json.stringify") && args.size() == 3 &&
			args.get(1) != null && raw(args.get(1)).trim().equals("null") && raw(args.get(2)).trim().equals("2");
		if (block.isEmpty() || (!pretty && args.size() != 1) || args.get(0) instanceof FunctionCall)
			reject("FLOWSCRIPT_V3_GLOBAL_CALL", call, "Call the matching object or json block in a separate statement.");
		String key = block.equals("json.parse") ? "text" : block.equals("json.stringify") ? "value" : "source";
		var props = map(key, propertyValue(block, key, args.get(0), scope));
		if (pretty) props.put("pretty", true);
		return props;
	}
	private Lowered lower(AstNode expression, Scope scope) {
		if (expression instanceof PropertyGet property && property.getTarget() instanceof FunctionCall) {
			var receiver = lower(property.getTarget(), scope);
			return new Lowered(receiver.before, receiver.expression + "." + property.getProperty().getIdentifier());
		}
		if (!(expression instanceof FunctionCall call)) return new Lowered(List.of(), rewritten(expression, scope));
		if (!globalBlock(call).isEmpty()) {
			String path = "local.__chain" + (++chain);
			return new Lowered(List.of(capture(globalBlock(call), globalProps(call, scope), path, call)), path);
		}
		if (Set.of("Object.entries", "Date.now").contains(compact(raw(call.getTarget()))))
			reject("FLOWSCRIPT_V3_GLOBAL_CALL", call, "Use object.keys or date blocks.");
		String name = method(call);
		AstNode receiver = call.getTarget() instanceof PropertyGet property ? property.getTarget() : null;
		var args = call.getArguments();
		if (Set.of("reduce", "flatMap", "findIndex").contains(name)) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use filter, map, toSorted, or an explicit loop.");
		boolean flowNamespace = receiver instanceof Name n && Set.of("list", "json", "object", "text").contains(n.getIdentifier());
		if (receiver != null && !flowNamespace && Set.of("filter", "map", "find", "some", "every").contains(name)) {
			if (args.size() != 1 || !(args.get(0) instanceof FunctionNode fn) || fn.getParams().size() != 1 || !(fn.getParams().get(0) instanceof Name))
				reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use one arrow parameter and an expression body.");
			var fn = (FunctionNode) args.get(0);
			var prefix = lower(receiver, scope);
			var inner = new Scope(scope);
			declare(((Name) fn.getParams().get(0)).getIdentifier(), "const", fn, inner, "current");
			AstNode body = arrowBody(fn, 1, call);
			String predicate = rewritten(body, inner);
			String path = "local.__chain" + (++chain);
			var before = new ArrayList<Map<String, Object>>(prefix.before);
			Map<String, Object> props;
			if (name.equals("map")) props = map("items", listSource(receiver, scope, prefix), "select", unparen(body) instanceof ObjectLiteral ? value(unparen(body), inner) : predicate);
			else props = map("items", listSource(receiver, scope, prefix), "where", name.equals("every") ? "!(" + predicate + ")" : predicate);
			var step = capture(name.equals("map") ? "list.map" : "list.filter", props, path, call);
			step.put("__flowScriptAs", fn.getParams().get(0) instanceof Name n ? n.getIdentifier() : "item");
			step.put("__flowScriptChain", raw(call));
			before.add(step);
			return new Lowered(before, name.equals("find") ? path + "[0]" : name.equals("some") ? path + ".length > 0" : name.equals("every") ? path + ".length == 0" : path);
		}
		if (receiver != null && (name.equals("toSorted") || name.equals("sort") && !flowNamespace)) {
			if (name.equals("sort")) {
				if (!(receiver instanceof org.mozilla.javascript.ast.ArrayLiteral array) || array.getElements().size() != 1 || !(array.getElements().get(0) instanceof org.mozilla.javascript.ast.Spread))
					reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use toSorted or [...items].sort.");
				receiver = ((org.mozilla.javascript.ast.Spread) ((org.mozilla.javascript.ast.ArrayLiteral) receiver).getElements().get(0)).getExpression();
			}
			if (args.size() != 1 || !(args.get(0) instanceof FunctionNode)) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use a two-parameter key comparator.");
			var fn = (FunctionNode) args.get(0);
			AstNode body = arrowBody(fn, 2, call);
			String first = name(fn.getParams().get(0)), second = name(fn.getParams().get(1));
			if (first.isEmpty() || second.isEmpty()) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Use two named callback parameters.");
			List<SortKey> keys = first.equals(second) ? null : comparatorKeys(body, first, second);
			if (keys == null) reject("FLOWSCRIPT_V3_LIST_METHOD", call,
				"Compare one key of the two items with a.k - b.k, a.k.localeCompare(b.k) or a.k < b.k ? -1 : a.k > b.k ? 1 : 0 (b before a for descending), and join several keys with ||.");
			var prefix = lower(receiver, scope);
			String path = "local.__chain" + (++chain);
			var before = new ArrayList<Map<String, Object>>(prefix.before);
			var props = map("items", listSource(receiver, scope, prefix));
			props.putAll(sortProperties(keys.get(0)));
			if (keys.size() > 1) {
				var remaining = new ArrayList<Map<String, Object>>();
				for (int i = 1; i < keys.size(); i++) {
					var secondary = sortProperties(keys.get(i));
					if (secondary.containsKey("by")) secondary.put("by", "${" + secondary.get("by") + "}");
					remaining.add(secondary);
				}
				props.put("then", remaining);
			}
			before.add(capture("list.sort", props, path, call));
			return new Lowered(before, path);
		}
		if (receiver instanceof Name n && n.getIdentifier().equals("flow") && name.equals("default")) return new Lowered(List.of(), rewritten(call, scope));
		if (receiver != null) {
			var prefix = lower(receiver, scope);
			if (name.equals("concat") && !flowNamespace) {
				var before = new ArrayList<Map<String, Object>>(prefix.before);
				var values = new ArrayList<String>();
				for (AstNode argument : args) {
					var item = lower(argument, scope);
					before.addAll(item.before);
					values.add(item.expression);
				}
				if (!before.isEmpty()) return new Lowered(before, prefix.expression + ".concat(" + String.join(", ", values) + ")");
			}
			if (!prefix.before.isEmpty()) {
				var values = new ArrayList<String>();
				for (AstNode argument : args) values.add(rewritten(argument, scope));
				return new Lowered(prefix.before, prefix.expression + "." + name + "(" + String.join(", ", values) + ")");
			}
		}
		return new Lowered(List.of(), rewritten(call, scope));
	}
	private String resolve(String spelling) {
		if (spelling.startsWith("flow.") && Set.of("flow.while", "flow.forEach", "flow.if", "flow.try").contains(spelling)) return spelling.substring(5);
		if (imports.containsKey(spelling)) return imports.get(spelling);
		int dot = spelling.indexOf('.');
		if (dot >= 0 && imports.containsKey(spelling.substring(0, dot) + ".*")) return imports.get(spelling.substring(0, dot) + ".*") + spelling.substring(dot);
		return spelling;
	}
	// A call with a slot ($$nodes, $$then…), or a control block (flow.while, flow.forEach, flow.if, flow.try).
	private boolean slotted(AstNode input) {
		if (!(unparen(input) instanceof FunctionCall call) || call.getClass() != FunctionCall.class) return false;
		if (compact(raw(call.getTarget())).matches("flow\\.(?:while|forEach|if|try)")) return true;
		var args = call.getArguments();
		return args.size() == 1 && args.get(0) instanceof ObjectLiteral object && object.getElements().stream().anyMatch(member ->
			member instanceof ObjectProperty field && raw(field.getKey()).trim().startsWith("$$") && field.getValue() instanceof FunctionNode);
	}
	private Map<String, Object> callNode(FunctionCall call, Scope scope, String destination) {
		String block = resolve(compact(raw(call.getTarget())));
		boolean slots = slotted(call);
		// A call without slot is read as one expression first: the names, chains and calls it holds are refused as there.
		if (!slots) rewritten(call, scope);
		if (call.getArguments().size() != 1 || !(call.getArguments().get(0) instanceof ObjectLiteral))
			reject("FLOWSCRIPT_V3_UNSUPPORTED", call, slots ? "Call flow control blocks with one object argument." : "Call Flow blocks with one object argument.");
		var object = (ObjectLiteral) call.getArguments().get(0);
		// Declared, assigned or returned, a call with a slot writes its output to that destination ($$out).
		if (slots && destination != null && object.getElements().stream().anyMatch(member -> member instanceof ObjectProperty field && raw(field.getKey()).trim().equals("$$out")))
			reject("FLOWSCRIPT_V3_UNSUPPORTED", call, "Write the assignment or $$out, not both.");
		// A function under a $$ name the block does not declare as a slot would never run (v2 check).
		var slotNames = slotNames(block);
		if (slotNames != null) for (var member : object.getElements()) {
			if (!(member instanceof ObjectProperty field) || !(field.getValue() instanceof FunctionNode)) continue;
			String key = key(field.getKey());
			if (key.startsWith("$$") && !slotNames.contains(key.substring(2))) {
				var spelled = new ArrayList<String>();
				for (String slot : slotNames) spelled.add("$$" + slot + ": function () { ... }");
				defer("FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN", line(pos(call)), "Flow block " + block + " has no slot " + key + " at line " + line(pos(call)) + ".",
					slotNames.isEmpty() ? block + " has no slot; run the following nodes after it." : block + " slots are written " + String.join(", ", spelled) + ".");
			}
		}
		var props = new LinkedHashMap<String, Object>();
		var result = node(block, props, call);
		result.put("__flowScriptForm", "call");
		for (var member : object.getElements()) {
			if (slots && !(member instanceof ObjectProperty)) reject("FLOWSCRIPT_V3_UNSUPPORTED", member, "Use named control properties.");
			var field = property(member);
			String key = key(field.getKey());
			AstNode expression = field.getValue();
			if (key.startsWith("$$")) {
				String attribute = key.substring(2);
				if (expression instanceof FunctionNode fn) {
					// A slot is a method ($$nodes() { … }), a function (function () { … }) or an arrow with a block body.
					if (!fn.getParams().isEmpty() || fn.isGenerator() || source.charAt(pos(fn.getBody())) != '{')
						reject("FLOWSCRIPT_V3_FUNCTION", field, "Write the slot with a body and no parameter: " + key + "() { … }, " + key + ": function () { … } or " + key + ": () => { … }.");
					var slot = new ArrayList<Map<String, Object>>();
					body(fn.getBody(), new Scope(scope), slot);
					result.put(attribute, slot);
				} else result.put(attribute, literal(expression));
			} else props.put(key, propertyValue(block, key, expression, scope));
		}
		if (destination != null) {
			// an assigned call whose $$out names another destination (v2 check)
			if (result.containsKey("out") && !destination.equals(result.get("out")))
				defer("FLOW_SOURCE_OUTPUT_CONFLICT", line(pos(call)), "Assignment and $$out have different destinations at line " + line(pos(call)),
					"Remove $$out from the assignment or use an explicit block call.");
			if (block.equals("set")) props.putIfAbsent("path", destination);
			if ((block.equals("json.array") || block.equals("json.map")) && !props.containsKey("path")) props.put("path", destination);
			if (!block.equals("set")) result.put("out", destination);
		}
		return result;
	}

	private void assign(List<Map<String, Object>> output, String target, AstNode rhs, Scope scope, AstNode at) {
		AstNode candidate = unparen(rhs);
		if (candidate instanceof org.mozilla.javascript.ast.ConditionalExpression conditional &&
			(holdsBlockStep(conditional.getTrueExpression()) || holdsBlockStep(conditional.getFalseExpression()))) {
			var yes = new ArrayList<Map<String, Object>>();
			var no = new ArrayList<Map<String, Object>>();
			assign(yes, target, conditional.getTrueExpression(), scope, at);
			assign(no, target, conditional.getFalseExpression(), scope, at);
			var branch = control("if", map("condition", expression(conditional.getTestExpression(), scope)), at, "then", yes);
			branch.put("else", no);
			output.add(branch);
			return;
		}
		if (rhs instanceof FunctionCall collection && target.startsWith("local.")) {
			String collectionName = compact(raw(collection.getTarget()));
			if (collectionName.equals("json.array")) typedLists.add(target);
			if (collectionName.equals("json.map")) typedMaps.add(target);
		}
		if (rhs instanceof FunctionCall global && !globalBlock(global).isEmpty()) {
			output.add(capture(globalBlock(global), globalProps(global, scope), target, at));
			return;
		}
		if (rhs instanceof FunctionCall call && isBlockCall(call)) { output.add(callNode(call, scope, target)); return; }
		var lowered = lower(rhs, scope);
		if (!lowered.before.isEmpty()) {
			output.addAll(lowered.before);
			output.add(node("set", map("path", target, "value", "${" + lowered.expression + "}"), at));
		} else set(output, target, rhs, scope, at);
	}
	// The value of a destructured declaration or of a switch, read as an expression, in a hidden local named after the steps
	// of that expression: a call with a slot, or a ?: with a block step in a branch, is refused there.
	private String hiddenValue(List<Map<String, Object>> output, AstNode value, Scope scope, AstNode at) {
		AstNode candidate = unparen(value);
		if (slotted(value) || candidate instanceof ConditionalExpression conditional &&
			(holdsBlockStep(conditional.getTrueExpression()) || holdsBlockStep(conditional.getFalseExpression()))) lower(value, scope);
		if (value instanceof FunctionCall call && (!globalBlock(call).isEmpty() || isBlockCall(call))) {
			String path = "local.__chain" + (++chain);
			assign(output, path, value, scope, at);
			return path;
		}
		var lowered = lower(value, scope);
		String path = "local.__chain" + (++chain);
		output.addAll(lowered.before);
		if (!lowered.before.isEmpty()) output.add(node("set", map("path", path, "value", "${" + lowered.expression + "}"), at));
		else set(output, path, value, scope, at);
		return path;
	}
	// A block step of a condition: a list method with an arrow, or a global call lowered to a block.
	private boolean blockStep(AstNode part) {
		if (part == null || part.getClass() != FunctionCall.class) return false;
		var call = (FunctionCall) part;
		if (compact(raw(call.getTarget())).matches("(?:Object|JSON)\\.(?:keys|values|parse|stringify)")) return true;
		AstNode receiver = call.getTarget() instanceof PropertyGet property ? property.getTarget() : null;
		return receiver != null && LIST_STEPS.contains(method(call)) && !(receiver instanceof Name n && FLOW_NAMESPACES.contains(n.getIdentifier()));
	}
	private record Lifted(List<Map<String, Object>> before, String expression) { }
	// The condition of an if is evaluated once, whole, before its branches: each block step it always evaluates (not in the
	// right operand of && || ??, a branch of ?:, an arrow or an argument of a call) runs before the statement, in a hidden
	// local, which is the JavaScript order since expressions have no effect. A step in a lazy place stays refused.
	private Lifted liftedCondition(AstNode condition, Scope scope) {
		var before = new ArrayList<Map<String, Object>>();
		var replaced = new IdentityHashMap<AstNode, String>();
		visit(condition, part -> {
			if (!blockStep(part)) return true;
			for (AstNode child = part, parent = part.getParent(); child != condition && parent != null; child = parent, parent = parent.getParent()) {
				if (parent instanceof FunctionNode) return true;
				if (parent.getClass() == InfixExpression.class && Set.of("&&", "||", "??").contains(operator(parent)) && ((InfixExpression) parent).getRight() == child) return true;
				if (parent instanceof ConditionalExpression test && test.getTestExpression() != child) return true;
				if (parent.getClass() == FunctionCall.class && ((FunctionCall) parent).getTarget() != child) return true;
			}
			var lowered = lower(part, scope);
			before.addAll(lowered.before);
			// a global call is its hidden local; a list method is the expression of its steps
			replaced.put(part, globalBlock((FunctionCall) part).isEmpty() ? "(" + lowered.expression + ")" : lowered.expression);
			return false;
		});
		return new Lifted(before, rewritten(condition, scope, replaced));
	}
	private boolean holdsBlockStep(AstNode value) {
		final boolean[] found = { false };
		visit(value, part -> {
			if (part instanceof FunctionCall call && (LIST_STEPS.contains(method(call)) ||
				compact(raw(call.getTarget())).matches("(?:Object|JSON)\\..*"))) found[0] = true;
			return !found[0];
		});
		return found[0];
	}
	private boolean isBlockCall(FunctionCall call) {
		String target = resolve(compact(raw(call.getTarget())));
		if (target.equals("flow.default") || target.equals("default") || target.equals("String") || target.equals("Number") || target.startsWith("Math.")) return false;
		if (target.startsWith("input.") || target.startsWith("local.") || target.startsWith("result.") || target.startsWith("current.")) return false;
		return call.getArguments().size() == 1 && call.getArguments().get(0) instanceof ObjectLiteral;
	}

	private void body(AstNode body, Scope scope, List<Map<String, Object>> output) {
		if (body instanceof org.mozilla.javascript.ast.Block || body instanceof org.mozilla.javascript.ast.Scope && !(body instanceof FunctionNode)) {
			int cursor = pos(body) + 1;
			for (AstNode item : children(body)) {
				var gap = trivia(cursor, pos(item), output);
				int first = output.size();
				statement(item, scope, output);
				if (output.size() > first) {
					if (gap.comment != null) {
						// the @disabled directive disables the statement; it is not part of its comment
						var lines = new ArrayList<String>(Arrays.asList(gap.comment.split("\n", -1)));
						for (int i = lines.size() - 1; i >= 0; i--) if (lines.get(i).matches("\\s*@disabled\\s*")) { lines.remove(i); break; }
						if (!lines.isEmpty()) output.get(first).put("comment", String.join("\n", lines));
						if (gap.comment.matches("(?s)(?:.*\\n)?\\s*@disabled\\b.*")) {
							if (output.size() != first + 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", item, "Put $$disabled: true on each block generated by this statement.");
							output.get(first).put("disabled", true);
						}
					}
					if (gap.blank) output.get(first).put("__flowBlankBefore", true);
				}
				cursor = end(item);
			}
			// the comments that end a block are a comment node
			var last = trivia(cursor, Math.max(cursor, end(body) - 1), output);
			if (last.comment != null) commentNode(last.comment, last.blank, last.line, output);
		} else statement(body, scope, output);
	}
	private record Gap(String comment, boolean blank, int line) { }
	private static final java.util.regex.Pattern COMMENT = java.util.regex.Pattern.compile("//[^\\r\\n]*|/\\*[\\s\\S]*?\\*/");
	private static final java.util.regex.Pattern BLANK_LINE = java.util.regex.Pattern.compile("(?:\\r\\n|\\r|\\n)\\s*(?:\\r\\n|\\r|\\n)");
	// The comments and blank lines between two statements, read as the v2 reading of the bridge text reads them: a blank
	// line after comments makes them a comment node, and marks what follows (__flowBlankBefore, presentation only); the
	// comments left are those of the next statement. Blank lines without any comment around them are not kept.
	private Gap trivia(int from, int to, List<Map<String, Object>> output) {
		if (to <= from) return new Gap(null, false, 0);
		int start = Math.max(0, from);
		String gap = source.substring(start, Math.min(source.length(), to));
		var matcher = COMMENT.matcher(gap);
		var comments = new ArrayList<String>();
		boolean blank = false, found = false;
		int cursor = 0, commentLine = 0;
		while (matcher.find()) {
			if (BLANK_LINE.matcher(gap.substring(cursor, matcher.start())).find()) {
				if (!comments.isEmpty()) commentNode(String.join("\n", comments), blank, commentLine, output);
				comments.clear();
				blank = true;
			}
			if (comments.isEmpty()) commentLine = line(start + matcher.start());
			String text = matcher.group();
			// "// note" is "note": the first space after // is dropped, the end is trimmed
			if (text.startsWith("//")) comments.add(text.substring(2).replaceFirst("^ ", "").stripTrailing());
			else for (String part : text.substring(2, text.length() - 2).split("\\r\\n|\\r|\\n")) comments.add(part.replaceFirst("^\\s*\\* ?", "").trim());
			cursor = matcher.end();
			found = true;
		}
		if (found && BLANK_LINE.matcher(gap.substring(cursor)).find()) {
			if (!comments.isEmpty()) commentNode(String.join("\n", comments), blank, commentLine, output);
			comments.clear();
			blank = true;
		}
		return new Gap(comments.isEmpty() ? null : String.join("\n", comments), blank, commentLine);
	}
	private void commentNode(String comment, boolean blank, int line, List<Map<String, Object>> output) {
		var node = map("block", "comment", "props", map(), "__flowScriptLine", line);
		node.put("comment", comment);
		if (blank) node.put("__flowBlankBefore", true);
		output.add(node);
	}
	private void inBody(AstNode body, Scope scope, List<Map<String, Object>> output) {
		loopDepth++;
		body(body, scope, output);
		loopDepth--;
	}
	private String expression(AstNode node, Scope scope) { return rewritten(node, scope); }
	private Map<String, Object> control(String block, Map<String, Object> props, AstNode at, String slot, List<Map<String, Object>> children) {
		var result = node(block, props, at);
		result.put(slot, children);
		return result;
	}
	private List<Map<String, Object>> branch(AstNode body, Scope parent) {
		var children = new ArrayList<Map<String, Object>>();
		body(body, new Scope(parent), children);
		return children;
	}
	private boolean needsOuterItemCopy(org.mozilla.javascript.ast.ForInLoop loop, String item) {
		final boolean[] needed = { false };
		visit(loop.getBody(), part -> {
			if (!(part instanceof Name n) || !n.getIdentifier().equals(item)) return true;
			if (part.getParent() instanceof PropertyGet property && property.getProperty() == part) return true;
			if (part.getParent() instanceof ObjectProperty field && field.getKey() == part && !raw(field).trim().equals(item)) return true;
			for (var enclosing = part.getParent(); enclosing != null && enclosing != loop; enclosing = enclosing.getParent()) {
				if (enclosing instanceof org.mozilla.javascript.ast.ForInLoop inner && inner.isForOf() && pos(part) >= pos(inner.getBody())) { needed[0] = true; break; }
				if (enclosing instanceof FunctionNode fn && fn.getParent() instanceof FunctionCall call && Set.of("filter", "map", "find", "some", "every").contains(method(call))) { needed[0] = true; break; }
				if (enclosing instanceof FunctionCall call && compact(raw(call.getTarget())).matches("^(flow\\.forEach|list\\.).*") && raw(call).matches("(?s).*\\bcurrent\\b.*")) { needed[0] = true; break; }
			}
			return !needed[0];
		});
		return needed[0];
	}
	private void forOf(org.mozilla.javascript.ast.ForInLoop loop, Scope scope, List<Map<String, Object>> output) {
		AstNode iterator = loop.getIterator();
		var decl = iterator instanceof VariableDeclaration declaration && !declaration.getVariables().isEmpty() ? declaration.getVariables().get(0) : null;
		if (decl == null || !(decl.getTarget() instanceof Name || decl.getTarget() instanceof ObjectLiteral))
			reject("FLOWSCRIPT_V3_DESTRUCTURING", loop, "Use a single loop variable or a one-level object pattern.");
		if (!source.substring(pos(iterator), pos(decl.getTarget())).trim().equals("const")) reject("FLOWSCRIPT_V3_LOOP_FORM", loop, "Use for (const item of items).");
		AstNode target = decl.getTarget();
		var body = new ArrayList<Map<String, Object>>();
		var inner = new Scope(scope);
		Binding itemBinding = null;
		if (target instanceof Name item) {
			itemBinding = declare(item.getIdentifier(), "const", item, inner, "current");
			if (needsOuterItemCopy(loop, item.getIdentifier())) itemBinding.mapped = "local." + item.getIdentifier();
		}
		// for (const key of Object.keys(o)), or of a list method chain: the list is computed once, before the loop, in a
		// hidden local, as JavaScript evaluates the iterated expression once.
		AstNode items = loop.getIteratedObject(), iterated = unparen(items);
		Object list;
		if (iterated != null && iterated.getClass() == FunctionCall.class && (blockStep(iterated) || method((FunctionCall) iterated).equals("concat")) &&
			!Set.of("find", "some", "every").contains(method((FunctionCall) iterated)) && !compact(raw(((FunctionCall) iterated).getTarget())).startsWith("JSON.")) {
			var listed = lower(iterated, scope);
			output.addAll(listed.before);
			if (listed.expression.matches("local\\.__chain\\d+")) list = listed.expression;
			else {
				String hidden = "local.__chain" + (++chain);
				output.add(node("set", map("path", hidden, "value", "${" + listed.expression + "}"), loop));
				list = hidden;
			}
		} else list = items instanceof org.mozilla.javascript.ast.ArrayLiteral ? value(items, scope) : expression(items, scope);
		if (itemBinding != null && !itemBinding.mapped.equals("current")) body.add(node("set", map("path", itemBinding.mapped, "value", "${current}"), loop));
		if (target instanceof ObjectLiteral object) for (var member : object.getElements()) {
			if (!(member instanceof ObjectProperty field) || !(field.getKey() instanceof Name) || !(field.getValue() instanceof Name))
				reject("FLOWSCRIPT_V3_DESTRUCTURING", loop, "Use one-level fields without defaults or rest.");
			var field = (ObjectProperty) member;
			var binding = declare(((Name) field.getValue()).getIdentifier(), "const", loop, inner, null);
			body.add(node("set", map("path", binding.mapped, "value", "${current." + ((Name) field.getKey()).getIdentifier() + "}"), loop));
		}
		inBody(loop.getBody(), inner, body);
		var iteration = control("forEach", map("items", list), loop, "nodes", body);
		if (target instanceof Name item) iteration.put("__flowScriptAs", item.getIdentifier());
		output.add(iteration);
	}
	private void countedFor(org.mozilla.javascript.ast.ForLoop loop, Scope scope, List<Map<String, Object>> output) {
		AstNode initializer = loop.getInitializer(), condition = loop.getCondition(), increment = loop.getIncrement();
		if (!(initializer instanceof VariableDeclaration declaration) || declaration.getVariables().size() != 1 ||
			!(condition instanceof org.mozilla.javascript.ast.InfixExpression infix) || !(increment instanceof org.mozilla.javascript.ast.UpdateExpression update))
			reject("FLOWSCRIPT_V3_FOR_FORM", loop, "Use for (let i = start; i < end; i++).");
		var declaration = (VariableDeclaration) initializer;
		var variable = declaration.getVariables().get(0);
		String counter = name(variable.getTarget());
		var infix = (org.mozilla.javascript.ast.InfixExpression) condition;
		var update = (org.mozilla.javascript.ast.UpdateExpression) increment;
		String operator = org.mozilla.javascript.ast.AstNode.operatorToString(infix.getOperator());
		if (counter.isEmpty() || variable.getInitializer() == null || !source.substring(pos(initializer), pos(variable.getTarget())).trim().equals("let") ||
			!Set.of("<", "<=").contains(operator) || !name(infix.getLeft()).equals(counter) || !name(update.getOperand()).equals(counter) || !raw(update).contains("++"))
			reject("FLOWSCRIPT_V3_FOR_FORM", loop, "Use for (let i = start; i < end; i++).");
		var inner = new Scope(scope);
		var binding = declare(counter, "let", variable.getTarget(), inner, null);
		visit(loop.getBody(), part -> {
			AstNode target = part instanceof org.mozilla.javascript.ast.Assignment assignment ? assignment.getLeft() :
				part instanceof org.mozilla.javascript.ast.UpdateExpression updatePart ? updatePart.getOperand() : null;
			if (target != null && (name(target).equals(counter) || target instanceof PropertyGet property && name(property.getTarget()).equals("local") && name(property.getProperty()).equals(counter)))
				reject("FLOWSCRIPT_V3_FOR_FORM", part, "Leave the counter to i++, or write a while loop with a local the body changes: let i = start; while (i < end) { … }.");
			return true;
		});
		final boolean[] continued = { false };
		visit(loop.getBody(), part -> {
			if (part instanceof org.mozilla.javascript.ast.ContinueStatement) {
				for (AstNode enclosing = part.getParent(); enclosing != null; enclosing = enclosing.getParent()) {
					if (enclosing instanceof org.mozilla.javascript.ast.Loop) { if (enclosing == loop) continued[0] = true; break; }
				}
			}
			return !continued[0];
		});
		String hidden = continued[0] ? "local.__count" + (++counted) : binding.mapped;
		set(output, hidden, variable.getInitializer(), scope, loop);
		var body = new ArrayList<Map<String, Object>>();
		String conditionValue;
		if (continued[0]) {
			var steps = new Scope(inner);
			steps.names.put(counter, new Binding("let", hidden));
			conditionValue = expression(condition, steps);
			body.add(node("set", map("path", binding.mapped, "value", "${" + hidden + "}"), loop));
			body.add(node("set", map("path", hidden, "value", "${Number(" + hidden + ") + 1}"), increment));
		} else conditionValue = expression(condition, inner);
		loopDepth++; countedDepth++;
		body(loop.getBody(), inner, body);
		countedDepth--; loopDepth--;
		if (!continued[0]) body.add(node("set", map("path", binding.mapped, "value", "${Number(" + binding.mapped + ") + 1}"), increment));
		output.add(control("while", map("condition", conditionValue, "maxIterations", 1000000, "timeoutMs", 60000), loop, "nodes", body));
	}
	private void switchStatement(org.mozilla.javascript.ast.SwitchStatement statement, Scope scope, List<Map<String, Object>> output) {
		String path = hiddenValue(output, statement.getExpression(), scope, statement);
		List<Map<String, Object>> current = output;
		var cases = statement.getCases();
		for (int i = 0; i < cases.size(); i++) {
			var item = cases.get(i);
			var members = item.getStatements();
			AstNode last = members == null || members.isEmpty() ? null : members.get(members.size() - 1);
			if (last == null || !(last instanceof org.mozilla.javascript.ast.BreakStatement || last instanceof org.mozilla.javascript.ast.ReturnStatement || last instanceof org.mozilla.javascript.ast.ThrowStatement) ||
				item.isDefault() && i != cases.size() - 1 || item.getExpression() != null && !Set.of("StringLiteral", "NumberLiteral", "KeywordLiteral").contains(kind(item.getExpression())))
				reject("FLOWSCRIPT_V3_SWITCH_FALLTHROUGH", item, "Use literal cases ending with break, return or throw; put default last.");
			// the statements of a case share one scope
			var caseScope = new Scope(scope);
			if (!item.isDefault()) {
				var branch = new ArrayList<Map<String, Object>>();
				var conditional = control("if", map("condition", path + " === " + expression(item.getExpression(), scope)), item, "then", branch);
				current.add(conditional);
				var otherwise = new ArrayList<Map<String, Object>>();
				conditional.put("else", otherwise);
				current = otherwise;
				for (int j = 0; j < members.size(); j++) if (j != members.size() - 1 || !(members.get(j) instanceof org.mozilla.javascript.ast.BreakStatement))
					statement(members.get(j), caseScope, branch);
			} else {
				for (int j = 0; j < members.size(); j++) if (j != members.size() - 1 || !(members.get(j) instanceof org.mozilla.javascript.ast.BreakStatement))
					statement(members.get(j), caseScope, current);
			}
		}
	}
	private void statement(AstNode statement, Scope scope, List<Map<String, Object>> output) {
		if (statement instanceof VariableDeclaration declaration) {
			for (VariableInitializer variable : declaration.getVariables()) {
				AstNode target = variable.getTarget(), init = variable.getInitializer();
				String type = source.substring(pos(declaration), pos(target)).trim().split("\\s+", 2)[0];
				if (!type.equals("const") && !type.equals("let")) reject("FLOWSCRIPT_V3_UNSUPPORTED", declaration, "Use const or let for Flow locals.");
				if (target instanceof ObjectLiteral object) {
					if (init == null) reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Initialize the object before destructuring.");
					String path = hiddenValue(output, init, scope, declaration);
					for (var member : object.getElements()) {
						if (!(member instanceof ObjectProperty field) || !(field.getKey() instanceof Name) || !(field.getValue() instanceof Name))
							reject("FLOWSCRIPT_V3_DESTRUCTURING", declaration, "Use one-level fields without defaults or rest.");
						var field = (ObjectProperty) member;
						var key = (Name) field.getKey(); var alias = (Name) field.getValue();
						var binding = declare(alias.getIdentifier(), type, declaration, scope, null);
						output.add(node("set", map("path", binding.mapped, "value", "${" + path + "." + key.getIdentifier() + "}"), declaration));
					}
					continue;
				}
				if (!(target instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Declare each field separately.");
				if (type.equals("const") && init == null) reject("FLOWSCRIPT_V3_UNSUPPORTED", target, "Give the const its value (const x = value), or declare it with let.");
				// The name is declared after its value is read: let x = x + 1 reads no x, as in JavaScript (a value read before
				// its declaration is an error there).
				String name = ((Name) target).getIdentifier(), mapped = "local." + name;
				AstNode initial = init == null ? null : unparen(init);
				if (initial instanceof org.mozilla.javascript.ast.ArrayLiteral array && array.getElements().isEmpty()) {
					var schema = inferredList(declaration, name);
					if (schema != null) {
						declare(name, type, target, scope, null).typedList = true;
						typedLists.add(mapped);
						output.add(capture("json.array", map("itemType", schema, "path", mapped), mapped, declaration));
						continue;
					}
				}
				boolean typedList = init instanceof FunctionCall call && compact(raw(call.getTarget())).equals("json.array");
				boolean typedMap = init instanceof FunctionCall call && compact(raw(call.getTarget())).equals("json.map");
				if (init != null) assign(output, mapped, init, scope, declaration);
				else output.add(node("set", map("path", mapped, "value", "${undefined}"), declaration));
				var binding = declare(name, type, target, scope, null);
				binding.typedList = typedList;
				binding.typedMap = typedMap;
				if (typedList) typedLists.add(mapped);
				if (typedMap) typedMaps.add(mapped);
				if (!output.isEmpty()) output.get(output.size() - 1).put("__flowScriptDeclare", type);
			}
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.ExpressionStatement expressionStatement) {
			AstNode expression = expressionStatement.getExpression();
			if (expression instanceof org.mozilla.javascript.ast.Assignment assignment) {
				AstNode left = assignment.getLeft(), right = assignment.getRight();
				Binding binding = left instanceof Name n ? lookup(n.getIdentifier(), scope) : null;
				if (binding != null && binding.type.equals("const")) reject("FLOWSCRIPT_V3_CONST_ASSIGN", left, "Declare the variable with let.");
				if (left instanceof Name n && binding == null) reject(allNames.contains(n.getIdentifier()) ? "FLOWSCRIPT_V3_OUT_OF_SCOPE" : "FLOWSCRIPT_V3_UNSUPPORTED", left, "Declare the local first.");
				String target = binding != null ? binding.mapped : rewritten(left, scope);
				String op = org.mozilla.javascript.ast.AstNode.operatorToString(assignment.getOperator());
				if (left instanceof org.mozilla.javascript.ast.ElementGet element) {
					String mapPath = element.getTarget() instanceof Name n ? (lookup(n.getIdentifier(), scope) == null ? "" : lookup(n.getIdentifier(), scope).mapped) : compact(raw(element.getTarget()));
					if (typedMaps.contains(mapPath) && op.equals("=")) {
						output.add(node("json.put", map("path", mapPath, "key", value(element.getElement(), scope), "value", value(right, scope)), statement));
						return;
					}
				}
				if (target.startsWith("result.")) { if (resultStyle.equals("returnObject")) reject("FLOWSCRIPT_V3_RESULT_MIXED", statement, "Use one result style."); resultStyle = "resultField"; }
				if (op.equals("=")) assign(output, target, right, scope, statement);
				else if (Set.of("+=", "-=", "*=", "/=").contains(op)) {
					var changed = node("set", map("path", target, "value", "${" + target + " " + op.charAt(0) + " (" + rewritten(right, scope) + ")}"), statement);
					changed.put("__flowScriptForm", op);
					output.add(changed);
				}
				else reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", statement, "Use a simple assignment.");
				return;
			}
			if (expression instanceof org.mozilla.javascript.ast.UpdateExpression update) {
				AstNode operand = update.getOperand();
				boolean increment = raw(expression).contains("++");
				String form = increment ? "++" : "--";
				if (operand instanceof PropertyGet) {
					// o.count++ on a field of a local object (or of result): the object is shared as in JavaScript (an object
					// read from a map is that object), so the field changes wherever the object is read.
					String field = rewritten(operand, scope);
					if (!field.matches("(?:local\\.[A-Za-z_$][\\w$]*|result)(?:\\.[A-Za-z_$][\\w$]*)+"))
						reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Update a field of a local object or of result (o.count++), or a local (n++).");
					if (field.startsWith("result.")) { if (resultStyle.equals("returnObject")) reject("FLOWSCRIPT_V3_RESULT_MIXED", statement, "Use one result style."); resultStyle = "resultField"; }
					var changed = node("set", map("path", field, "value", increment ? "${Number(" + field + ") + 1}" : "${" + field + " - 1}"), statement);
					changed.put("__flowScriptForm", form);
					output.add(changed);
					return;
				}
				String name = name(operand);
				if (name.isEmpty()) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Update a local (n++) or a field of a local object (o.count++).");
				Binding binding = lookup(name, scope);
				if (binding == null) reject(allNames.contains(name) ? "FLOWSCRIPT_V3_OUT_OF_SCOPE" : "FLOWSCRIPT_V3_UNSUPPORTED", statement,
					allNames.contains(name) ? "Declare the name in the enclosing block." : "Declare the local first.");
				if (binding.type.equals("const")) reject("FLOWSCRIPT_V3_CONST_ASSIGN", statement, "Declare the variable with let.");
				// x++ adds 1 to the number of x (ToNumeric), where + would join a text; x - 1 already converts.
				var changed = node("set", map("path", binding.mapped, "value", increment ? "${Number(" + binding.mapped + ") + 1}" : "${" + binding.mapped + " - 1}"), statement);
				changed.put("__flowScriptForm", form);
				output.add(changed);
				return;
			}
			if (expression instanceof FunctionCall call) {
				if (call.getTarget() instanceof PropertyGet property && property.getProperty().getIdentifier().equals("push") && !name(property.getTarget()).equals("json")) {
					String path = property.getTarget() instanceof Name n ? (lookup(n.getIdentifier(), scope) == null ? "" : lookup(n.getIdentifier(), scope).mapped) : compact(raw(property.getTarget()));
					if (!typedLists.contains(path)) reject("FLOWSCRIPT_V3_UNTYPED_LIST", statement, "Initialize the list with json.array({ itemType }).");
					if (call.getArguments().size() != 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Push one value per statement.");
					output.add(node("json.push", map("path", path, "value", value(call.getArguments().get(0), scope)), statement));
					return;
				}
				output.add(callNode(call, scope, null));
				return;
			}
			reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Use a Flow block call or an assignment.");
		}
		if (statement instanceof org.mozilla.javascript.ast.ReturnStatement returned) {
			if (loopDepth > 0) reject("FLOWSCRIPT_V3_RETURN_IN_LOOP", statement, "Use continue or return after the loop.");
			AstNode value = returned.getReturnValue();
			if (value instanceof ObjectLiteral object) {
				if (resultStyle.equals("resultField")) reject("FLOWSCRIPT_V3_RESULT_MIXED", statement, "Use one result style.");
				resultStyle = "returnObject";
				for (var member : object.getElements()) {
					if (!(member instanceof ObjectProperty field) || !(field.getKey() instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", statement, "Write explicit result fields.");
					var field = (ObjectProperty) member;
					assign(output, "result." + ((Name) field.getKey()).getIdentifier(), field.getValue(), scope, statement);
				}
				output.add(node("return", map(), statement));
			} else if (value == null) output.add(node("return", map(), statement));
			else if (slotted(value)) {
				// return flow.try({ … }) or a call with a slot: its output goes to a hidden local, returned
				String hidden = "local.__chain" + (++chain);
				output.add(callNode((FunctionCall) unparen(value), scope, hidden));
				output.add(node("return", map("value", "${" + hidden + "}"), statement));
			} else {
				var lowered = lower(value, scope);
				output.addAll(lowered.before);
				output.add(node("return", map("value", lowered.before.isEmpty() ? value(value, scope) : "${" + lowered.expression + "}"), statement));
			}
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.IfStatement conditional) {
			if (conditional.getCondition() instanceof ObjectLiteral) reject("FLOWSCRIPT_V3_OBJECT_CONDITION", conditional.getCondition(), "Use flow.if({ ... }).");
			var condition = liftedCondition(conditional.getCondition(), scope);
			output.addAll(condition.before);
			var branch = control("if", map("condition", condition.expression), statement, "then", branch(conditional.getThenPart(), scope));
			if (conditional.getElsePart() != null) branch.put("else", branch(conditional.getElsePart(), scope));
			output.add(branch);
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.WhileLoop loop) {
			if (loop.getCondition() instanceof ObjectLiteral) reject("FLOWSCRIPT_V3_OBJECT_CONDITION", loop.getCondition(), "Use flow.while({ ... }).");
			visit(loop.getCondition(), part -> {
				if (blockStep(part)) reject("FLOWSCRIPT_V3_CHAIN", part, "A while condition is evaluated before every pass, so its list method cannot run once before the loop: " +
					"keep its value in a let, computed before the loop and again at the end of the body (let pending = xs.some(…); while (pending) { …; pending = xs.some(…) }).");
				return true;
			});
			String condition = expression(loop.getCondition(), scope);
			var body = new ArrayList<Map<String, Object>>();
			inBody(loop.getBody(), new Scope(scope), body);
			output.add(control("while", map("condition", condition, "maxIterations", 1000, "timeoutMs", 60000), loop, "nodes", body));
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.ForInLoop loop) {
			if (!loop.isForOf()) reject("FLOWSCRIPT_V3_LOOP_FORM", loop, "Use while or for…of.");
			forOf(loop, scope, output);
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.ForLoop loop) { countedFor(loop, scope, output); return; }
		if (statement instanceof org.mozilla.javascript.ast.DoLoop) reject("FLOWSCRIPT_V3_LOOP_FORM", statement, "Use while or for…of.");
		if (statement instanceof org.mozilla.javascript.ast.BreakStatement) reject("FLOWSCRIPT_V3_BREAK", statement, "Use a local tested by the while condition or find/filter.");
		if (statement instanceof org.mozilla.javascript.ast.ContinueStatement) {
			if (loopDepth == 0) reject("FLOWSCRIPT_V3_LOOP_FORM", statement, "Use continue only inside a loop.");
			output.add(node("next", map(), statement));
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.ThrowStatement thrown) {
			AstNode value = thrown.getExpression();
			if (value instanceof Name n) {
				// throw e, e the parameter of an enclosing catch (a const, never assigned): the caught error again, unchanged
				Binding caught = lookup(n.getIdentifier(), scope);
				if (caught == null || !caught.caught) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement,
					"Throw an object with a literal code (throw { code: \"LITERAL\", message }), or the parameter of the enclosing catch to raise the caught error again.");
				output.add(node("throw", map("error", caught.mapped), statement));
				return;
			}
			if (value instanceof org.mozilla.javascript.ast.NewExpression) reject("FLOWSCRIPT_V3_ERROR_CODE_CHOICE", statement, "throw { code: \"CHOOSE_ERROR_CODE\", message: ... }");
			if (!(value instanceof ObjectLiteral)) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Throw an object with a literal code.");
			// error is the property of the throw block that raises a caught error again: a field of that name would not be a
			// field of the thrown error
			for (var member : ((ObjectLiteral) value).getElements()) if (member instanceof ObjectProperty field && raw(field.getKey()).trim().matches("[\"']?error[\"']?"))
				reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Name that field otherwise (details: { error: … }); to raise a caught error again, write throw e in its catch.");
			var props = new LinkedHashMap<String, Object>();
			for (var member : ((ObjectLiteral) value).getElements()) { var field = property(member); props.put(key(field.getKey()), propertyValue("throw", key(field.getKey()), field.getValue(), scope)); }
			output.add(node("throw", props, statement));
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.TryStatement trial) {
			if (trial.getFinallyBlock() != null) reject("FLOWSCRIPT_V3_FINALLY", trial.getFinallyBlock(), "Write statements after the try.");
			if (trial.getCatchClauses().isEmpty()) reject("FLOWSCRIPT_V3_UNSUPPORTED", trial, "Use try/catch.");
			var clause = trial.getCatchClauses().get(0);
			AstNode parameter = clause.getVarName();
			if (parameter != null && !(parameter instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", parameter, "Name the caught error: catch (failure) { … failure.code … }.");
			var catchScope = new Scope(scope);
			String errorPath;
			if (parameter != null) {
				var caught = declare(((Name) parameter).getIdentifier(), "const", clause, catchScope, null);
				caught.caught = true;
				errorPath = caught.mapped;
			} else {
				// catch { … } declares no name: the error goes to local.error, or to a hidden local when the Flow has its own
				// error local, which the try must not overwrite
				errorPath = allNames.contains("error") || java.util.regex.Pattern.compile("\\blocal\\s*\\.\\s*error\\b").matcher(source).find() ? "local.__caught" + (++chain) : "local.error";
			}
			var node = control("try", map("error", errorPath), trial, "try", branch(trial.getTryBlock(), scope));
			node.put("catch", branch(clause.getBody(), catchScope));
			output.add(node);
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.SwitchStatement item) { switchStatement(item, scope, output); return; }
		if (statement instanceof org.mozilla.javascript.ast.LabeledStatement labelled) {
			AstNode item = labelled.getStatement();
			if (item instanceof org.mozilla.javascript.ast.WhileLoop || item instanceof org.mozilla.javascript.ast.ForLoop || item instanceof org.mozilla.javascript.ast.ForInLoop || item instanceof org.mozilla.javascript.ast.DoLoop)
				reject("FLOWSCRIPT_V3_LOOP_FORM", labelled, "Use an unlabelled loop.");
			if (labelled.getLabels().size() != 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", labelled, "Use one label.");
			int first = output.size();
			statement(item, scope, output);
			if (output.size() > first) output.get(first).put("id", labelled.getFirstLabel().getName());
			return;
		}
		// a FunctionNode is a Rhino Scope: refused before the blocks
		if (statement instanceof FunctionNode) reject("FLOWSCRIPT_V3_FUNCTION", statement, "Write a project block.");
		if (statement instanceof org.mozilla.javascript.ast.Block || statement instanceof org.mozilla.javascript.ast.Scope) { body(statement, new Scope(scope), output); return; }
		if (statement instanceof org.mozilla.javascript.ast.EmptyStatement) return;
		reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Use a supported FlowScript v3 statement (" + kind(statement) + ").");
	}

	@SuppressWarnings("unchecked")
	private void assignNames(Map<String, Object> definition) {
		var all = new ArrayList<Map<String, Object>>();
		collectNodes((List<Map<String, Object>>) definition.get("nodes"), all);
		for (var helper : (List<Map<String, Object>>) definition.get("helpers")) collectNodes((List<Map<String, Object>>) helper.get("nodes"), all);
		all.sort((a, b) -> Integer.compare(((Number) a.getOrDefault("__flowScriptLine", 0)).intValue(), ((Number) b.getOrDefault("__flowScriptLine", 0)).intValue()));
		var used = new HashSet<String>();
		var counts = new HashMap<String, Integer>();
		for (var node : all) if (node.containsKey("id")) used.add(String.valueOf(node.get("id")));
		for (var node : all) {
			var props = (Map<String, Object>) node.get("props");
			String path = node.get("block").equals("set") ? String.valueOf(props.get("path")) : String.valueOf(node.get("out"));
			String base = !path.equals("null") ? path.substring(path.lastIndexOf('.') + 1) : String.valueOf(node.get("block"));
			base = base.substring(base.lastIndexOf('.') + 1).replaceAll("[^A-Za-z0-9_$]", "_");
			int rank = counts.getOrDefault(base, 0);
			String candidate;
			do { rank++; candidate = base + (rank > 1 ? rank : ""); } while (used.contains(candidate) && !candidate.equals(node.get("id")));
			counts.put(base, rank);
			node.put("__flowImplicitId", candidate);
			node.putIfAbsent("id", candidate);
			used.add(String.valueOf(node.get("id")));
		}
	}
	@SuppressWarnings("unchecked")
	private void collectNodes(List<Map<String, Object>> nodes, List<Map<String, Object>> all) {
		for (var node : nodes) {
			all.add(node);
			for (var entry : node.entrySet()) if (!entry.getKey().equals("props") && entry.getValue() instanceof List<?> list &&
				!list.isEmpty() && list.get(0) instanceof Map<?, ?>) collectNodes((List<Map<String, Object>>) list, all);
		}
	}
}
