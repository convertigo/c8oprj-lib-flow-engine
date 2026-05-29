(function () {
	return {
		name: "expression",
		label: "Expression",
		icon: "mdi:function-variant",
		type: "string",
		description: "JavaScript expression evaluated against the current Flow scopes.",
		editor: {
			label: "Expression editor",
			kind: "webcomponent",
			component: "flow-expression-editor",
			file: "editors/expression.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Expression validator",
			kind: "javascript",
			function: "validateExpression",
			file: "expression.js",
			icon: "mdi:check-decagram-outline"
		},
		reader: {
			label: "Expression reader",
			kind: "runtime",
			function: "readExpression",
			file: "expression.js",
			icon: "mdi:import"
		}
	};
}())
