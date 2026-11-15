function (input) {
  input = input || {};
  var NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
  function fail(code, message) { throw { code: code, message: message }; }
  function digits(value, name) {
    if (value === undefined || value === null || value === "") return null;
    var n = Number(value);
    if (!(n >= 0 && n <= 20 && Math.floor(n) === n)) fail("NUMBER_FORMAT_DIGITS_INVALID", name + " is an integer from 0 to 20.");
    return n;
  }
  var value = input.value, text = typeof value === "number" ? (isFinite(value) ? String(value) : "") : (value === undefined || value === null ? "" : String(value).trim());
  if (!NUMBER.test(text)) return String(input.fallback === undefined || input.fallback === null ? "" : input.fallback);
  if (text.charAt(0) === "+") text = text.substring(1);
  var style = String(input.style || "decimal");
  if (["decimal", "currency", "percent"].indexOf(style) < 0) fail("NUMBER_FORMAT_STYLE_INVALID", "style is decimal, currency or percent.");
  var locale = String(input.locale || (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) || "fr-FR");
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) fail("NUMBER_FORMAT_LOCALE_INVALID", "Use a BCP 47 locale such as en-US or fr-FR.");
  var options = { style: style, roundingMode: "halfExpand" }, min = 0, max = 3;
  if (style === "currency") {
    options.currency = String(input.currency || "USD").toUpperCase();
    try { min = max = new Intl.NumberFormat("en-US", { style: "currency", currency: options.currency }).resolvedOptions().maximumFractionDigits; }
    catch (e) { fail("NUMBER_FORMAT_CURRENCY_INVALID", "Use an ISO 4217 currency code such as USD or EUR."); }
  } else if (style === "percent") {
    max = 0;
  }
  var wantedMin = digits(input.minimumFractionDigits, "minimumFractionDigits"), wantedMax = digits(input.maximumFractionDigits, "maximumFractionDigits");
  if (wantedMin !== null) { min = wantedMin; max = Math.max(max, min); }
  if (wantedMax !== null) { max = wantedMax; if (wantedMin === null) min = Math.min(min, max); }
  if (min > max) fail("NUMBER_FORMAT_DIGITS_INVALID", "minimumFractionDigits is at most maximumFractionDigits.");
  options.minimumFractionDigits = min;
  options.maximumFractionDigits = max;
  options.useGrouping = !(input.grouping === false || String(input.grouping) === "false");
  try { return new Intl.NumberFormat(locale, options).format(text); }
  catch (e) { fail("NUMBER_FORMAT_LOCALE_INVALID", "Use a BCP 47 locale such as en-US or fr-FR."); }
}
