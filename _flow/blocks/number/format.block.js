const _meta = {
  "sourceVersion": 2,
  "version": 1,
  "runtime": "rhino",
  "targets": [
    "backend",
    "frontend"
  ],
  "effects": [],
  "icon": "mdi:numeric",
  "description": "Formats a number, an amount of money (currency such as USD) or a percentage for a locale, with its thousands separator and decimals: the same text on the server and in a page.",
  "longDescription": "number.format({value:12500,style:'currency',currency:'USD',locale:'en-US',maximumFractionDigits:0}) -> '$12,500'; number.format({value:1234.5,locale:'en-US'}) -> '1,234.5'; number.format({value:0.256,style:'percent',locale:'en-US'}) -> '26%'. value: a number or numeric text (an int64 or decimal of an entity as text keeps its precision). Rounding is half away from zero. An invalid value returns fallback. Dates: date.format; a sum of a list: list.sum.",
  "summary": "format {{value}}",
  "tags": [
    "number",
    "format",
    "currency",
    "money",
    "amount",
    "dollar",
    "price",
    "percent",
    "locale",
    "thousands",
    "separator",
    "decimals",
    "portable"
  ],
  "aliases": [
    "currency.format",
    "money.format",
    "number.currency",
    "number.toLocaleString",
    "text.format",
    "format.number",
    "format.currency"
  ],
  "implementations": {
    "backend": {
      "runtime": "rhino"
    },
    "frontend": {
      "runtime": "browser",
      "file": "format.browser.js"
    }
  },
  "properties": {
    "value": {
      "label": "Value",
      "kind": "value",
      "type": "unknown",
      "description": "Number or numeric text to format."
    },
    "style": {
      "label": "Style",
      "kind": "value",
      "type": "string",
      "default": "decimal",
      "enum": [
        "decimal",
        "currency",
        "percent"
      ],
      "description": "decimal, currency (with currency) or percent (0.25 -> 25%)."
    },
    "currency": {
      "label": "Currency",
      "kind": "value",
      "type": "string",
      "default": "USD",
      "description": "ISO 4217 code for style currency: USD, EUR, GBP, JPY..."
    },
    "locale": {
      "label": "Locale",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "BCP 47 language such as en-US or fr-FR. Empty: config.date.locale on the server, else fr-FR; a page passes the same locale."
    },
    "minimumFractionDigits": {
      "label": "Minimum decimals",
      "category": "Expert",
      "kind": "value",
      "type": "number",
      "description": "0 to 20. Default: 0, the decimals of the currency (2 for USD) for style currency."
    },
    "maximumFractionDigits": {
      "label": "Maximum decimals",
      "category": "Expert",
      "kind": "value",
      "type": "number",
      "description": "0 to 20, at least the minimum: 0 gives $12,500. Default: 3, the decimals of the currency, 0 for percent."
    },
    "grouping": {
      "label": "Thousands separator",
      "category": "Expert",
      "kind": "value",
      "type": "boolean",
      "default": true,
      "description": "false writes 12500 instead of 12,500."
    },
    "fallback": {
      "label": "Fallback",
      "category": "Expert",
      "kind": "value",
      "type": "string",
      "default": "",
      "description": "Text returned when the value is not a number."
    }
  },
  "outputs": {
    "out": {
      "type": "string"
    }
  }
};

(function () {
	var NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
	function digits(ctx, node, value, name) {
		if (value === undefined || value === null || value === "") return null;
		var n = Number(value);
		if (!(n >= 0 && n <= 20 && Math.floor(n) === n)) {
			ctx.throwFlow({ code: "NUMBER_FORMAT_DIGITS_INVALID", message: name + " is an integer from 0 to 20.", status: 400 }, node);
		}
		return n;
	}
	function decimal(value) {
		if (value === undefined || value === null) return null;
		if (typeof value === "number") return isFinite(value) ? new java.math.BigDecimal(String(value)) : null;
		var text = String(value).trim();
		return NUMBER.test(text) ? new java.math.BigDecimal(text.charAt(0) === "+" ? text.substring(1) : text) : null;
	}
	function format(ctx, node, input) {
		var amount = decimal(input.value);
		if (amount === null) return String(input.fallback === undefined || input.fallback === null ? "" : input.fallback);
		var style = String(input.style || "decimal");
		if (["decimal", "currency", "percent"].indexOf(style) < 0) {
			ctx.throwFlow({ code: "NUMBER_FORMAT_STYLE_INVALID", message: "style is decimal, currency or percent.", status: 400 }, node);
		}
		var tag = String(input.locale || ctx.read("config.date.locale") || "fr-FR"), locale = java.util.Locale.forLanguageTag(tag);
		if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag) || String(locale.toLanguageTag()) === "und") {
			ctx.throwFlow({ code: "NUMBER_FORMAT_LOCALE_INVALID", message: "Use a BCP 47 locale such as en-US or fr-FR.", status: 400 }, node);
		}
		var formatter, min = 0, max = 3;
		if (style === "currency") {
			var currency;
			try {
				currency = java.util.Currency.getInstance(String(input.currency || "USD").toUpperCase());
			} catch (unknown) {
				ctx.throwFlow({ code: "NUMBER_FORMAT_CURRENCY_INVALID", message: "Use an ISO 4217 currency code such as USD or EUR.", status: 400 }, node);
			}
			formatter = java.text.NumberFormat.getCurrencyInstance(locale);
			formatter.setCurrency(currency);
			min = max = Math.max(0, currency.getDefaultFractionDigits());
		} else if (style === "percent") {
			formatter = java.text.NumberFormat.getPercentInstance(locale);
			max = 0;
		} else {
			formatter = java.text.NumberFormat.getNumberInstance(locale);
		}
		var wantedMin = digits(ctx, node, input.minimumFractionDigits, "minimumFractionDigits"), wantedMax = digits(ctx, node, input.maximumFractionDigits, "maximumFractionDigits");
		// as Intl.NumberFormat: a maximum alone lowers the default minimum, a minimum alone raises the default maximum
		if (wantedMin !== null) { min = wantedMin; max = Math.max(max, min); }
		if (wantedMax !== null) { max = wantedMax; if (wantedMin === null) min = Math.min(min, max); }
		if (min > max) {
			ctx.throwFlow({ code: "NUMBER_FORMAT_DIGITS_INVALID", message: "minimumFractionDigits is at most maximumFractionDigits.", status: 400 }, node);
		}
		formatter.setRoundingMode(java.math.RoundingMode.HALF_UP);
		formatter.setMinimumFractionDigits(min);
		formatter.setMaximumFractionDigits(max);
		formatter.setGroupingUsed(input.grouping !== false && String(input.grouping) !== "false");
		return String(formatter.format(amount));
	}
	function read(ctx, node) {
		var p = ctx.props(node), input = {};
		["value", "style", "currency", "locale", "minimumFractionDigits", "maximumFractionDigits", "grouping", "fallback"].forEach(function (key) {
			if (p[key] !== undefined) input[key] = ctx.input({ value: p[key] });
		});
		return input;
	}
	return {
		stateless: true,
		run: function (ctx, node) {
			return format(ctx, node, read(ctx, node));
		}
	};
}())
