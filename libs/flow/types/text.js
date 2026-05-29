(function () {
	return {
		name: "text",
		label: "Text",
		icon: "mdi:form-textbox",
		type: "string",
		description: "Plain text value with no expression evaluation.",
		editor: {
			label: "Text editor",
			kind: "webcomponent",
			component: "flow-text-editor",
			file: "editors/text.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Text validator",
			kind: "javascript",
			function: "validateText",
			file: "text.js",
			icon: "mdi:check-decagram-outline"
		}
	};
}())
