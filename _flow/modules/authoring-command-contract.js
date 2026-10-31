(function () {
	function validate(request, raise) {
		request = request || {};
		var hint = "For a palette action, pass items[].apply.arguments unchanged (action.id and action.targetPath). " +
			"For source edits, pass sourceFile and mutation or mutations; for a Flow graph, pass its name or definition.";
		function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
		function fail(code, message) { raise(code, message, null, hint); }
		var forms = ["action", "transfer", "mutation", "mutations"].filter(function (key) { return request[key] !== undefined && request[key] !== null; });
		if (forms.length !== 1) fail("AUTHORING_MUTATION_REQUIRED", "Pass exactly one of action, transfer, mutation or mutations; received " + (forms.join(", ") || "none") + ".");
		if (request.action) {
			if (!object(request.action) || !String(request.action.id || "").trim() || typeof request.action.targetPath !== "string")
				fail("AUTHORING_ACTION_INVALID", "action requires id and targetPath from the palette apply arguments.");
			return;
		}
		if (request.transfer) {
			if (!object(request.transfer)) fail("AUTHORING_TRANSFER_INVALID", "transfer must be an object.");
			return;
		}
		var mutations = request.mutations !== undefined ? request.mutations : [request.mutation];
		if (!Array.isArray(mutations) || !mutations.length || mutations.some(function (mutation) {
			return !object(mutation) || (!String(mutation.op || "").trim() && !mutation.__engineMutationPath && !(mutation.value && mutation.value.__engineMutationPath));
		})) fail("AUTHORING_MUTATION_INVALID", "mutation must be an object with op; mutations must be a nonempty array of these objects.");
		var engineMutations = mutations.every(function (mutation) {
			return mutation.__engineMutationPath || mutation.value && mutation.value.__engineMutationPath || mutation.op === "insertProvider" ||
				mutation.target === "sources" && mutation.op === "renameResource";
		});
		if (!engineMutations && !request.sourceFile && !request.sourcePath && !request.flowName && !request.flowQName &&
			!request.name && !request.qname && !request.flowSource && !request.definition)
			fail("AUTHORING_MUTATION_TARGET_REQUIRED", "No source or Flow target was supplied for mutation. A route-tree path is a palette target, not a Flow name.");
	}
	return {validate: validate};
}())
