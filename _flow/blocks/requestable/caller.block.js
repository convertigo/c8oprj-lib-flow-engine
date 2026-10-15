const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "icon": "mdi:api",
  "tags": [
    "requestable",
    "security",
    "platform",
  ],
  "summary": "caller of the requestable",
  "description": "Tells how the running requestable was reached: project is the project of this Flow, requestProject the project the HTTP request targets (its __project parameter or /projects/<name>/ URL), and direct is true when they are the same, that is when a client calls this project itself rather than a sequence of another project calling it through a sequence step or requestable.call. Use it for a policy that only applies to direct calls, such as refusing a sign-in that a client requests directly. Without an HTTP request (tests, scheduled jobs) hasRequest is false and direct is false.",
  "properties": {},
  "outputs": {
    "out": {
      "type": "object",
      "properties": {
        "project": {
          "type": "string",
        },
        "requestProject": {
          "type": "string",
        },
        "direct": {
          "type": "boolean",
        },
        "hasRequest": {
          "type": "boolean",
        },
      },
    },
  },
  "runtime": "rhino",
}

(function () {
	function text(value) {
		return value === undefined || value === null ? "" : String(value);
	}

	return {
		run: function (ctx, node) {
			var out = { project: "", requestProject: "", direct: false, hasRequest: false };
			var context = null;
			try {
				context = ctx.convertigoContext();
			} catch (e) {
			}
			if (context == null) {
				return out;
			}
			try {
				if (context.project != null) {
					out.project = text(context.project.getName());
				} else if (context.projectName != null) {
					out.project = text(context.projectName);
				}
			} catch (e) {
			}
			var request = null;
			try {
				request = context.httpServletRequest;
			} catch (e) {
			}
			if (request == null) {
				return out;
			}
			out.hasRequest = true;
			try {
				var project = request.getParameter("__project");
				if (project == null) {
					var matched = /\/projects\/([^\/]+)\//.exec(text(request.getRequestURI()));
					project = matched ? matched[1] : "";
				}
				out.requestProject = text(project);
			} catch (e) {
			}
			out.direct = out.project !== "" && out.requestProject === out.project;
			return out;
		}
	};
}())
