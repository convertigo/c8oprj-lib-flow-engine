package com.convertigo.libflowengine;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
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
import org.mozilla.javascript.ast.FunctionCall;
import org.mozilla.javascript.ast.FunctionNode;
import org.mozilla.javascript.ast.Name;
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
		Map.entry("FLOWSCRIPT_V3_UNTYPED_LIST", "An empty list must declare its item type before push"),
		Map.entry("FLOWSCRIPT_V3_GLOBAL_CALL", "This global call cannot be lowered in this expression or with these arguments"),
		Map.entry("FLOWSCRIPT_V3_ERROR_CODE_CHOICE", "throw new Error lacks the literal public error code required by Flow"),
		Map.entry("FLOWSCRIPT_V3_UNSUPPORTED", "This JavaScript construct is outside the FlowScript v3 subset"),
		Map.entry("FLOWSCRIPT_V3_OBJECT_CONDITION", "An object literal is not a Flow if or while condition"),
		Map.entry("FLOWSCRIPT_V3_PROTOTYPE_RETHROW", "Rethrowing a caught value has no faithful prototype lowering")
	);

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

	private void reject(String code, AstNode node, String hint) { rejectAt(code, node == null ? 0 : pos(node), hint); }
	private void rejectAt(String code, int at, String hint) {
		int line = line(at);
		String message = RULES.getOrDefault(code, "This FlowScript v3 construct cannot be lowered faithfully") +
			" (" + code + " at line " + line + ").";
		throw new Refusal(map("severity", "error", "code", code, "line", line, "message", message, "hint", hint));
	}

	private int line(int at) {
		int index = Arrays.binarySearch(lineStarts, Math.max(0, Math.min(source.length(), at)));
		return index >= 0 ? index + 1 : -index - 1;
	}
	private int pos(AstNode node) {
		int at = Math.max(0, node.getAbsolutePosition());
		if (node instanceof org.mozilla.javascript.ast.UnaryExpression unary) {
			String operator = org.mozilla.javascript.ast.AstNode.operatorToString(unary.getOperator());
			int cursor = at - 1;
			while (cursor >= 0 && Character.isWhitespace(source.charAt(cursor))) cursor--;
			if (cursor + 1 >= operator.length() && source.substring(cursor + 1 - operator.length(), cursor + 1).equals(operator))
				return cursor + 1 - operator.length();
		}
		if (node instanceof org.mozilla.javascript.ast.InfixExpression infix) return Math.min(at, pos(infix.getLeft()));
		return at;
	}
	private int end(AstNode node) {
		int finish = Math.min(source.length(), Math.max(0, node.getAbsolutePosition()) + node.getLength());
		if (node instanceof org.mozilla.javascript.ast.InfixExpression infix) {
			int right = end(infix.getRight());
			if (finish > right && source.substring(right, finish).matches("[\\s)\\]}]+")) return right;
		}
		if (node instanceof org.mozilla.javascript.ast.KeywordLiteral) {
			String keyword = node.toSource().trim();
			if (source.startsWith(keyword, pos(node))) return pos(node) + keyword.length();
		}
		return finish;
	}
	private String raw(AstNode node) { return source.substring(pos(node), end(node)); }
	private static String kind(AstNode node) { return node == null ? "" : node.getClass().getSimpleName(); }
	private static String name(AstNode node) { return node instanceof Name n ? n.getIdentifier() : ""; }
	private ObjectProperty property(AbstractObjectProperty node) {
		if (node instanceof ObjectProperty field) return field;
		reject("FLOWSCRIPT_V3_DESTRUCTURING", node, "Use one-level object fields.");
		throw new AssertionError();
	}
	private List<AstNode> children(AstNode node) {
		var result = new ArrayList<AstNode>();
		for (var part = node.getFirstChild(); part != null; part = part.getNext()) result.add((AstNode) part);
		return result;
	}

	private static String preparedForOf(String text) {
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
			if (text.startsWith("for", i) && (i == 0 || !Character.isJavaIdentifierPart(text.charAt(i - 1))) &&
				(i + 3 == text.length() || !Character.isJavaIdentifierPart(text.charAt(i + 3)))) {
				int j = i + 3;
				while (j < text.length() && Character.isWhitespace(text.charAt(j))) j++;
				if (j < text.length() && text.charAt(j) == '(') {
					j++;
					while (j < text.length() && Character.isWhitespace(text.charAt(j))) j++;
					if (text.startsWith("const", j) && (j + 5 == text.length() || !Character.isJavaIdentifierPart(text.charAt(j + 5)))) {
						int close = text.indexOf(')', j + 5), of = text.indexOf(" of", j + 5);
						if (of >= 0 && (close < 0 || of < close)) { out[j] = 'l'; out[j + 1] = 'e'; out[j + 2] = 't'; out[j + 3] = ' '; out[j + 4] = ' '; }
					}
				}
			}
			i++;
		}
		return new String(out);
	}

	private Map<String, Object> parse() {
		AstRoot ast;
		try {
			var options = new CompilerEnvirons();
			options.setLanguageVersion(200);
			options.setRecoverFromErrors(false);
			ast = new Parser(options).parse(preparedForOf(source), "flowscript-v3", 1);
		} catch (Exception e) {
			int number = e instanceof org.mozilla.javascript.EvaluatorException x ? x.lineNumber() : 1;
			int at = lineStarts[Math.max(0, Math.min(lineStarts.length - 1, number - 1))];
			String text = source.substring(at, source.indexOf('\n', at) < 0 ? source.length() : source.indexOf('\n', at));
			boolean importSyntax = text.matches("\\s*import\\b.*"), loopSyntax = text.matches(".*\\bfor\\s*\\([^)]*\\bin\\b.*");
			rejectAt(importSyntax ? "FLOWSCRIPT_V3_IMPORT_SYNTAX" : loopSyntax ? "FLOWSCRIPT_V3_LOOP_FORM" : "FLOWSCRIPT_V3_UNSUPPORTED", at,
				importSyntax ? "Use const { name } = flow.import(\"module\")." : loopSyntax ? "Use for (const key of Object.keys(o))." : "Use a JavaScript form from the FlowScript v3 grammar.");
			throw new AssertionError();
		}
		ast.visit(part -> {
			if (part instanceof FunctionNode fn && fn.getFunctionType() == FunctionNode.FUNCTION_STATEMENT && !(part.getParent() instanceof AstRoot))
				reject("FLOWSCRIPT_V3_FUNCTION", part, "Declare helpers after the Flow function.");
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
				if (!(init instanceof FunctionCall)) reject("FLOWSCRIPT_V3_IMPORT_SYNTAX", statement, "Use const { name } = flow.import(\"module\").");
				var call = (FunctionCall) init;
				if (!compact(raw(call.getTarget())).equals("flow.import") || call.getArguments().size() != 1 ||
					!(call.getArguments().get(0) instanceof StringLiteral)) reject("FLOWSCRIPT_V3_IMPORT_SYNTAX", statement, "Use const { name } = flow.import(\"module\").");
				var module = (StringLiteral) call.getArguments().get(0);
				String moduleName = module.getValue();
				if (target instanceof Name n) { if (RESERVED.contains(n.getIdentifier())) reject("FLOWSCRIPT_V3_RESERVED_NAME", target, "Choose another import alias."); imports.put(n.getIdentifier() + ".*", moduleName); }
				else if (target instanceof ObjectLiteral object) for (var member : object.getElements()) {
					var field = property(member);
					if (!(field.getKey() instanceof Name) || !(field.getValue() instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", field, "Use one-level named imports.");
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
		Binding(String type, String mapped) { this.type = type; this.mapped = mapped; }
	}
	private static final class Scope {
		final Scope parent;
		final Map<String, Binding> names = new HashMap<>();
		Scope(Scope parent) { this.parent = parent; }
	}
	private int loopDepth, countedDepth;
	private Binding lookup(String name, Scope scope) {
		for (Scope current = scope; current != null; current = current.parent) if (current.names.containsKey(name)) return current.names.get(name);
		return null;
	}
	private Binding declare(String name, String type, AstNode node, Scope scope, String mapped) {
		if (RESERVED.contains(name) || name.startsWith("__")) reject("FLOWSCRIPT_V3_RESERVED_NAME", node, "Choose another local name.");
		if (blockNamespaces.contains(name) && BLOCK_NAMESPACES.contains(name) && !imports.containsKey(name)) reject("FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK", node, "Choose a name different from the block namespace.");
		if (lookup(name, scope) != null || imports.containsKey(name)) reject("FLOWSCRIPT_V3_SHADOWING", node, "Choose another local name.");
		var binding = new Binding(type, mapped == null ? "local." + name : mapped);
		scope.names.put(name, binding);
		allNames.add(name);
		return binding;
	}

	private record Edit(int start, int end, String value) { }
	private String rewritten(AstNode root, Scope scope) {
		if (root == null) return "";
		int start = pos(root), end = end(root);
		var edits = new ArrayList<Edit>();
		root.visit(part -> {
			if (part instanceof FunctionCall nested && part != root && Set.of("filter", "map", "find", "some", "every", "toSorted", "sort").contains(method(nested)))
				reject("FLOWSCRIPT_V3_CHAIN", part, "Split the chain into two const declarations.");
			if (part instanceof FunctionNode) reject("FLOWSCRIPT_V3_FUNCTION", part, "Write the expression inline or use a project block.");
			if (part instanceof FunctionCall call && compact(raw(call.getTarget())).matches("^(Object|JSON|Date)\\..*"))
				reject("FLOWSCRIPT_V3_GLOBAL_CALL", part, "Move the global call into its own assignment or return.");
			if (part instanceof org.mozilla.javascript.ast.Assignment && part != root || part instanceof org.mozilla.javascript.ast.UpdateExpression)
				reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", part, "Move the assignment to its own statement.");
			if (part instanceof org.mozilla.javascript.ast.NewExpression || raw(part).equals("this")) reject("FLOWSCRIPT_V3_UNSUPPORTED", part, "Use Flow blocks.");
			if (part instanceof Name n) {
				var parent = part.getParent();
				if (parent instanceof PropertyGet property && property.getProperty() == part) return true;
				if (parent instanceof ObjectProperty field && field.getKey() == part && !raw(field).trim().equals(n.getIdentifier())) return true;
				var binding = lookup(n.getIdentifier(), scope);
				if (binding == null) { if (allNames.contains(n.getIdentifier()) && !imports.containsKey(n.getIdentifier())) reject("FLOWSCRIPT_V3_OUT_OF_SCOPE", part, "Declare the name in the enclosing block."); return true; }
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
		return result;
	}

	private Map<String, Object> node(String block, Map<String, Object> props, AstNode at) {
		return map("block", block, "props", props, "__flowScriptLine", line(pos(at)));
	}
	private void set(List<Map<String, Object>> output, String path, AstNode value, Scope scope, AstNode at) {
		output.add(node("set", map("path", path, "value", value(value, scope)), at));
	}
	private Object value(AstNode expression, Scope scope) {
		if (expression instanceof StringLiteral string) return string.getValue();
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
		return value(expression, scope);
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
			if (name.equals("map")) props = map("items", listSource(receiver, scope, prefix), "select", body instanceof ObjectLiteral ? value(body, inner) : predicate);
			else props = map("items", listSource(receiver, scope, prefix), "where", name.equals("every") ? "!(" + predicate + ")" : predicate);
			before.add(capture(name.equals("map") ? "list.map" : "list.filter", props, path, call));
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
			boolean locale = body instanceof FunctionCall localeCall && method(localeCall).equals("localeCompare");
			AstNode left, right;
			if (locale) {
				var localeCall = (FunctionCall) body;
				if (localeCall.getArguments().size() != 1) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Compare the same item key with subtraction or localeCompare.");
				left = ((PropertyGet) localeCall.getTarget()).getTarget(); right = localeCall.getArguments().get(0);
				if (left instanceof FunctionCall wrapper && compact(raw(wrapper.getTarget())).equals("String") && wrapper.getArguments().size() == 1) left = wrapper.getArguments().get(0);
				if (right instanceof FunctionCall wrapper && compact(raw(wrapper.getTarget())).equals("String") && wrapper.getArguments().size() == 1) right = wrapper.getArguments().get(0);
			} else if (body instanceof org.mozilla.javascript.ast.InfixExpression infix && org.mozilla.javascript.ast.AstNode.operatorToString(infix.getOperator()).equals("-")) {
				left = infix.getLeft(); right = infix.getRight();
			} else { reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Compare the same item key with subtraction or localeCompare."); throw new AssertionError(); }
			boolean identity = left instanceof Name && right instanceof Name;
			boolean keyed = left instanceof PropertyGet l && right instanceof PropertyGet r && l.getTarget() instanceof Name && r.getTarget() instanceof Name && l.getProperty().getIdentifier().equals(r.getProperty().getIdentifier());
			if (!identity && !keyed) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Compare the same item or item key.");
			String leftName = identity ? name(left) : name(((PropertyGet) left).getTarget());
			String rightName = identity ? name(right) : name(((PropertyGet) right).getTarget());
			String direction = leftName.equals(first) && rightName.equals(second) ? "asc" : leftName.equals(second) && rightName.equals(first) ? "desc" : "";
			if (direction.isEmpty()) reject("FLOWSCRIPT_V3_LIST_METHOD", call, "Compare the two callback parameters.");
			var prefix = lower(receiver, scope);
			String path = "local.__chain" + (++chain);
			var before = new ArrayList<Map<String, Object>>(prefix.before);
			var props = map("items", listSource(receiver, scope, prefix));
			if (keyed) props.put("by", "current." + ((PropertyGet) left).getProperty().getIdentifier());
			props.put("compare", locale ? "locale" : "number"); props.put("direction", direction);
			before.add(capture("list.sort", props, path, call));
			return new Lowered(before, path);
		}
		if (receiver instanceof Name n && n.getIdentifier().equals("flow") && name.equals("default")) return new Lowered(List.of(), rewritten(call, scope));
		if (receiver != null) {
			var prefix = lower(receiver, scope);
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
	private Map<String, Object> callNode(FunctionCall call, Scope scope, String destination) {
		String block = resolve(compact(raw(call.getTarget())));
		if (call.getArguments().size() != 1 || !(call.getArguments().get(0) instanceof ObjectLiteral))
			reject("FLOWSCRIPT_V3_UNSUPPORTED", call, "Call Flow blocks with one object argument.");
		var object = (ObjectLiteral) call.getArguments().get(0);
		var props = new LinkedHashMap<String, Object>();
		var result = node(block, props, call);
		for (var member : object.getElements()) {
			var field = property(member);
			String key = key(field.getKey());
			AstNode expression = field.getValue();
			if (key.startsWith("$$")) {
				String attribute = key.substring(2);
				if (expression instanceof FunctionNode fn) {
					var slot = new ArrayList<Map<String, Object>>();
					body(fn.getBody(), new Scope(scope), slot);
					result.put(attribute, slot);
				} else result.put(attribute, literal(expression));
			} else props.put(key, propertyValue(block, key, expression, scope));
		}
		if (destination != null) {
			if (block.equals("set")) props.putIfAbsent("path", destination);
			if ((block.equals("json.array") || block.equals("json.map")) && !props.containsKey("path")) props.put("path", destination);
			if (!block.equals("set")) result.put("out", destination);
		}
		return result;
	}

	private void assign(List<Map<String, Object>> output, String target, AstNode rhs, Scope scope, AstNode at) {
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
	private boolean isBlockCall(FunctionCall call) {
		String target = resolve(compact(raw(call.getTarget())));
		if (target.equals("flow.default") || target.equals("default") || target.equals("String") || target.equals("Number") || target.startsWith("Math.")) return false;
		if (target.startsWith("input.") || target.startsWith("local.") || target.startsWith("result.") || target.startsWith("current.")) return false;
		return call.getArguments().size() == 1 && call.getArguments().get(0) instanceof ObjectLiteral;
	}

	private void body(AstNode body, Scope scope, List<Map<String, Object>> output) {
		if (body instanceof org.mozilla.javascript.ast.Block || body instanceof org.mozilla.javascript.ast.Scope) {
			int cursor = pos(body) + 1;
			for (AstNode item : children(body)) {
				String comment = trivia(cursor, pos(item), output);
				int first = output.size();
				statement(item, scope, output);
				if (comment != null && output.size() > first) {
					output.get(first).put("comment", comment);
					if (comment.matches("(?s).*@disabled\\b.*")) {
						if (output.size() != first + 1) reject("FLOWSCRIPT_V3_UNSUPPORTED", item, "Put $$disabled: true on each block generated by this statement.");
						output.get(first).put("disabled", true);
					}
				}
				cursor = end(item);
			}
			trivia(cursor, Math.max(cursor, end(body) - 1), output);
		} else statement(body, scope, output);
	}
	private String trivia(int from, int to, List<Map<String, Object>> output) {
		if (to <= from) return null;
		String gap = source.substring(Math.max(0, from), Math.min(source.length(), to));
		var matcher = java.util.regex.Pattern.compile("//[^\\r\\n]*|/\\*[\\s\\S]*?\\*/").matcher(gap);
		var comments = new ArrayList<String>();
		int end = -1;
		while (matcher.find()) {
			String text = matcher.group();
			if (text.startsWith("//")) comments.add(text.substring(2).trim());
			else for (String line : text.substring(2, text.length() - 2).split("\\r?\\n")) comments.add(line.replaceFirst("^\\s*\\* ?", "").trim());
			end = matcher.end();
		}
		if (comments.isEmpty()) return null;
		String comment = String.join("\n", comments);
		if (gap.substring(end).matches("(?s).*(?:\\r?\\n)\\s*(?:\\r?\\n).*")) {
			output.add(map("block", "comment", "props", map(), "__flowScriptLine", line(from)));
			output.get(output.size() - 1).put("comment", comment);
			return null;
		}
		return comment;
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
		loop.getBody().visit(part -> {
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
		if (!(iterator instanceof VariableDeclaration declaration) || declaration.getVariables().size() != 1)
			reject("FLOWSCRIPT_V3_DESTRUCTURING", loop, "Use a single loop variable or a one-level object pattern.");
		var decl = ((VariableDeclaration) iterator).getVariables().get(0);
		if (!source.substring(pos(iterator), pos(decl.getTarget())).trim().equals("const")) reject("FLOWSCRIPT_V3_LOOP_FORM", loop, "Use for (const item of items).");
		AstNode target = decl.getTarget();
		var body = new ArrayList<Map<String, Object>>();
		var inner = new Scope(scope);
		if (target instanceof Name item) {
			var binding = declare(item.getIdentifier(), "const", item, inner, "current");
			if (needsOuterItemCopy(loop, item.getIdentifier())) {
				binding.mapped = "local." + item.getIdentifier();
				body.add(node("set", map("path", binding.mapped, "value", "${current}"), loop));
			}
		} else if (target instanceof ObjectLiteral object) {
			for (var member : object.getElements()) {
				var field = property(member);
				if (!(field.getKey() instanceof Name) || !(field.getValue() instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", loop, "Use one-level fields without defaults or rest.");
				var key = (Name) field.getKey(); var alias = (Name) field.getValue();
				var binding = declare(alias.getIdentifier(), "const", field, inner, null);
				body.add(node("set", map("path", binding.mapped, "value", "${current." + key.getIdentifier() + "}"), loop));
			}
		} else reject("FLOWSCRIPT_V3_DESTRUCTURING", loop, "Use a single loop variable or a one-level object pattern.");
		inBody(loop.getBody(), inner, body);
		AstNode items = loop.getIteratedObject();
		output.add(control("forEach", map("items", items instanceof org.mozilla.javascript.ast.ArrayLiteral ? value(items, scope) : expression(items, scope)), loop, "nodes", body));
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
		loop.getBody().visit(part -> {
			AstNode target = part instanceof org.mozilla.javascript.ast.Assignment assignment ? assignment.getLeft() :
				part instanceof org.mozilla.javascript.ast.UpdateExpression updatePart ? updatePart.getOperand() : null;
			if (target != null && (name(target).equals(counter) || target instanceof PropertyGet property && name(property.getTarget()).equals("local") && name(property.getProperty()).equals(counter)))
				reject("FLOWSCRIPT_V3_FOR_FORM", part, "Do not assign the counted loop variable in its body.");
			return true;
		});
		var inner = new Scope(scope);
		var binding = declare(counter, "let", variable.getTarget(), inner, null);
		set(output, binding.mapped, variable.getInitializer(), scope, loop);
		var body = new ArrayList<Map<String, Object>>();
		loopDepth++; countedDepth++;
		body(loop.getBody(), inner, body);
		countedDepth--; loopDepth--;
		body.add(node("set", map("path", binding.mapped, "value", "${" + binding.mapped + " + 1}"), increment));
		output.add(control("while", map("condition", expression(condition, inner), "maxIterations", 1000000, "timeoutMs", 60000), loop, "nodes", body));
	}
	private void switchStatement(org.mozilla.javascript.ast.SwitchStatement statement, Scope scope, List<Map<String, Object>> output) {
		String path = "local.__chain" + (++chain);
		assign(output, path, statement.getExpression(), scope, statement);
		List<Map<String, Object>> current = output;
		var cases = statement.getCases();
		for (int i = 0; i < cases.size(); i++) {
			var item = cases.get(i);
			var members = item.getStatements();
			AstNode last = members == null || members.isEmpty() ? null : members.get(members.size() - 1);
			if (last == null || !(last instanceof org.mozilla.javascript.ast.BreakStatement || last instanceof org.mozilla.javascript.ast.ReturnStatement || last instanceof org.mozilla.javascript.ast.ThrowStatement) ||
				item.isDefault() && i != cases.size() - 1 || item.getExpression() != null && !Set.of("StringLiteral", "NumberLiteral", "KeywordLiteral").contains(kind(item.getExpression())))
				reject("FLOWSCRIPT_V3_SWITCH_FALLTHROUGH", item, "Use literal cases ending with break, return or throw; put default last.");
			if (!item.isDefault()) {
				var branch = new ArrayList<Map<String, Object>>();
				var conditional = control("if", map("condition", path + " === " + expression(item.getExpression(), scope)), item, "then", branch);
				current.add(conditional);
				var otherwise = new ArrayList<Map<String, Object>>();
				conditional.put("else", otherwise);
				current = otherwise;
				for (int j = 0; j < members.size(); j++) if (j != members.size() - 1 || !(members.get(j) instanceof org.mozilla.javascript.ast.BreakStatement))
					statement(members.get(j), new Scope(scope), branch);
			} else {
				for (int j = 0; j < members.size(); j++) if (j != members.size() - 1 || !(members.get(j) instanceof org.mozilla.javascript.ast.BreakStatement))
					statement(members.get(j), new Scope(scope), current);
			}
		}
	}
	private void statement(AstNode statement, Scope scope, List<Map<String, Object>> output) {
		if (statement instanceof VariableDeclaration declaration) {
			for (VariableInitializer variable : declaration.getVariables()) {
				AstNode target = variable.getTarget(), init = variable.getInitializer();
				String type = source.substring(pos(declaration), pos(target)).trim().split("\\s+", 2)[0];
				if (!type.equals("const") && !type.equals("let")) reject("FLOWSCRIPT_V3_UNSUPPORTED", declaration, "Use const or let for Flow locals.");
				if (target instanceof Name n) {
					var binding = declare(n.getIdentifier(), type, target, scope, null);
					binding.typedList = init instanceof FunctionCall call && compact(raw(call.getTarget())).equals("json.array");
					binding.typedMap = init instanceof FunctionCall call && compact(raw(call.getTarget())).equals("json.map");
					if (binding.typedList) typedLists.add(binding.mapped);
					if (binding.typedMap) typedMaps.add(binding.mapped);
					if (init != null) assign(output, binding.mapped, init, scope, declaration);
					else output.add(node("set", map("path", binding.mapped, "value", "${undefined}"), declaration));
				} else if (target instanceof ObjectLiteral object) {
					if (init == null) reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Initialize the object before destructuring.");
					String path = "local.__chain" + (++chain);
					assign(output, path, init, scope, declaration);
					for (var member : object.getElements()) {
						var field = property(member);
						if (!(field.getKey() instanceof Name) || !(field.getValue() instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Use one-level fields without defaults or rest.");
						var key = (Name) field.getKey(); var alias = (Name) field.getValue();
						var binding = declare(alias.getIdentifier(), type, field, scope, null);
						output.add(node("set", map("path", binding.mapped, "value", "${" + path + "." + key.getIdentifier() + "}"), declaration));
					}
				} else reject("FLOWSCRIPT_V3_DESTRUCTURING", target, "Declare each field separately.");
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
				if (target.startsWith("result.")) { if (resultStyle.equals("returnObject")) reject("FLOWSCRIPT_V3_RESULT_MIXED", statement, "Use one result style."); resultStyle = "resultField"; }
				String op = org.mozilla.javascript.ast.AstNode.operatorToString(assignment.getOperator());
				if (left instanceof org.mozilla.javascript.ast.ElementGet element) {
					String mapPath = element.getTarget() instanceof Name n ? (lookup(n.getIdentifier(), scope) == null ? "" : lookup(n.getIdentifier(), scope).mapped) : compact(raw(element.getTarget()));
					if (typedMaps.contains(mapPath) && op.equals("=")) {
						output.add(node("json.put", map("path", mapPath, "key", value(element.getElement(), scope), "value", value(right, scope)), statement));
						return;
					}
				}
				if (op.equals("=")) assign(output, target, right, scope, statement);
				else if (Set.of("+=", "-=", "*=", "/=").contains(op)) output.add(node("set", map("path", target, "value", "${" + target + " " + op.charAt(0) + " (" + rewritten(right, scope) + ")}"), statement));
				else reject("FLOWSCRIPT_V3_COMPOUND_CONTEXT", statement, "Use a simple assignment.");
				return;
			}
			if (expression instanceof org.mozilla.javascript.ast.UpdateExpression update) {
				String name = name(update.getOperand());
				Binding binding = lookup(name, scope);
				if (binding == null) reject("FLOWSCRIPT_V3_OUT_OF_SCOPE", statement, "Declare the local first.");
				if (binding.type.equals("const")) reject("FLOWSCRIPT_V3_CONST_ASSIGN", statement, "Declare the variable with let.");
				output.add(node("set", map("path", binding.mapped, "value", "${" + binding.mapped + (raw(expression).contains("++") ? " + 1" : " - 1") + "}"), statement));
				return;
			}
			if (expression instanceof FunctionCall call) {
				if (call.getTarget() instanceof PropertyGet property && property.getProperty().getIdentifier().equals("push")) {
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
					var field = property(member);
					if (!(field.getKey() instanceof Name)) reject("FLOWSCRIPT_V3_DESTRUCTURING", statement, "Write explicit result fields.");
					var key = (Name) field.getKey();
					assign(output, "result." + key.getIdentifier(), field.getValue(), scope, statement);
				}
				output.add(node("return", map(), statement));
			} else if (value == null) output.add(node("return", map(), statement));
			else {
				var lowered = lower(value, scope);
				output.addAll(lowered.before);
				output.add(node("return", map("value", lowered.before.isEmpty() ? value(value, scope) : "${" + lowered.expression + "}"), statement));
			}
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.IfStatement conditional) {
			if (conditional.getCondition() instanceof ObjectLiteral) reject("FLOWSCRIPT_V3_OBJECT_CONDITION", conditional.getCondition(), "Use flow.if({ ... }).");
			var branch = control("if", map("condition", expression(conditional.getCondition(), scope)), statement, "then", branch(conditional.getThenPart(), scope));
			if (conditional.getElsePart() != null) branch.put("else", branch(conditional.getElsePart(), scope));
			output.add(branch);
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.WhileLoop loop) {
			if (loop.getCondition() instanceof ObjectLiteral) reject("FLOWSCRIPT_V3_OBJECT_CONDITION", loop.getCondition(), "Use flow.while({ ... }).");
			var body = new ArrayList<Map<String, Object>>();
			inBody(loop.getBody(), new Scope(scope), body);
			output.add(control("while", map("condition", expression(loop.getCondition(), scope), "maxIterations", 1000, "timeoutMs", 60000), loop, "nodes", body));
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
			if (countedDepth > 0) reject("FLOWSCRIPT_V3_FOR_FORM", statement, "A counted for body cannot contain continue.");
			output.add(node("next", map(), statement));
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.ThrowStatement thrown) {
			AstNode value = thrown.getExpression();
			if (value instanceof Name n) reject("FLOWSCRIPT_V3_PROTOTYPE_RETHROW", statement, "Raising the caught error again is not available yet: throw { code: \"LITERAL_CODE\", message: " + n.getIdentifier() + ".message, details: " + n.getIdentifier() + ".details }");
			if (value instanceof org.mozilla.javascript.ast.NewExpression) reject("FLOWSCRIPT_V3_ERROR_CODE_CHOICE", statement, "throw { code: \"CHOOSE_ERROR_CODE\", message: ... }");
			if (!(value instanceof ObjectLiteral)) reject("FLOWSCRIPT_V3_UNSUPPORTED", statement, "Throw an object with a literal code.");
			var props = new LinkedHashMap<String, Object>();
			for (var member : ((ObjectLiteral) value).getElements()) { var field = property(member); props.put(key(field.getKey()), propertyValue("throw", key(field.getKey()), field.getValue(), scope)); }
			output.add(node("throw", props, statement));
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.TryStatement trial) {
			if (trial.getFinallyBlock() != null) reject("FLOWSCRIPT_V3_FINALLY", trial.getFinallyBlock(), "Write statements after the try.");
			if (trial.getCatchClauses().isEmpty()) reject("FLOWSCRIPT_V3_UNSUPPORTED", trial, "Use try/catch.");
			var clause = trial.getCatchClauses().get(0);
			String name = clause.getVarName() == null ? "error" : name(clause.getVarName());
			var catchScope = new Scope(scope);
			declare(name, "const", clause, catchScope, null);
			var node = control("try", map("error", "local." + name), trial, "try", branch(trial.getTryBlock(), scope));
			node.put("catch", branch(clause.getBody(), catchScope));
			output.add(node);
			return;
		}
		if (statement instanceof org.mozilla.javascript.ast.SwitchStatement item) { switchStatement(item, scope, output); return; }
		if (statement instanceof org.mozilla.javascript.ast.LabeledStatement labelled) {
			AstNode item = labelled.getStatement();
			if (item instanceof org.mozilla.javascript.ast.WhileLoop || item instanceof org.mozilla.javascript.ast.ForLoop || item instanceof org.mozilla.javascript.ast.ForInLoop || item instanceof org.mozilla.javascript.ast.DoLoop)
				reject("FLOWSCRIPT_V3_LOOP_FORM", labelled, "Use an unlabelled loop.");
			int first = output.size();
			statement(item, scope, output);
			if (output.size() > first) output.get(first).put("id", labelled.getFirstLabel().getName());
			return;
		}
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
