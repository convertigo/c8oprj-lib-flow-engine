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
	// Scope names a local may take: the reader writes every read of a local as local.<name>, so a local current, parent or
	// trace is never read as the scope. current stays refused where a list.* or flow.forEach call of the source reads it.
	private static final Set<String> LOCAL_SCOPE_NAMES = Set.of("current", "parent", "trace");
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
		Map.entry("FLOWSCRIPT_V3_OBJECT_CONDITION", "An object literal is not a Flow if or while condition"),
		Map.entry("FLOWSCRIPT_V3_PATTERN", "A regular expression literal is lowered to its text block only as a whole value or in an if condition"),
		Map.entry("FLOWSCRIPT_V3_CALL_RESULT", "A field of a block call result is read before the statement only as a whole value or where a value or an if condition always evaluates it"),
		Map.entry("FLOWSCRIPT_V3_COMPUTED_WRITE", "A value under a computed key is written only on a local object or map"),
		Map.entry("FLOWSCRIPT_V3_SPREAD", "An object spread or Object.assign({}, …) is lowered to object.merge only as the whole value of a declaration, an assignment, a return or a push")
	);
	private static final String COMPUTED_WRITE_HINT = "Write a computed key on a local object: const groups = {} (or json.map({ valueType })), then groups[key] = value, "
		+ "groups[key] += n or groups[key]++, and assign the object where it goes (result.groups = groups). A list item is replaced by building a new list.";
	private static final String COMPUTED_PUSH_HINT = "Replace the list under the key: groups[key] = groups[key].concat([value]), on a local object (const groups = {}).";
	private static final String SPREAD_HINT = "Build the object in its own statement, const merged = { ...a, k: v } (or Object.assign({}, a, { k: v })), lowered to object.merge, then use merged.";
	private static final String ASSIGN_HINT = "Object.assign changes its first argument: write const merged = { ...a, ...b } or Object.assign({}, a, b).";
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
	// the names of the local functions of the source (const f = (a, b) => e): a call of one is no block call
	private final Set<String> localFunctions = new HashSet<>();
	private final Set<String> typedLists = new HashSet<>();
	private final Set<String> typedMaps = new HashSet<>();
	private int chain;
	private AstRoot root;
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
			// Rhino 1.9.2 places a prefix unary expression at its operand: nested ones (!!x, - -x, typeof typeof x) share
			// one position, so the operator is looked for before the start of the operand, its own operator included
			if (!operator.isEmpty() && unary.getOperand() != null) at = Math.min(at, pos(unary.getOperand()));
			int cursor = at - 1;
			while (cursor >= 0 && Character.isWhitespace(source.charAt(cursor))) cursor--;
			if (!operator.isEmpty() && cursor + 1 >= operator.length() && source.substring(cursor + 1 - operator.length(), cursor + 1).equals(operator))
				return cursor + 1 - operator.length();
		}
		if (node instanceof org.mozilla.javascript.ast.InfixExpression infix) return Math.min(at, pos(infix.getLeft()));
		// … and a conditional expression at its test, whose prefix operator (typeof x === "string" ? …, !x ? …) starts it
		if (node instanceof ConditionalExpression conditional) return Math.min(at, pos(conditional.getTestExpression()));
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
	private static boolean readsFlowScopes(FunctionNode function) {
		if (function.getParams().size() != 1 || !(function.getParams().get(0) instanceof ObjectLiteral literal)) return false;
		for (var element : literal.getElements())
			if (element instanceof ObjectProperty field && field.getKey() instanceof Name name
					&& Set.of("input", "config", "result").contains(name.getIdentifier())) return true;
		return false;
	}
	private ObjectProperty property(AbstractObjectProperty node) {
		if (node instanceof ObjectProperty field) return field;
		// { ...a } outside the places where it is lowered (a pattern, the parameter of a helper, stays a destructuring)
		if (node instanceof org.mozilla.javascript.ast.SpreadObjectProperty && !(node.getParent() != null && node.getParent().getParent() instanceof FunctionNode))
			reject("FLOWSCRIPT_V3_SPREAD", node.getParent(), SPREAD_HINT);
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
		root = ast;
		// A function declared in a body is refused where it stands (statement), in the order of the source.
		visit(ast, part -> {
			if (part instanceof VariableDeclaration declaration) for (var variable : declaration.getVariables()) {
				if (variable.getTarget() instanceof Name n) allNames.add(n.getIdentifier());
				if (variable.getTarget() instanceof Name n && variable.getInitializer() != null && unparen(variable.getInitializer()) instanceof FunctionNode)
					localFunctions.add(n.getIdentifier());
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
		// the Flow function is the first one: a helper declared before it would take its place (L15F, 20/11)
		if (!readsFlowScopes(main)) for (FunctionNode helper : helperNodes)
			if (readsFlowScopes(helper)) reject("FLOWSCRIPT_V3_FUNCTION", main, "Put the Flow function " + helper.getName() + " first, then its helpers.");
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
		// a local function (const f = (a, b) => e): its expression, read in the scope of its declaration, replaces each call
		FunctionNode function;
		AstNode body;
		Scope declared;
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
	/** The first list.* or flow.forEach call of the source that reads current (its item), or null. */
	private FunctionCall itemCall() {
		final FunctionCall[] found = { null };
		visit(root, part -> {
			if (found[0] == null && part instanceof FunctionCall call && call.getClass() == FunctionCall.class) {
				String block = resolve(compact(raw(call.getTarget())));
				if ((block.equals("forEach") || block.startsWith("list.")) && raw(call).matches("(?s).*\\bcurrent\\b.*")) found[0] = call;
			}
			return found[0] == null;
		});
		return found[0];
	}
	/** A name imported by flow.import, named (const { a } = …) or as a namespace (const ns = …). */
	private boolean imported(String name) { return imports.containsKey(name) || imports.containsKey(name + ".*"); }
	private Binding declare(String name, String type, AstNode node, Scope scope, String mapped) {
		if (RESERVED.contains(name) && !LOCAL_SCOPE_NAMES.contains(name) || name.startsWith("__")) reject("FLOWSCRIPT_V3_RESERVED_NAME", node, "Choose another local name than " + name + ".");
		if (name.equals("current")) {
			FunctionCall item = itemCall();
			if (item != null) reject("FLOWSCRIPT_V3_RESERVED_NAME", node, "Choose another local name than current: current is the item of the " +
				resolve(compact(raw(item.getTarget()))) + " call at line " + line(pos(item)) + ".");
		}
		if (blockNamespaces.contains(name) && BLOCK_NAMESPACES.contains(name) && !imported(name)) reject("FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK", node, "Choose a name different from the block namespace " + name + ".");
		if (lookup(name, scope) != null || imported(name)) reject("FLOWSCRIPT_V3_SHADOWING", node, "Choose another local name than " + name + ".");
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
			// a call of a local function is its expression, each parameter replaced by its argument
			Binding called = part instanceof FunctionCall call && call.getClass() == FunctionCall.class && call.getTarget() instanceof Name callee ? lookup(callee.getIdentifier(), scope) : null;
			if (called != null && called.function != null) { edits.add(new Edit(pos(part), end(part), inlined(called, (FunctionCall) part, scope))); return false; }
			if (part instanceof ObjectLiteral object && spread(object)) reject("FLOWSCRIPT_V3_SPREAD", part, SPREAD_HINT);
			if (part instanceof FunctionCall call && compact(raw(call.getTarget())).equals("Object.assign"))
				reject(mergeable(call) ? "FLOWSCRIPT_V3_SPREAD" : "FLOWSCRIPT_V3_GLOBAL_CALL", part, mergeable(call) ? SPREAD_HINT : ASSIGN_HINT);
			if (part instanceof FunctionCall call && compact(raw(call.getTarget())).matches("(?:Object|JSON|Date)\\.[A-Za-z_$][\\w$]*"))
				reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Move the global call into its own assignment or return.");
			if (part != root && readCall(part, scope)) reject("FLOWSCRIPT_V3_CALL_RESULT", part, callResultHint((FunctionCall) part, false));
			if (part instanceof FunctionCall nested && part != root && LIST_STEPS.contains(method(nested)))
				reject("FLOWSCRIPT_V3_CHAIN", part, "Split the chain into two const declarations.");
			if (part instanceof FunctionNode) reject("FLOWSCRIPT_V3_FUNCTION", part, "Write the expression inline or use a project block.");
			if (part instanceof org.mozilla.javascript.ast.RegExpLiteral literal) reject("FLOWSCRIPT_V3_PATTERN", part, patternHint(literal));
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
				if (binding.function != null) reject("FLOWSCRIPT_V3_FUNCTION", part, "Call the local function " + n.getIdentifier() + "(…): it is inlined where it is called, never passed as a value.");
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
		if (expression instanceof org.mozilla.javascript.ast.TemplateLiteral template) return templateText(template, scope);
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
		if (expression instanceof FunctionCall call && isBlockCall(call) && !merge(call)) {
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
		// … and so is a former {{ expression }} in it: a quoted text is text, as in JavaScript; the proposal is the template
		// literal that interpolates it.
		if (kind.equals("template") && expression instanceof StringLiteral quoted && hasLegacyExpression(quoted.getValue())) {
			int line = line(pos(expression));
			defer("FLOWSCRIPT_QUOTED_TEMPLATE", line, block + "." + key + " at line " + line + " receives quoted text containing {{...}}; it is text, as in JavaScript, and will not interpolate.",
				"Write " + legacyTemplateProposal(quoted.getValue()) + " to interpolate, or write the text in a backtick literal to keep its {{ }}.");
		}
		if (!Set.of("template", "value", "binding").contains(kind) && expression instanceof StringLiteral fixed) return fixed.getValue();
		return value(expression, scope);
	}
	// A template literal as a value of the Flow template (template-syntax.js compose): its texts as JavaScript reads them
	// (escape sequences included), each kept as text by literalText, and its substitutions as ${…} expressions. The
	// checks of the whole template run first, as for any expression.
	private String templateText(org.mozilla.javascript.ast.TemplateLiteral template, Scope scope) {
		rewritten(template, scope);
		var out = new StringBuilder();
		var elements = template.getElements();
		for (int i = 0; i < elements.size(); i++) {
			AstNode element = elements.get(i);
			if (element instanceof org.mozilla.javascript.ast.TemplateCharacters characters) {
				String cooked = characters.getValue() != null ? characters.getValue() : characters.getRawValue();
				boolean beforeExpression = i + 1 < elements.size() && !(elements.get(i + 1) instanceof org.mozilla.javascript.ast.TemplateCharacters);
				out.append(literalText(cooked, beforeExpression));
			} else out.append("${").append(rewritten(element, scope).trim()).append("}");
		}
		return out.toString();
	}
	private static String literalText(String text) { return literalText(text, false); }
	// A text (a quoted string, or the text of a template literal) stays that text in the Flow template
	// (template-syntax.js literal): each ${ is escaped as \${, and each {{ the template would read as a former
	// {{ expression }} is written as the expression ${"{{"}, the backslashes before them doubled; before an expression,
	// the backslashes ending the text are doubled too. A {{ the template keeps as text ({{}}, a lone } before any }}, no
	// closing }} in a text that ends the value) is left as written; when the text is followed by an expression, a {{
	// whose closing is not found in the text is escaped, since the template would look for it in what follows.
	private static String literalText(String text, boolean beforeExpression) {
		var out = new StringBuilder();
		int i = 0;
		while (i < text.length()) {
			char c = text.charAt(i);
			if (c == '\\') {
				int run = 0;
				while (i + run < text.length() && text.charAt(i + run) == '\\') run++;
				boolean escaped = text.startsWith("${", i + run) || text.startsWith("{{", i + run) && legacyExpression(text, i + run, beforeExpression)
					|| beforeExpression && i + run == text.length();
				out.append("\\".repeat(escaped ? 2 * run : run));
				i += run;
			} else if (text.startsWith("${", i)) {
				out.append("\\${");
				i += 2;
			} else if (text.startsWith("{{", i) && legacyExpression(text, i, beforeExpression)) {
				out.append("${\"{{\"}");
				i += 2;
			} else {
				out.append(c);
				i++;
			}
		}
		return out.toString();
	}
	// Whether the template reads the {{ at index at of a text as a former {{ expression }} (template-syntax.js parts): a }}
	// closes it (legacyClosing) around something other than spaces; open: the text is followed by an expression, where the
	// template would go on looking for the closing }}.
	private static boolean legacyExpression(String text, int at, boolean open) {
		int end = legacyClosing(text, at);
		return end == -2 ? open : end >= 0 && !jsBlank(text.substring(at + 2, end));
	}
	// The index of the }} closing the {{ at index at outside its strings (template-syntax.js closingLegacy), -1 when a lone }
	// comes first, -2 when the text ends before.
	private static int legacyClosing(String text, int at) {
		char quote = 0;
		for (int i = at + 2; i < text.length() - 1; i++) {
			char c = text.charAt(i);
			if (quote != 0) {
				if (c == '\\') i++;
				else if (c == quote) quote = 0;
				continue;
			}
			if (c == '"' || c == '\'' || c == '`') quote = c;
			else if (c == '}') return text.charAt(i + 1) == '}' ? i : -1;
		}
		return -2;
	}
	// Only spaces for String.prototype.trim (white space and line terminators).
	private static boolean jsBlank(String text) {
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (!(c == '\t' || c == '\u000B' || c == '\f' || c == '\n' || c == '\r' || c == '\u2028' || c == '\u2029' || c == '\uFEFF'
				|| Character.getType(c) == Character.SPACE_SEPARATOR)) return false;
		}
		return true;
	}
	// The former {{ expression }} parts of a quoted text written as a template literal: the proposal of the refusal of a
	// quoted text in a template property.
	private static String legacyTemplateProposal(String text) {
		var out = new StringBuilder("`");
		int i = 0;
		while (i < text.length()) {
			if (text.startsWith("{{", i) && legacyExpression(text, i, false)) {
				int end = legacyClosing(text, i);
				out.append("${").append(text.substring(i + 2, end).trim()).append("}");
				i = end + 2;
				continue;
			}
			char c = text.charAt(i);
			if (c == '\\' || c == '`') out.append('\\').append(c);
			else if (c == '$' && i + 1 < text.length() && text.charAt(i + 1) == '{') out.append("\\$");
			else if (c == '\n') out.append("\\n");
			else if (c == '\r') out.append("\\r");
			else if (c == '\t') out.append("\\t");
			else out.append(c);
			i++;
		}
		return out.append('`').toString();
	}
	private static boolean hasLegacyExpression(String text) {
		for (int i = text.indexOf("{{"); i >= 0; i = text.indexOf("{{", i + 1)) if (legacyExpression(text, i, false)) return true;
		return false;
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
	// { ...a, k: v, ...b } and Object.assign({}, a, { k: v }): a shallow copy of each object in turn, as object.merge makes
	// it, one object.merge per part after the first into a hidden local (a lone part is merged with {}, a copy), each
	// part read in the order of the source. A spread of a value that is not an object (null, a list, a text) adds no field.
	private static boolean spread(ObjectLiteral object) {
		for (var member : object.getElements()) if (member instanceof org.mozilla.javascript.ast.SpreadObjectProperty) return true;
		return false;
	}
	private boolean merge(AstNode node) {
		AstNode bare = unparen(node);
		return bare instanceof ObjectLiteral object && spread(object) || bare instanceof FunctionCall call && call.getClass() == FunctionCall.class && compact(raw(call.getTarget())).equals("Object.assign");
	}
	/** Object.assign({}, …): a new object; any other first argument would be changed in place. */
	private static boolean mergeable(FunctionCall call) {
		var args = call.getArguments();
		if (args.isEmpty() || !(args.get(0) instanceof ObjectLiteral first) || !first.getElements().isEmpty()) return false;
		for (AstNode argument : args) if (argument instanceof org.mozilla.javascript.ast.Spread) return false;
		return true;
	}
	private Lowered mergeLowered(AstNode node, Scope scope) {
		var before = new ArrayList<Map<String, Object>>();
		var parts = new ArrayList<Object>();
		if (node instanceof FunctionCall call) {
			if (!mergeable(call)) reject("FLOWSCRIPT_V3_GLOBAL_CALL", call, ASSIGN_HINT);
			var args = call.getArguments();
			for (int i = 1; i < args.size(); i++) {
				AstNode argument = args.get(i);
				if (argument instanceof ObjectLiteral object && !spread(object)) parts.add(value(object, scope));
				else {
					var lowered = lower(argument, scope);
					before.addAll(lowered.before);
					parts.add(lowered.expression);
				}
			}
		} else {
			LinkedHashMap<String, Object> fields = null;
			for (var member : ((ObjectLiteral) node).getElements()) {
				if (member instanceof org.mozilla.javascript.ast.SpreadObjectProperty spread) {
					if (fields != null) { parts.add(fields); fields = null; }
					var lowered = lower(spread.getSpreadNode().getExpression(), scope);
					before.addAll(lowered.before);
					parts.add(lowered.expression);
				} else {
					var field = property(member);
					if (fields == null) fields = new LinkedHashMap<>();
					fields.put(key(field.getKey()), value(field.getValue(), scope));
				}
			}
			if (fields != null) parts.add(fields);
		}
		if (parts.isEmpty()) parts.add(map());
		if (parts.size() == 1) parts.add(map());
		Object target = parts.get(0);
		String path = "";
		for (int i = 1; i < parts.size(); i++) {
			path = "local.__chain" + (++chain);
			before.add(capture("object.merge", map("target", target, "source", parts.get(i)), path, node));
			target = path;
		}
		return new Lowered(before, path);
	}
	private Lowered lower(AstNode expression, Scope scope) {
		if (merge(expression)) return mergeLowered(unparen(expression), scope);
		if (expression instanceof PropertyGet property && property.getTarget() instanceof FunctionCall) {
			var receiver = lower(property.getTarget(), scope);
			return new Lowered(receiver.before, receiver.expression + "." + property.getProperty().getIdentifier());
		}
		if (!(expression instanceof FunctionCall call)) {
			var steps = lifted(expression, scope, false);
			return new Lowered(steps.before(), steps.expression());
		}
		var pattern = patternStep(call);
		if (pattern != null) return patternLowered(pattern, call, scope);
		if (readCall(call, scope)) {
			// flow.call({ … }).total: the call writes a hidden local, whose field the expression reads, as
			// const r = flow.call({ … }); const total = r.total
			String hidden = "local.__chain" + (++chain);
			return new Lowered(List.of(callNode(call, scope, hidden)), hidden);
		}
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
			(holdsBlockStep(conditional.getTrueExpression(), scope) || holdsBlockStep(conditional.getFalseExpression(), scope))) {
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
		if (rhs instanceof FunctionCall call && isBlockCall(call) && !merge(call)) { output.add(callNode(call, scope, target)); return; }
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
			(holdsBlockStep(conditional.getTrueExpression(), scope) || holdsBlockStep(conditional.getFalseExpression(), scope))) lower(value, scope);
		if (value instanceof FunctionCall call && !merge(call) && (!globalBlock(call).isEmpty() || isBlockCall(call))) {
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
	private Lifted liftedCondition(AstNode condition, Scope scope) { return lifted(condition, scope, true); }
	// … and so does each pattern step a value always evaluates (const invalid = !/^[0-9]+$/.test(v)).
	private Lifted lifted(AstNode condition, Scope scope, boolean blockSteps) {
		var before = new ArrayList<Map<String, Object>>();
		var replaced = new IdentityHashMap<AstNode, String>();
		visit(condition, part -> {
			// … and so does each block call whose result they read (if (entity.read({ … }).values.active))
			boolean read = readCall(part, scope);
			if (!read && !(blockSteps && blockStep(part)) && patternStep(part) == null) return true;
			for (AstNode child = part, parent = part.getParent(); child != condition && parent != null; child = parent, parent = parent.getParent()) {
				if (parent instanceof FunctionNode) return true;
				if (parent.getClass() == InfixExpression.class && Set.of("&&", "||", "??").contains(operator(parent)) && ((InfixExpression) parent).getRight() == child) return true;
				if (parent instanceof ConditionalExpression test && test.getTestExpression() != child) return true;
				if (parent.getClass() == FunctionCall.class && ((FunctionCall) parent).getTarget() != child) return true;
			}
			var lowered = lower(part, scope);
			before.addAll(lowered.before);
			// a global call or a read block call is its hidden local; a list method is the expression of its steps
			replaced.put(part, read || !globalBlock((FunctionCall) part).isEmpty() ? lowered.expression : "(" + lowered.expression + ")");
			return false;
		});
		return new Lifted(before, rewritten(condition, scope, replaced));
	}
	private boolean holdsBlockStep(AstNode value, Scope scope) {
		final boolean[] found = { false };
		visit(value, part -> {
			if (part instanceof FunctionCall call && (LIST_STEPS.contains(method(call)) ||
				compact(raw(call.getTarget())).matches("(?:Object|JSON)\\..*") || patternStep(call) != null || readCall(call, scope))) found[0] = true;
			if (part instanceof ObjectLiteral object && spread(object)) found[0] = true;
			return !found[0];
		});
		return found[0];
	}
	// A block call whose result the expression reads: flow.call({ … }).total, entity.read({ … }).values.active, a method of
	// its result. Not a global, a pattern step, a call with a slot, an expression function, nor a method of a local.
	private boolean readCall(AstNode part, Scope scope) {
		if (part == null || part.getClass() != FunctionCall.class) return false;
		var call = (FunctionCall) part;
		AstNode parent = call.getParent();
		boolean read = parent instanceof PropertyGet property && property.getTarget() == call ||
			parent instanceof org.mozilla.javascript.ast.ElementGet element && element.getTarget() == call;
		String target = compact(raw(call.getTarget()));
		if (!read || target.matches("(?:Object|JSON|Date|Math)\\..*") || patternStep(call) != null || slotted(call) || !isBlockCall(call)) return false;
		return lookup(target.split("\\.", 2)[0], scope) == null;
	}
	// The proposal for a block call whose result is read where it cannot run before the statement: the call in its own
	// statement, then the read of its local (const r = flow.call({ … }); const total = r.total). A while condition is
	// evaluated before every pass: the call runs before the loop and again at the end of its body.
	private String callResultHint(FunctionCall call, boolean everyPass) {
		AstNode read = call;
		while (true) {
			AstNode parent = read.getParent();
			if (parent instanceof org.mozilla.javascript.ast.ElementGet element && element.getTarget() == read) read = parent;
			else if (parent instanceof PropertyGet property && property.getTarget() == read &&
				!(property.getParent() instanceof FunctionCall method && method.getTarget() == property)) read = parent;
			else break;
		}
		String block = compact(raw(call.getTarget())), path = compact(source.substring(end(call), end(read))).replace("?.[", "[").replace("?.", ".");
		String field = read instanceof PropertyGet property ? property.getProperty().getIdentifier() : "value";
		if (everyPass) return "A while condition is evaluated before every pass: keep the result in a let, computed before the loop and again at the end of " +
			"the body (let r = " + block + "({ … }); while (… r" + path + " …) { …; r = " + block + "({ … }) }).";
		return "Call " + block + " in its own statement, then read its result from that local: const r = " + block + "({ … }); " +
			(path.isEmpty() ? "then r where the call was." : "const " + field + " = r" + path + ".");
	}
	// A pattern step, as the v2 reading of an assignment reads it: /p/f.test(s), s.match(/p/f), s.replace(/p/f, y),
	// s.replaceAll(/p/g, y) or s.split(/p/f), flags among g, i, m and s. It is the text block that does the same (text.match,
	// text.replace or text.split with regex: true), run before the statement in a hidden local; the literal is refused
	// anywhere else (FLOWSCRIPT_V3_PATTERN), with that block as the proposal.
	private record PatternStep(String method, AstNode text, AstNode replacement, String pattern, String flags) { }
	private PatternStep patternStep(AstNode part) {
		if (part == null || part.getClass() != FunctionCall.class || !(((FunctionCall) part).getTarget() instanceof PropertyGet property)) return null;
		var args = ((FunctionCall) part).getArguments();
		String method = property.getProperty().getIdentifier();
		org.mozilla.javascript.ast.RegExpLiteral literal;
		AstNode text, replacement = null;
		if (method.equals("test") && unparen(property.getTarget()) instanceof org.mozilla.javascript.ast.RegExpLiteral regex && args.size() == 1) {
			literal = regex;
			text = args.get(0);
		} else if (Set.of("match", "replace", "replaceAll", "split").contains(method) && !args.isEmpty() && args.get(0) instanceof org.mozilla.javascript.ast.RegExpLiteral regex) {
			literal = regex;
			text = property.getTarget();
			if (method.startsWith("replace")) {
				if (args.size() != 2 || args.get(1) instanceof FunctionNode) return null;
				replacement = args.get(1);
			} else if (args.size() != 1) return null;
		} else return null;
		String pattern = literal.getValue(), flags = literal.getFlags() == null ? "" : literal.getFlags();
		if (!flags.matches("(?!.*(.).*\\1)[gims]*") || pattern.contains("${") || pattern.contains("{{") || method.equals("replaceAll") && flags.indexOf('g') < 0) return null;
		return new PatternStep(method, text, replacement, pattern, flags);
	}
	private Lowered patternLowered(PatternStep step, FunctionCall call, Scope scope) {
		// the text of a method is read first, a chain before it (s.replace(/p/g, " ").trim().split(/q/))
		var before = new ArrayList<Map<String, Object>>();
		Object text;
		if (step.method.equals("test")) text = "${String(" + rewritten(step.text, scope) + ")}";
		else {
			var receiver = lower(step.text, scope);
			before.addAll(receiver.before);
			text = receiver.before.isEmpty() ? value(step.text, scope) : "${" + receiver.expression + "}";
		}
		String path = "local.__chain" + (++chain), plain = step.flags.replace("g", ""), block;
		var props = new LinkedHashMap<String, Object>();
		if (step.method.equals("test") || step.method.equals("match")) {
			block = "text.match";
			props.put("text", text);
			props.put("pattern", step.pattern);
			if (!step.flags.isEmpty()) props.put("flags", step.flags);
		} else if (step.method.equals("split")) {
			block = "text.split";
			props.put("text", text);
			props.put("separator", step.pattern);
			props.put("regex", true);
			props.put("trim", false);
			props.put("removeEmpty", false);
			if (!plain.isEmpty()) props.put("flags", plain);
		} else {
			block = "text.replace";
			props.put("text", text);
			props.put("search", step.pattern);
			props.put("replacement", value(step.replacement, scope));
			props.put("regex", true);
			if (step.flags.indexOf('g') < 0) props.put("all", false);
			if (!plain.isEmpty()) props.put("flags", plain);
		}
		String expression = step.method.equals("test") ? path + ".matched" : step.method.equals("match") ? "(" + path + ".matched ? " + path + ".groups : null)" : path;
		before.add(capture(block, props, path, call));
		return new Lowered(before, expression);
	}
	// The proposal of a refused regular expression literal: the block that does what its call does, written with the
	// operands of the source (the prototype bridge writes the same text).
	private String patternHint(org.mozilla.javascript.ast.RegExpLiteral literal) {
		String pattern = literal.getValue(), flags = literal.getFlags() == null ? "" : literal.getFlags();
		String method = "", operand = "value", replacement = "\"\"";
		AstNode parent = literal.getParent();
		if (parent instanceof PropertyGet property && property.getTarget() == literal && parent.getParent() instanceof FunctionCall call && call.getTarget() == parent) {
			method = property.getProperty().getIdentifier();
			if (!call.getArguments().isEmpty()) operand = spelled(call.getArguments().get(0));
		} else if (parent instanceof FunctionCall call && !call.getArguments().isEmpty() && call.getArguments().get(0) == literal && call.getTarget() instanceof PropertyGet property) {
			method = property.getProperty().getIdentifier();
			operand = spelled(property.getTarget());
			if (call.getArguments().size() > 1) replacement = spelled(call.getArguments().get(1));
		}
		var named = java.util.regex.Pattern.compile("([A-Za-z_$][\\w$]*)\\s*(?:\\(\\s*\\))?\\s*$").matcher(operand);
		String name = named.find() ? named.group(1) : "text", quoted = quoted(pattern), all = flags.replaceAll("[^gims]", ""), plain = all.replace("g", "");
		String example, block;
		if (method.equals("replace") || method.equals("replaceAll")) {
			block = "text.replace";
			example = "const " + name + "Replaced = text.replace({ text: " + operand + ", search: " + quoted + ", replacement: " + replacement + ", regex: true" +
				(all.indexOf('g') < 0 ? ", all: false" : "") + (plain.isEmpty() ? "" : ", flags: " + quoted(plain)) + " }), then read " + name + "Replaced";
		} else if (method.equals("split")) {
			block = "text.split";
			example = "const " + name + "Parts = text.split({ text: " + operand + ", separator: " + quoted + ", regex: true, trim: false, removeEmpty: false" +
				(plain.isEmpty() ? "" : ", flags: " + quoted(plain)) + " }), then read " + name + "Parts";
		} else {
			block = "text.match";
			example = "const " + name + "Match = text.match({ text: String(" + operand + "), pattern: " + quoted + (all.isEmpty() ? "" : ", flags: " + quoted(all)) +
				" }), then read " + name + "Match.matched where the " + (method.isEmpty() || method.equals("exec") ? "test" : method) + " was (" + name + "Match.groups holds " +
				(all.indexOf('g') < 0 ? "the whole match then the captured groups" : "every whole match") + ")";
		}
		return (flags.matches("(?!.*(.).*\\1)[gims]*") ? "" : "The flags of a pattern are g, i, m and s; " + quoted(flags) + " has others. ") +
			"Write the " + block + " block in its own statement, the pattern as a quoted text (backslashes doubled): " + example + ". " +
			"As the whole value of a declaration, an assignment or a return, or always evaluated in an if condition, /p/.test(s), s.match(/p/), " +
			"s.replace(/p/, y), s.replaceAll(/p/g, y) and s.split(/p/) are lowered to that block.";
	}
	private String spelled(AstNode node) { return raw(node).trim().replaceAll("\\s*[\\r\\n]+\\s*", " "); }
	private static String quoted(String text) { return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
	private boolean isBlockCall(FunctionCall call) {
		String target = resolve(compact(raw(call.getTarget())));
		if (target.equals("flow.default") || target.equals("default") || target.equals("String") || target.equals("Number") || target.startsWith("Math.")) return false;
		if (target.startsWith("input.") || target.startsWith("local.") || target.startsWith("result.") || target.startsWith("current.")) return false;
		if (localFunctions.contains(target)) return false;
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
	// const f = (a, b) => e, const f = function (a, b) { return e }: a local function whose body is one expression, without
	// block call. It writes no node: each call f(x, y) is that expression, a parameter replaced by its argument, read with the
	// names of the declaration (a local it reads is read when it is called, as JavaScript does). Its refusals are raised here.
	private void localFunction(String type, Name target, FunctionNode fn, Scope scope) {
		String name = target.getIdentifier();
		String hint = localFunctionHint(name, fn);
		if (!type.equals("const") || fn.isGenerator()) reject("FLOWSCRIPT_V3_FUNCTION", fn, hint);
		for (AstNode parameter : fn.getParams()) if (!(parameter instanceof Name)) reject("FLOWSCRIPT_V3_FUNCTION", fn, hint);
		AstNode body = fn.getBody(), expression = null;
		if (body instanceof org.mozilla.javascript.ast.Block || body instanceof org.mozilla.javascript.ast.Scope) {
			var parts = children(body);
			if (parts.size() == 1 && parts.get(0) instanceof org.mozilla.javascript.ast.ReturnStatement returned) expression = returned.getReturnValue();
		}
		if (expression == null) reject("FLOWSCRIPT_V3_FUNCTION", fn, hint);
		final AstNode value = expression;
		visit(value, part -> {
			if (part instanceof Name n && n.getIdentifier().equals(name) && !(part.getParent() instanceof PropertyGet property && property.getProperty() == part))
				reject("FLOWSCRIPT_V3_FUNCTION", part, "A local function does not call itself: write a loop.");
			if (part instanceof FunctionCall call && call.getClass() == FunctionCall.class && isBlockCall(call) && !compact(raw(call.getTarget())).matches("(?:Object|JSON|Date)\\..*"))
				reject("FLOWSCRIPT_V3_FUNCTION", part, "A local function computes one expression: call " + compact(raw(call.getTarget())) + " in its own statement, then pass its result.");
			return true;
		});
		// read once, each parameter standing for itself: a refusal of the expression is raised at its line
		var inner = new Scope(scope);
		for (AstNode parameter : fn.getParams()) declare(name(parameter), "const", parameter, inner, "(" + name(parameter) + ")");
		rewritten(value, inner);
		var binding = declare(name, "const", target, scope, null);
		binding.function = fn;
		binding.body = value;
		binding.declared = scope;
	}
	private String inlined(Binding function, FunctionCall call, Scope scope) {
		var inner = new Scope(function.declared);
		var params = function.function.getParams();
		var args = call.getArguments();
		for (AstNode argument : args) if (argument instanceof org.mozilla.javascript.ast.Spread)
			reject("FLOWSCRIPT_V3_FUNCTION", argument, "Pass each argument of a local function: f(a, b).");
		for (int i = 0; i < args.size(); i++) {
			String argument = rewritten(args.get(i), scope);
			if (i < params.size()) inner.names.put(name(params.get(i)), new Binding("const", "(" + argument + ")"));
		}
		for (int i = args.size(); i < params.size(); i++) inner.names.put(name(params.get(i)), new Binding("const", "undefined"));
		return "(" + rewritten(function.body, inner) + ")";
	}
	// The proposal for a function the reader does not inline: a const arrow whose body is one expression, or a top-level helper.
	private String localFunctionHint(String name, FunctionNode fn) {
		var names = new ArrayList<String>();
		for (AstNode parameter : fn.getParams()) names.add(parameter instanceof Name n ? n.getIdentifier() : "value");
		var passed = new ArrayList<String>();
		for (String parameter : names) passed.add(parameter + ": …");
		String call = name + "(" + (passed.isEmpty() ? "{}" : "{ " + String.join(", ", passed) + " }") + ")";
		return "Write a local function as a const arrow whose body is one expression, const " + name + " = (" + String.join(", ", names) + ") => …, " +
			"inlined where it is called; for statements, write a top-level helper after the Flow function, function " + name +
			"(" + (names.isEmpty() ? "{}" : "{ " + String.join(", ", names) + " }") + ") { … }, called " + call + " in its own statement " +
			"(const r = " + call + " for its value): a helper reads only its parameters.";
	}
	// xs.sort((a, b) => …) as a statement sorts the list xs in place: on a list the Flow builds (const xs = [] or json.array),
	// never assigned and never read whole before (an alias would see the order change in JavaScript), it is list.sort into
	// the local itself, the comparators of toSorted. Any other list.sort statement is refused with the toSorted to write.
	private Map<String, Object> sortInPlace(FunctionCall call, Name list, Scope scope, AstNode statement) {
		String name = list.getIdentifier();
		var args = call.getArguments();
		String comparator = args.size() == 1 ? spelled(args.get(0)) : "(a, b) => …";
		Binding binding = lookup(name, scope);
		if (binding == null || !binding.typedList || binding.function != null || sortAliased(name, statement))
			reject("FLOWSCRIPT_V3_LIST_METHOD", statement, name + ".sort(…) sorts " + name + " in place: write const sorted = " + name + ".toSorted(" + comparator + ") and read sorted. " +
				"In place, it is lowered only on a list the Flow builds (const " + name + " = [] or json.array), never assigned and never read whole before the sort.");
		if (args.size() != 1 || !(args.get(0) instanceof FunctionNode)) reject("FLOWSCRIPT_V3_LIST_METHOD", statement, "Use a two-parameter key comparator.");
		var fn = (FunctionNode) args.get(0);
		AstNode body = arrowBody(fn, 2, statement);
		String first = name(fn.getParams().get(0)), second = name(fn.getParams().get(1));
		if (first.isEmpty() || second.isEmpty()) reject("FLOWSCRIPT_V3_LIST_METHOD", statement, "Use two named callback parameters.");
		List<SortKey> keys = first.equals(second) ? null : comparatorKeys(body, first, second);
		if (keys == null) reject("FLOWSCRIPT_V3_LIST_METHOD", statement,
			"Compare one key of the two items with a.k - b.k, a.k.localeCompare(b.k) or a.k < b.k ? -1 : a.k > b.k ? 1 : 0 (b before a for descending), and join several keys with ||.");
		var props = map("items", binding.mapped);
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
		return capture("list.sort", props, binding.mapped, call);
	}
	// Whether the list name is assigned, or read whole (not xs.f, xs[i] or the list of a for…of) before the sort statement or
	// in a loop around it: that value may be shared with what reads it.
	private boolean sortAliased(String name, AstNode statement) {
		AstNode function = statement;
		while (function != null && !(function instanceof FunctionNode)) function = function.getParent();
		var loops = new ArrayList<AstNode>();
		for (AstNode at = statement.getParent(); at != null && at != function; at = at.getParent()) if (at instanceof org.mozilla.javascript.ast.Loop) loops.add(at);
		final boolean[] aliased = { false };
		visit(function == null ? root : function, part -> {
			if (aliased[0] || !(part instanceof Name n) || !n.getIdentifier().equals(name)) return !aliased[0];
			AstNode parent = part.getParent();
			if (parent instanceof PropertyGet property && (property.getProperty() == part || property.getTarget() == part)) return true;
			if (parent instanceof org.mozilla.javascript.ast.ElementGet element && element.getTarget() == part) return true;
			if (parent instanceof ObjectProperty field && field.getKey() == part && !raw(field).trim().equals(name)) return true;
			if (parent instanceof VariableInitializer variable && variable.getTarget() == part) return true;
			if (parent instanceof org.mozilla.javascript.ast.ForInLoop loop && loop.getIteratedObject() == part) return true;
			if (parent instanceof org.mozilla.javascript.ast.Assignment assignment && assignment.getLeft() == part) { aliased[0] = true; return false; }
			if (pos(part) < pos(statement)) aliased[0] = true;
			for (AstNode at = parent; at != null && !aliased[0]; at = at.getParent()) if (loops.contains(at)) aliased[0] = true;
			return !aliased[0];
		});
		return aliased[0];
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
				// a local function is inlined where it is called, a list arrow or an inner loop included
				if (enclosing instanceof FunctionNode fn && fn.getParent() instanceof VariableInitializer) { needed[0] = true; break; }
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
		// for (const key of Object.keys(o)), of a list method chain or of a pattern step that gives a list (s.split(/p/),
		// s.match(/p/g)): the list is computed once, before the loop, in a hidden local, as JavaScript evaluates the iterated
		// expression once.
		AstNode items = loop.getIteratedObject(), iterated = unparen(items);
		Object list;
		var pattern = patternStep(iterated);
		if (iterated != null && iterated.getClass() == FunctionCall.class && (blockStep(iterated) || method((FunctionCall) iterated).equals("concat") ||
			pattern != null && Set.of("split", "match").contains(pattern.method())) &&
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
	/** The path of the local object or map written by target[key]: a name declared with {} or json.map, or a local.* path made by json.map; null otherwise. */
	private String elementMap(org.mozilla.javascript.ast.ElementGet element, Scope scope) {
		if (element.getTarget() instanceof Name n) {
			Binding bound = lookup(n.getIdentifier(), scope);
			return bound != null && (bound.typedMap || typedMaps.contains(bound.mapped)) ? bound.mapped : null;
		}
		String path = compact(raw(element.getTarget()));
		return path.startsWith("local.") && typedMaps.contains(path) ? path : null;
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
				if (init != null && unparen(init) instanceof FunctionNode fn) { localFunction(type, (Name) target, fn, scope); continue; }
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
				// a local object literal (const groups = {}) is a map too: groups[key] = v is json.put, as on json.map
				boolean typedMap = init instanceof FunctionCall call && compact(raw(call.getTarget())).equals("json.map") || initial instanceof ObjectLiteral;
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
					// map[key] = v and map[key] += v on a local object or map are json.put; any other computed key is refused
					String mapPath = elementMap(element, scope);
					if (mapPath == null) reject("FLOWSCRIPT_V3_COMPUTED_WRITE", left, COMPUTED_WRITE_HINT);
					if (op.equals("=")) {
						if (merge(right)) {
							var merged = lower(right, scope);
							output.addAll(merged.before);
							output.add(node("json.put", map("path", mapPath, "key", value(element.getElement(), scope), "value", "${" + merged.expression + "}"), statement));
							return;
						}
						output.add(node("json.put", map("path", mapPath, "key", value(element.getElement(), scope), "value", value(right, scope)), statement));
						return;
					}
					if (!Set.of("+=", "-=", "*=", "/=").contains(op)) reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", statement, "Use a simple assignment.");
					output.add(node("json.put", map("path", mapPath, "key", value(element.getElement(), scope),
						"value", "${" + target + " " + op.charAt(0) + " (" + rewritten(right, scope) + ")}"), statement));
					return;
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
				if (operand instanceof org.mozilla.javascript.ast.ElementGet element) {
					// map[key]++ on a local object or map: json.put of the number plus one, as x++ on a local
					String mapPath = elementMap(element, scope);
					if (mapPath == null) reject("FLOWSCRIPT_V3_COMPUTED_WRITE", statement, COMPUTED_WRITE_HINT);
					String field = rewritten(operand, scope);
					output.add(node("json.put", map("path", mapPath, "key", value(element.getElement(), scope),
						"value", increment ? "${Number(" + field + ") + 1}" : "${" + field + " - 1}"), statement));
					return;
				}
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
					if (property.getTarget() instanceof org.mozilla.javascript.ast.ElementGet) reject("FLOWSCRIPT_V3_COMPUTED_WRITE", statement, COMPUTED_PUSH_HINT);
					String path = property.getTarget() instanceof Name n ? (lookup(n.getIdentifier(), scope) == null ? "" : lookup(n.getIdentifier(), scope).mapped) : compact(raw(property.getTarget()));
					if (!typedLists.contains(path)) {
						String list = spelled(property.getTarget());
						reject("FLOWSCRIPT_V3_UNTYPED_LIST", statement, "Initialize " + list + " with the type of its items: " + list + " = json.array({ itemType: { type: \"CHOOSE_TYPE\" } }), " +
							"or declare const " + list.substring(list.lastIndexOf('.') + 1) + " = [] when every value pushed into it has a certain type.");
					}
					if (call.getArguments().size() != 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Push one value per statement.");
					if (merge(call.getArguments().get(0))) {
						var merged = lower(call.getArguments().get(0), scope);
						output.addAll(merged.before);
						output.add(node("json.push", map("path", path, "value", "${" + merged.expression + "}"), statement));
						return;
					}
					output.add(node("json.push", map("path", path, "value", value(call.getArguments().get(0), scope)), statement));
					return;
				}
				if (method(call).equals("sort") && call.getTarget() instanceof PropertyGet sorted && sorted.getTarget() instanceof Name list) {
					output.add(sortInPlace(call, list, scope, statement));
					return;
				}
				if (compact(raw(call.getTarget())).equals("Object.assign")) reject("FLOWSCRIPT_V3_GLOBAL_CALL", statement, ASSIGN_HINT);
				if (call.getTarget() instanceof Name callee && lookup(callee.getIdentifier(), scope) != null && lookup(callee.getIdentifier(), scope).function != null)
					reject("FLOWSCRIPT_V3_FUNCTION", statement, "A local function gives a value and does nothing else: read it in an expression (const ok = " + callee.getIdentifier() + "(…)), " +
						"or write the statements in a top-level helper after the Flow function.");
				output.add(callNode(call, scope, null));
				return;
			}
			reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Use a Flow block call or an assignment.");
		}
		if (statement instanceof org.mozilla.javascript.ast.ReturnStatement returned) {
			if (loopDepth > 0) reject("FLOWSCRIPT_V3_RETURN_IN_LOOP", statement, "Use continue or return after the loop.");
			AstNode value = returned.getReturnValue();
			if (value instanceof ObjectLiteral object && !spread(object)) {
				if (resultStyle.equals("resultField")) reject("FLOWSCRIPT_V3_RESULT_MIXED", statement, "Use one result style.");
				resultStyle = "returnObject";
				for (var member : object.getElements()) {
					if (!(member instanceof ObjectProperty field) || !(field.getKey() instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", statement, "Write explicit result fields.");
					var field = (ObjectProperty) member;
					assign(output, "result." + ((Name) field.getKey()).getIdentifier(), field.getValue(), scope, statement);
				}
				output.add(node("return", map(), statement));
			} else if (value == null) output.add(node("return", map(), statement));
			else if (slotted(value) || value instanceof FunctionCall call && call.getClass() == FunctionCall.class && globalBlock(call).isEmpty() && isBlockCall(call) && !merge(call)) {
				// return flow.try({ … }), a call with a slot or a block call (return entity.read({ … })): its output goes to a
				// hidden local, returned, as const row = entity.read({ … }); return row
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
				if (readCall(part, scope)) reject("FLOWSCRIPT_V3_CALL_RESULT", part, callResultHint((FunctionCall) part, true));
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
		if (statement instanceof FunctionNode fn) reject("FLOWSCRIPT_V3_FUNCTION", statement, localFunctionHint(fn.getName(), fn));
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
