(function () {
	return {
		name: "value",
		label: "Value",
		icon: "mdi:variable-box",
		type: "unknown",
		description: "Literal value or {{ expression }} preserving native JavaScript type.",
		editor: {
			label: "Value editor",
			kind: "webcomponent",
			component: "flow-value-editor",
			file: "editors/value.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Value validator",
			kind: "javascript",
			function: "validateValue",
			file: "value.js",
			icon: "mdi:check-decagram-outline"
		},
		reader: {
			label: "Value reader",
			kind: "runtime",
			function: "readValue",
			file: "value.js",
			icon: "mdi:import"
		}
	};
}())
