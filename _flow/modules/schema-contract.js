(function () {
	// Portable, deliberately bounded schema contract. Unknown is evidence missing,
	// not a wildcard. Unsupported constraints fail closed rather than disappearing.
	function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
	function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
	function issue(code, path, message) { return { code: code, path: path, message: message }; }
	function definition(schema) {
		var errors = [];
		function visit(s, path, depth) {
			if (depth > 32) { errors.push(issue("INVALID_SCHEMA", path, "Type nesting exceeds 32 levels.")); return; }
			if (!object(s)) { errors.push(issue("INVALID_SCHEMA", path, "Choose a type.")); return; }
			var types = ["unknown", "null", "string", "number", "integer", "boolean", "array", "object"];
			if (types.indexOf(s.type) < 0) errors.push(issue("INVALID_SCHEMA", path, "Unsupported type: " + String(s.type)));
			Object.keys(s).forEach(function (key) {
				if (["type", "nullable", "enum", "items", "properties", "required", "additionalProperties",
					"title", "label", "description", "default", "examples", "example", "hidden", "expert"].indexOf(key) < 0) {
					errors.push(issue("UNSUPPORTED_SCHEMA_CONSTRAINT", path, "Unsupported constraint: " + key));
				}
			});
			if (s.nullable !== undefined && typeof s.nullable !== "boolean") errors.push(issue("INVALID_SCHEMA", path, "Nullable must be a boolean."));
			if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length || s.enum.some(function (v) {
				return v !== null && ["string", "number", "boolean"].indexOf(typeof v) < 0 || typeof v === "number" && !isFinite(v);
			}))) errors.push(issue("INVALID_SCHEMA", path, "Choices must be a non-empty list of scalar values."));
			if (Array.isArray(s.enum) && s.type !== "unknown" && s.enum.some(function (v) {
				return !(v === null && s.nullable === true) && !acceptsType(s.type, typeOf(v));
			})) errors.push(issue("INVALID_SCHEMA", path, "Each choice must match the declared type."));
			if (s.type === "array") visit(s.items, path + ".items", depth + 1);
			else if (s.items !== undefined) errors.push(issue("INVALID_SCHEMA", path, "Only an array has an item type."));
			if (s.type === "object") {
				if (s.properties !== undefined && !object(s.properties)) errors.push(issue("INVALID_SCHEMA", path, "Fields must be an object."));
				else Object.keys(s.properties || {}).forEach(function (key) { visit(s.properties[key], path + "." + key, depth + 1); });
				if (s.required !== undefined && (!Array.isArray(s.required) || s.required.some(function (key) {
					return typeof key !== "string" || !own(s.properties || {}, key);
				}))) errors.push(issue("INVALID_SCHEMA", path, "Required fields must name existing fields."));
				if (s.additionalProperties !== undefined && typeof s.additionalProperties !== "boolean") visit(s.additionalProperties, path + ".values", depth + 1);
			} else if (s.properties !== undefined || s.required !== undefined || s.additionalProperties !== undefined) {
				errors.push(issue("INVALID_SCHEMA", path, "Only an object has fields or map values."));
			}
		}
		visit(schema, "$", 0);
		return { valid: errors.length === 0, errors: errors };
	}
	function typeOf(value) {
		if (value === null) return "null";
		if (Array.isArray(value)) return "array";
		if (typeof value === "number") return isFinite(value) ? Math.floor(value) === value ? "integer" : "number" : "invalid";
		if (typeof value === "object" && Object.prototype.toString.call(value) !== "[object Object]") return "invalid";
		return typeof value;
	}
	function acceptsType(expected, actual) { return expected === actual || expected === "number" && actual === "integer"; }
	function result(problems, unknowns) {
		return { status: problems.length ? "incompatible" : unknowns.length ? "unknown" : "compatible",
			issues: problems.concat(unknowns) };
	}
	function validate(schema, value) {
		var checked = definition(schema);
		if (!checked.valid) return { status: "unknown", issues: checked.errors };
		var problems = [], unknowns = [];
		function visit(s, v, path, depth) {
			if (depth > 64) { problems.push(issue("VALUE_DEPTH_EXCEEDED", path, "Value nesting exceeds 64 levels.")); return; }
			if (s.type === "unknown") { unknowns.push(issue("UNKNOWN_TYPE", path, "The expected type is unknown.")); return; }
			var type = typeOf(v);
			if (!(v === null && s.nullable === true) && !acceptsType(s.type, type)) {
				problems.push(issue("TYPE_MISMATCH", path, "Expected " + s.type + ", received " + type + ".")); return;
			}
			if (s.enum && s.enum.indexOf(v) < 0) problems.push(issue("ENUM_MISMATCH", path, "Value is not an allowed choice."));
			if (v === null) return;
			if (s.type === "array") {
				for (var i = 0; i < v.length; i++) visit(s.items, v[i], path + "[" + i + "]", depth + 1);
			}
			if (s.type === "object") {
				(s.required || []).forEach(function (key) {
					if (!own(v, key)) problems.push(issue("MISSING_FIELD", path + "." + key, "Required field is missing."));
				});
				Object.keys(v).forEach(function (key) {
					if (own(s.properties || {}, key)) visit(s.properties[key], v[key], path + "." + key, depth + 1);
					else if (object(s.additionalProperties)) visit(s.additionalProperties, v[key], path + "." + key, depth + 1);
					else if (s.additionalProperties === false) problems.push(issue("UNEXPECTED_FIELD", path + "." + key, "Field is not allowed."));
				});
			}
		}
		visit(schema, value, "$", 0);
		return result(problems, unknowns);
	}
	function compare(expected, actual) {
		var left = definition(expected), right = definition(actual);
		if (!left.valid || !right.valid) return { status: "unknown", issues: left.errors.concat(right.errors) };
		var problems = [], unknowns = [];
		function visit(e, a, path) {
			if (e.type === "unknown" || a.type === "unknown") { unknowns.push(issue("UNKNOWN_TYPE", path, "Compatibility cannot be proven for an unknown type.")); return; }
			if (a.type === "null" && e.nullable === true) {
				if (e.enum && e.enum.indexOf(null) < 0) problems.push(issue("ENUM_MISMATCH", path, "Null is not an allowed choice."));
				return;
			}
			if (!acceptsType(e.type, a.type)) { problems.push(issue("TYPE_MISMATCH", path, "Expected " + e.type + ", source is " + a.type + ".")); return; }
			if (a.nullable && !e.nullable && e.type !== "null") problems.push(issue("NULLABILITY_MISMATCH", path, "The source may be null."));
			if (e.enum) {
				if (!a.enum) unknowns.push(issue("UNKNOWN_CHOICES", path, "The source choices are not constrained."));
				else if (a.enum.some(function (v) { return e.enum.indexOf(v) < 0; })) problems.push(issue("ENUM_MISMATCH", path, "Source choices are not all allowed."));
			}
			if (e.type === "array") visit(e.items, a.items, path + "[]");
			if (e.type !== "object") return;
			var ep = e.properties || {}, ap = a.properties || {};
			(e.required || []).forEach(function (key) {
				if ((a.required || []).indexOf(key) < 0) unknowns.push(issue("OPTIONAL_SOURCE_FIELD", path + "." + key, "The source does not guarantee this required field."));
			});
			Object.keys(ap).forEach(function (key) {
				if (own(ep, key)) visit(ep[key], ap[key], path + "." + key);
				else if (object(e.additionalProperties)) visit(e.additionalProperties, ap[key], path + "." + key);
				else if (e.additionalProperties === false) problems.push(issue("UNEXPECTED_FIELD", path + "." + key, "Source field is not allowed."));
			});
			if (a.additionalProperties !== false) {
				var extra = object(a.additionalProperties) ? a.additionalProperties : { type: "unknown" };
				Object.keys(ep).filter(function (key) { return !own(ap, key); }).forEach(function (key) { visit(ep[key], extra, path + "." + key); });
				if (object(e.additionalProperties)) visit(e.additionalProperties, extra, path + ".*");
				else if (e.additionalProperties === false) unknowns.push(issue("UNKNOWN_FIELDS", path, "The source may contain additional fields."));
			}
		}
		visit(expected, actual, "$");
		return result(problems, unknowns);
	}
	return { definition: definition, validate: validate, compare: compare };
}())
