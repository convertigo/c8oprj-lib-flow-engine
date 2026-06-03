(function () {
	var File = Packages.java.io.File;
	var System = Packages.java.lang.System;

	function trim(value) {
		return value == null ? "" : String(value).trim();
	}

	function resolve(path, suffix) {
		var raw = trim(path) || "~";
		var home = trim(System.getProperty("user.home"));
		if (raw === "~") {
			raw = home;
		} else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
			raw = home + raw.substring(1);
		}
		var file = new File(raw);
		if (trim(suffix)) {
			file = new File(file, trim(suffix));
		}
		return String(file.getCanonicalFile().getAbsolutePath());
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			return resolve(ctx.template(props.path || "~"), ctx.template(props.suffix || ""));
		}
	};
}())
