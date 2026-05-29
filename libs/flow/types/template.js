(function () {
	return {
		name: "template",
		label: "Template",
		icon: "mdi:code-braces",
		type: "string",
		description: "Text with embedded {{ expression }} fragments.",
		editor: {
			label: "Template editor",
			kind: "webcomponent",
			component: "flow-template-editor",
			file: "editors/template.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Template validator",
			kind: "javascript",
			function: "validateTemplate",
			file: "template.js",
			icon: "mdi:check-decagram-outline"
		},
		reader: {
			label: "Template reader",
			kind: "runtime",
			function: "readTemplate",
			file: "template.js",
			icon: "mdi:import"
		}
	};
}())
