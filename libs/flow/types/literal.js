(function () {
	return {
		name: "literal",
		label: "Literal",
		icon: "mdi:code-json",
		type: "unknown",
		description: "Static JSON-compatible value, not evaluated as an expression.",
		editor: {
			label: "Literal editor",
			kind: "webcomponent",
			component: "flow-literal-editor",
			file: "editors/literal.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Literal validator",
			kind: "javascript",
			function: "validateLiteral",
			file: "literal.js",
			icon: "mdi:check-decagram-outline"
		}
	};
}())
