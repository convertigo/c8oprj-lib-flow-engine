(function () {
	// Composition of block descriptors by traits (spec-flow-catalog-composition-v1).
	// Pure JavaScript, shared by the Engine (Rhino) and the Svelte frontbuilder (Node):
	// the rules are written once. A trait declares properties (type, usage, default...)
	// and may include other traits; a block composes traits and may change the default,
	// label or category of a trait property and add a note, never its type or meaning.

	var OVERRIDABLE = { "default": true, label: true, category: true, note: true, hidden: true, from: true };
	var MEANING = { kind: true, type: true, description: true, "enum": true, role: true, literalType: true, mode: true };

	function isRecord(value) {
		return value !== null && typeof value === "object" && Object.prototype.toString.call(value) !== "[object Array]";
	}

	function clone(value) {
		return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
	}

	// traits: ["a", "b"] or { a: { prop: { default: ... } }, b: {} }.
	function traitReferences(traits) {
		var names = [];
		var overrides = {};
		if (Object.prototype.toString.call(traits) === "[object Array]") {
			traits.forEach(function (name) {
				if (typeof name === "string" && name && names.indexOf(name) < 0) names.push(name);
			});
		} else if (isRecord(traits)) {
			Object.keys(traits).forEach(function (name) {
				if (!name || names.indexOf(name) >= 0) return;
				names.push(name);
				if (isRecord(traits[name])) overrides[name] = traits[name];
			});
		}
		return { names: names, overrides: overrides };
	}

	// Depth first: an included trait comes before the trait including it.
	function expandTraits(names, traitsByName, diagnostics) {
		var ordered = [];
		var visiting = {};
		function visit(name, from) {
			if (ordered.indexOf(name) >= 0) return;
			if (visiting[name]) {
				diagnostics.push({ code: "TRAIT_INCLUDE_CYCLE", trait: name, message: "Trait " + name + " includes itself through " + from + "." });
				return;
			}
			var trait = traitsByName[name];
			visiting[name] = true;
			if (trait && Object.prototype.toString.call(trait.includes) === "[object Array]") {
				trait.includes.forEach(function (included) { visit(String(included), name); });
			}
			visiting[name] = false;
			ordered.push(name);
		}
		names.forEach(function (name) { visit(name, name); });
		return ordered;
	}

	function usageText(definition) {
		var notes = [];
		if (definition.note) notes.push(String(definition.note));
		return notes;
	}

	/**
	 * Returns { properties, traits, diagnostics }: the block properties followed by the
	 * properties its traits bring, with their documentation composed (usage from the
	 * trait, then the notes of the trait and of the block), and the expanded trait names.
	 */
	function compose(descriptor, traitsByName) {
		descriptor = descriptor || {};
		traitsByName = traitsByName || {};
		var diagnostics = [];
		var own = isRecord(descriptor.properties) ? descriptor.properties : isRecord(descriptor.props) ? descriptor.props : {};
		var references = traitReferences(descriptor.traits);
		var expanded = expandTraits(references.names, traitsByName, diagnostics);
		var properties = {};
		Object.keys(own).forEach(function (name) { properties[name] = own[name]; });
		var providers = {};
		expanded.forEach(function (traitName) {
			var trait = traitsByName[traitName];
			if (!trait || !isRecord(trait.properties)) return;
			Object.keys(trait.properties).forEach(function (name) {
				(providers[name] = providers[name] || []).push(traitName);
			});
		});
		Object.keys(providers).forEach(function (name) {
			var owners = providers[name];
			var override = null;
			var chosen = owners[owners.length - 1];
			references.names.forEach(function (traitName) {
				var candidate = references.overrides[traitName] && references.overrides[traitName][name];
				if (isRecord(candidate)) override = candidate;
			});
			if (owners.length > 1) {
				if (override && typeof override.from === "string" && owners.indexOf(override.from) >= 0) {
					chosen = override.from;
				} else {
					diagnostics.push({ code: "TRAIT_MEMBER_CONFLICT", property: name, traits: owners.slice(),
						message: "Traits " + owners.join(", ") + " both bring " + name + ": choose one with { from: \"<trait>\" }." });
				}
			}
			if (Object.prototype.hasOwnProperty.call(own, name)) {
				diagnostics.push({ code: "TRAIT_MEMBER_SHADOWED", property: name, trait: chosen,
					message: "Property " + name + " is brought by trait " + chosen + ": remove the block's own definition and change its default through the trait." });
				return;
			}
			var base = traitsByName[chosen].properties[name];
			var definition = clone(base) || {};
			definition.trait = chosen;
			var usage = String(base && base.description || "");
			if (!usage) {
				diagnostics.push({ code: "TRAIT_PROPERTY_USAGE_MISSING", property: name, trait: chosen,
					message: "Trait " + chosen + " must describe what " + name + " is for." });
			}
			var notes = usageText(base || {});
			if (override) {
				Object.keys(override).forEach(function (field) {
					if (MEANING[field]) {
						diagnostics.push({ code: "TRAIT_MEMBER_MEANING_CHANGED", property: name, trait: chosen, field: field,
							message: "A block cannot change the " + field + " of " + name + " brought by trait " + chosen + "." });
					} else if (OVERRIDABLE[field] && field !== "note" && field !== "from") {
						definition[field] = clone(override[field]);
					}
				});
				if (override.note) notes.push(String(override.note));
			}
			definition.usage = usage;
			if (notes.length) definition.notes = notes;
			delete definition.note;
			definition.description = [usage].concat(notes).filter(Boolean).join(" ");
			properties[name] = definition;
		});
		return { properties: properties, traits: expanded, diagnostics: diagnostics };
	}

	return { traitReferences: traitReferences, expandTraits: expandTraits, compose: compose };
}())
