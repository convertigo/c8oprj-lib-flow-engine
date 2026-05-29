(function () {
	return {
		name: "path",
		label: "Scope path",
		icon: "mdi:map-marker-path",
		type: "string",
		description: "Path inside input, config, flow, result, trace or current scopes.",
		editor: {
			label: "Path picker",
			kind: "webcomponent",
			component: "flow-path-editor",
			file: "editors/path.html",
			icon: "mdi:application-brackets-outline"
		},
		validator: {
			label: "Path validator",
			kind: "javascript",
			function: "validatePath",
			file: "path.js",
			icon: "mdi:check-decagram-outline"
		},
		reader: {
			label: "Path reader",
			kind: "runtime",
			function: "readPath",
			file: "path.js",
			icon: "mdi:import"
		},
		writer: {
			label: "Path writer",
			kind: "runtime",
			function: "writePath",
			file: "path.js",
			icon: "mdi:export"
		}
	};
}())
