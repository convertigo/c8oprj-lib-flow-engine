(function () {
	return {
		name: "requestable",
		label: "Requestable",
		icon: "mdi:link-variant",
		type: "string",
		description: "Sequence, Flow or Transaction target using SDK-like Convertigo qname syntax.",
		editor: {
			label: "Requestable picker",
			kind: "webcomponent",
			component: "flow-requestable-editor",
			file: "editors/requestable.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Requestable validator",
			kind: "javascript",
			function: "validateRequestable",
			file: "requestable.js",
			icon: "mdi:check-decagram-outline"
		},
		reader: {
			label: "Requestable resolver",
			kind: "runtime",
			function: "resolveRequestable",
			file: "requestable.js",
			icon: "mdi:import"
		}
	};
}())
