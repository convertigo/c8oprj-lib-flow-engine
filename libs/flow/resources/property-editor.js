(function () {
  var state = null,
    focusKey = null,
    draft = "",
    editorMode = "custom",
    pickerValue = "",
    pickerTarget = "",
    pickerOriginal = "",
    pickerLastTarget = "",
    pickerUpdatingEditor = false;
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>\"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '\"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function send(m) {
    if (window.flowEditor && window.flowEditor.receive) {
      window.flowEditor.receive(JSON.stringify(m));
    }
  }
  function hostRequest(name, payload) {
    var requestPayload = enrichRequestPayload(name, payload);
    if (window.flowEditor && window.flowEditor.request) {
      try {
        return JSON.parse(
          window.flowEditor.request(
            JSON.stringify({
              type: "request",
              name: name,
              payload: requestPayload,
            }),
          ) || "{}",
        );
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
    return { ok: false, error: "Flow editor bridge is unavailable." };
  }
  function enrichRequestPayload(name, payload) {
    var out = {};
    keys(payload).forEach(function (key) {
      out[key] = payload[key];
    });
    if (name === "context" && state) {
      var property = activeRequestProperty();
      if ((out.property === undefined || out.property === "") && property) {
        out.property = property;
      }
      if (
        out.node === undefined &&
        out.path === undefined &&
        out.nodePath === undefined
      ) {
        var nodePath = flowNodePath(state.virtualPath);
        if (nodePath) {
          out.path = nodePath;
        }
      }
    }
    return out;
  }
  function flowNodePath(value) {
    value = String(value || "");
    return /^nodes(?:\[|\.)/.test(value) ? value : "";
  }
  function activeRequestProperty() {
    if (state && state.property) {
      return state.property;
    }
    if (state && state.mode === "picker" && pickerTarget) {
      return pickerTarget;
    }
    return "";
  }
  function keys(o) {
    return Object.keys(o || {});
  }
  function objectValue(value) {
    if (!value) return {};
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (e) {
        return {};
      }
    }
    return typeof value === "object" ? value : {};
  }
  function stateDefinition() {
    return objectValue(state && state.definition);
  }
  function propOrder(info, defs, node) {
    var out = [];
    (info.propertyOrder || []).forEach(function (k) {
      if (defs[k] && !defs[k].hidden && out.indexOf(k) < 0) out.push(k);
    });
    keys(defs)
      .sort()
      .forEach(function (k) {
        if (!defs[k].hidden && out.indexOf(k) < 0) out.push(k);
      });
    keys(node)
      .sort()
      .forEach(function (k) {
        if (
          ["id", "block", "comment", "props"].indexOf(k) < 0 &&
          !defs[k] &&
          out.indexOf(k) < 0
        )
          out.push(k);
      });
    return out;
  }
  function propValue(node, key) {
    var v = node[key];
    if ((v === undefined || v === null) && node && node.props)
      v = node.props[key];
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
  }
  function templateLike(kind) {
    return kind === "template" || kind === "value";
  }
  function simpleParts(v) {
    v = String(v || "");
    var m = v.match(/^\s*\{\{([\s\S]*)\}\}\s*$/);
    if (m) return { prefix: "", path: m[1].trim(), suffix: "" };
    return { prefix: "", path: "", suffix: "" };
  }
  function simpleCandidate(v) {
    return String(v || "").trim() === "" || simpleParts(v).path !== "";
  }
  function simpleValue() {
    var p = document.querySelector('[data-simple="prefix"]');
    var m = document.querySelector('[data-simple="pick"]');
    var s = document.querySelector('[data-simple="suffix"]');
    var path = m ? m.value.trim() : "";
    var expr = ((p ? p.value : "") + path + (s ? s.value : "")).trim();
    return expr ? "{{ " + expr + " }}" : "";
  }
  function setDraft(v) {
    draft = v == null ? "" : String(v);
    send({ type: "value", value: draft });
  }
  function syncSimple() {
    var el = document.querySelector("[data-key]");
    if (el) {
      el.value = simpleValue();
      setDraft(el.value);
    }
  }
  function setEditorMode(mode) {
    editorMode = mode === "simple" ? "simple" : "custom";
    var simple = document.querySelector("[data-simple-box]");
    var custom = document.querySelector("[data-key]");
    if (simple) simple.classList.toggle("hidden", editorMode !== "simple");
    if (custom) custom.classList.toggle("hidden", editorMode === "simple");
    document.querySelectorAll("[data-editor-mode]").forEach(function (b) {
      b.classList.toggle(
        "active",
        b.getAttribute("data-editor-mode") === editorMode,
      );
    });
    if (editorMode === "simple") syncSimple();
    else if (custom) setDraft(custom.value);
  }
  function currentPropertyKind() {
    var def = (state && state.propertyDefinition) || {};
    return def.kind || def.editor || def.type || "text";
  }
  function typeEditorTag(kind) {
    return (
      "flow-" +
      String(kind || "text")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-") +
      "-editor"
    );
  }
  function hasTypeEditor(kind) {
    return !!customElements.get(typeEditorTag(kind));
  }
  function itemKind(def) {
    var item = (def && def.items) || {};
    return item.kind || item.editor || item.type || "";
  }
  function propertyTypeLabel(def) {
    def = def || {};
    var kind = def.kind || def.editor || def.type || "text";
    if (kind === "array") {
      var item = itemKind(def);
      return item ? "array<" + item + ">" : "array";
    }
    var type = def.type || "";
    return kind + (type && type !== kind ? ":" + type : "");
  }
  function baseValueType(def) {
    var type = String(
      (def && (def.type || def.kind)) || "unknown",
    ).toLowerCase();
    if (type.indexOf("array") === 0) return "array";
    return type;
  }
  function pickedText(path) {
    if (state && state.mode === "picker") {
      var info = state.info || {};
      var props = pickerProps(
        info,
        info.propertyDefinitions || {},
        stateDefinition(),
      );
      var target = pickerProperty(props);
      var kind = pickerKind(target);
      return kind === "path" || kind === "expression"
        ? path
        : "{{ " + path + " }}";
    }
    return path;
  }
  function pickerProps(info, defs, node) {
    return propOrder(info, defs, node)
      .filter(function (k) {
        var d = defs[k] || {};
        return !d.readOnly && ["id", "block", "comment"].indexOf(k) < 0;
      })
      .map(function (k) {
        return { key: k, def: defs[k] || {}, value: propValue(node, k) };
      });
  }
  function pickerKind(prop) {
    var d = (prop && prop.def) || {};
    return d.kind || d.editor || d.type || "text";
  }
  function pickerType(prop) {
    return propertyTypeLabel((prop && prop.def) || {});
  }
  function pickerLabel(prop) {
    return (prop.def && prop.def.label) || prop.key;
  }
  function pickerDefaultProperty(props) {
    var preferred = [
      "value",
      "template",
      "expression",
      "expr",
      "from",
      "items",
      "condition",
      "body",
      "request",
      "requestable",
      "path",
      "out",
    ];
    for (var i = 0; i < preferred.length; i++) {
      for (var j = 0; j < props.length; j++) {
        if (props[j].key === preferred[i]) return props[j].key;
      }
    }
    return props.length ? props[0].key : "";
  }
  function pickerProperty(props) {
    for (var i = 0; i < props.length; i++) {
      if (props[i].key === pickerTarget) return props[i];
    }
    return null;
  }
  function targetType(prop) {
    return baseValueType((prop && prop.def) || {});
  }
  function isScalarType(type) {
    return (
      type === "string" ||
      type === "number" ||
      type === "integer" ||
      type === "boolean"
    );
  }
  function entryType(entry) {
    return typeof entry === "string"
      ? "unknown"
      : String(entry.type || "unknown").toLowerCase();
  }
  function acceptsPath(prop, entry) {
    if (!prop || pickerKind(prop) === "path") return true;
    var wanted = targetType(prop);
    if (!wanted || wanted === "unknown") return true;
    var actual = entryType(entry);
    if (isScalarType(wanted) && (actual === "object" || actual === "array"))
      return false;
    if (wanted === "array" && actual === "object") return false;
    if (wanted === "object" && actual === "array") return false;
    return true;
  }
  function selectPickerTarget(key) {
    pickerTarget = key || "";
    pickerLastTarget = "";
    render();
  }
  function updatePickerValue(value, refreshEditor) {
    pickerValue = value == null ? "" : String(value);
    var input = document.querySelector("[data-picker-value]");
    if (input && input.value !== pickerValue) input.value = pickerValue;
    if (refreshEditor === false) return;
    var editor = document.querySelector("[data-picker-editor]");
    if (editor && editor.setState && editor.value !== pickerValue) {
      pickerUpdatingEditor = true;
      editor.setState(
        pickerEditorState(
          pickerProperty(
            pickerProps(
              (state && state.info) || {},
              (state && state.info && state.info.propertyDefinitions) || {},
              stateDefinition(),
            ),
          ),
        ),
      );
      pickerUpdatingEditor = false;
    }
  }
  function resetPickerValue() {
    updatePickerValue(pickerOriginal);
  }
  function pickerEditorState(prop) {
    var next = {};
    keys(state || {}).forEach(function (k) {
      next[k] = state[k];
    });
    next.mode = "property";
    next.property = prop.key;
    next.propertyDefinition = prop.def || {};
    next.value = pickerValue;
    return next;
  }
  function typeEditorState(source) {
    var next = {};
    keys(source || {}).forEach(function (key) {
      next[key] = source[key];
    });
    var nodePath = flowNodePath(next.virtualPath);
    if (nodePath && next.property) {
      var response = hostRequest("context", {
        path: nodePath,
        property: next.property,
      });
      if (response && response.ok && response.context) {
        next.context = response.context;
      }
    }
    next.context = itemCurrentContext(next.context, next);
    return next;
  }
  function contextScopePaths(context, scope) {
    var bucket = context && context.scopes && context.scopes[scope];
    if (!bucket) return [];
    return Array.isArray(bucket) ? bucket : bucket.paths || [];
  }
  function entryPath(entry) {
    return typeof entry === "string" ? entry : entry && entry.path;
  }
  function entryWithPath(entry, path) {
    if (typeof entry === "string") return path;
    var out = {};
    keys(entry || {}).forEach(function (key) {
      out[key] = entry[key];
    });
    out.path = path;
    return out;
  }
  function pathExists(entries, path) {
    return entries.some(function (entry) {
      return entryPath(entry) === path;
    });
  }
  function itemCurrentContext(context, editorState) {
    var def = (editorState && editorState.propertyDefinition) || {};
    if (String(def.current || "") !== "item") return context;
    var node = objectValue(editorState && editorState.definition);
    var sourceKey = String(def.sourceProperty || def.relativeTo || "items");
    var sourcePath = node[sourceKey];
    if ((sourcePath === undefined || sourcePath === null || sourcePath === "") && sourceKey === "items") {
      sourcePath = node["in"];
    }
    sourcePath = typeof sourcePath === "string" ? sourcePath : "";
    if (!sourcePath || !context || !context.scopes) return context;
    var itemPrefix = sourcePath + "[0]";
    var currentPaths = [];
    keys(context.scopes).forEach(function (scope) {
      contextScopePaths(context, scope).forEach(function (entry) {
        var path = entryPath(entry);
        if (path === itemPrefix) {
          currentPaths.push(entryWithPath(entry, "current"));
        } else if (path && path.indexOf(itemPrefix + ".") === 0) {
          currentPaths.push(entryWithPath(entry, "current" + path.substring(itemPrefix.length)));
        }
      });
    });
    if (!currentPaths.length) return context;
    var out = {};
    keys(context).forEach(function (key) {
      out[key] = context[key];
    });
    out.scopes = {};
    keys(context.scopes).forEach(function (scope) {
      var bucket = context.scopes[scope];
      out.scopes[scope] = Array.isArray(bucket)
        ? bucket.slice()
        : Object.assign({}, bucket);
    });
    var deduped = [];
    currentPaths.forEach(function (entry) {
      if (!pathExists(deduped, entryPath(entry))) deduped.push(entry);
    });
    out.scopes.current = Array.isArray(context.scopes.current)
      ? deduped
      : Object.assign({}, context.scopes.current || {}, { paths: deduped });
    return out;
  }
  function attachPickerEditor(prop) {
    if (!prop) return false;
    var editor = document.querySelector("[data-picker-editor]");
    if (editor && editor.setState) {
      window.flowHost = {
        request: hostRequest,
        setValue: updatePickerValue,
      };
      editor.flowHost = window.flowHost;
      editor.setState(typeEditorState(pickerEditorState(prop)));
      editor.addEventListener("flow-value", function (e) {
        if (!pickerUpdatingEditor)
          updatePickerValue(e.detail && e.detail.value, false);
      });
      return true;
    }
    return false;
  }
  function field(key, def, node) {
    def = def || {};
    var kind = def.kind || "text";
    var value = propValue(node, key);
    var rows =
      kind === "template" ||
      kind === "expression" ||
      kind === "value" ||
      value.length > 80 ||
      value.indexOf("\n") >= 0
        ? "textarea"
        : "input";
    var ro = def.readOnly || key === "id" || key === "block";
    var html =
      '<div class="field"><label>' +
      esc(def.label || key) +
      ' <span class="kind">' +
      esc(propertyTypeLabel(def)) +
      "</span></label>";
    if (def.description || def.shortDescription)
      html +=
        '<div class="desc">' +
        esc(def.description || def.shortDescription) +
        "</div>";
    if (rows === "textarea")
      html +=
        '<textarea data-key="' +
        esc(key) +
        '" data-kind="' +
        esc(kind) +
        '" ' +
        (ro ? "readonly" : "") +
        ">" +
        esc(value) +
        "</textarea>";
    else
      html +=
        '<input data-key="' +
        esc(key) +
        '" data-kind="' +
        esc(kind) +
        '" value="' +
        esc(value) +
        '" ' +
        (ro ? "readonly" : "") +
        ">";
    if (!ro)
      html +=
        '<div class="actions"><button data-apply="' +
        esc(key) +
        '">Apply</button><button class="secondary" data-reset="' +
        esc(key) +
        '">Reset</button></div>';
    return html + "</div>";
  }
  function propertyField() {
    var def = state.propertyDefinition || {};
    var key = state.property || "";
    var kind = def.kind || def.editor || "text";
    var value = state.value == null ? "" : String(state.value);
    var label = def.label || key || "value";
    var html =
      '<div class="field"><label>' +
      esc(label) +
      ' <span class="kind">' +
      esc(propertyTypeLabel(def)) +
      "</span></label>";
    if (def.description || def.shortDescription)
      html +=
        '<div class="desc">' +
        esc(def.description || def.shortDescription) +
        "</div>";
    if (hasTypeEditor(kind)) {
      var tag = typeEditorTag(kind);
      return (
        html +
        "<" +
        tag +
        ' data-key="' +
        esc(key) +
        '" data-kind="' +
        esc(kind) +
        '"></' +
        tag +
        "></div>"
      );
    }
    var simple = templateLike(kind);
    if (simple) editorMode = simpleCandidate(value) ? "simple" : "custom";
    if (simple) {
      var p = simpleParts(value);
      html +=
        '<div class="modebar"><button data-editor-mode="simple" class="' +
        (editorMode === "simple" ? "active" : "") +
        '">Simple</button><button data-editor-mode="custom" class="secondary ' +
        (editorMode === "custom" ? "active" : "") +
        '">Custom</button></div>';
      html +=
        '<div data-simple-box class="simple ' +
        (editorMode === "simple" ? "" : "hidden") +
        '"><label><span class="simpleLabel">Prefix</span><input data-simple="prefix" placeholder="expression prefix" value="' +
        esc(p.prefix) +
        '"></label><label><span class="simpleLabel">Pick</span><input data-simple="pick" placeholder="select a scope path" value="' +
        esc(p.path) +
        '" readonly></label><label><span class="simpleLabel">Suffix</span><input data-simple="suffix" placeholder="expression suffix" value="' +
        esc(p.suffix) +
        '"></label></div><div class="desc">Prefix, pick and suffix are concatenated inside {{ expression }}.</div>';
    }
    html +=
      '<textarea data-key="' +
      esc(key) +
      '" data-kind="' +
      esc(kind) +
      '" class="' +
      (simple && editorMode === "simple" ? "hidden" : "") +
      '">' +
      esc(value) +
      "</textarea>";
    return html + "</div>";
  }
  function pathList(ctx) {
    var out = [];
    var scopes = (ctx && ctx.scopes) || {};
    keys(scopes).forEach(function (scope) {
      var bucket = scopes[scope];
      var paths = Array.isArray(bucket) ? bucket : bucket.paths || [];
      out.push({ scope: scope, paths: paths });
    });
    return out;
  }
  function pathGroups(target) {
    var html = "";
    pathList(state.context).forEach(function (group) {
      var rows = (group.paths || []).filter(function (p) {
        return acceptsPath(target, p);
      });
      if (!rows.length) return;
      html +=
        '<details class="scopeGroup"><summary>' +
        esc(group.scope) +
        ' <span class="type">' +
        rows.length +
        "</span></summary>";
      rows.forEach(function (p) {
        var label = typeof p === "string" ? p : p.path;
        var type = typeof p === "string" ? "" : p.type || "";
        html +=
          '<button draggable="true" class="path" data-path="' +
          esc(label) +
          '">' +
          esc(label) +
          (type ? ' <span class="type">' + esc(type) + "</span>" : "") +
          "</button>";
      });
      html += "</details>";
    });
    return html || '<div class="empty">No compatible value known yet.</div>';
  }
  function side() {
    var html =
      '<div class="side"><h1>Scope picker</h1><div class="sub">Click to insert into the focused editor.</div>';
    pathList(state.context).forEach(function (group) {
      html += '<div class="scopeTitle">' + esc(group.scope) + "</div>";
      group.paths.forEach(function (p) {
        var label = typeof p === "string" ? p : p.path;
        var type = typeof p === "string" ? "" : p.type || "";
        html +=
          '<button draggable="true" class="path" data-path="' +
          esc(label) +
          '">' +
          esc(label) +
          (type ? ' <span class="type">' + esc(type) + "</span>" : "") +
          "</button>";
      });
    });
    return html + "</div>";
  }
  function attachTypeEditor() {
    var tag = typeEditorTag(currentPropertyKind());
    var editor = document.querySelector(tag + "[data-key]");
    if (editor && editor.setState) {
      window.flowHost = { request: hostRequest, setValue: setDraft };
      editor.flowHost = window.flowHost;
      editor.setState(typeEditorState(state));
      focusKey = editor.getAttribute("data-key");
      editor.addEventListener("flow-value", function (e) {
        setDraft(e.detail && e.detail.value);
      });
      editor.addEventListener("flow-values", function (e) {
        var d = e.detail || {};
        if (d.value !== undefined) setDraft(d.value);
        send({ type: "values", value: d.value, values: d.values || {} });
      });
      setDraft(editor.value || "");
      return true;
    }
    return false;
  }
  function renderProperty(app) {
    var node = stateDefinition();
    var title = state.summary || node.id || state.virtualPath || "Flow node";
    var custom = hasTypeEditor(currentPropertyKind());
    var html =
      '<div class="wrap ' +
      (custom ? "single" : "") +
      '"><div class="main"><h1>' +
      esc(title) +
      '</h1><div class="sub">' +
      esc(
        (state.flowQName || "") +
          " " +
          (state.virtualPath || "") +
          " / " +
          (state.property || ""),
      ) +
      "</div>" +
      propertyField() +
      "</div>" +
      (custom ? "" : side()) +
      "</div>";
    app.className = "";
    app.innerHTML = html;
    if (attachTypeEditor()) return;
    var el = document.querySelector("[data-key]");
    if (el) {
      focusKey = el.getAttribute("data-key");
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      draft = el.value;
      send({ type: "value", value: draft });
    }
  }
  function renderPicker(app) {
    var node = stateDefinition();
    var info = state.info || {};
    var defs = info.propertyDefinitions || {};
    var props = pickerProps(info, defs, node);
    if (props.length && !pickerProperty(props))
      pickerTarget = pickerDefaultProperty(props);
    var target = pickerProperty(props);
    if (target && pickerLastTarget !== pickerTarget) {
      pickerValue = target.value;
      pickerOriginal = target.value;
      pickerLastTarget = pickerTarget;
    }
    var custom = target && hasTypeEditor(pickerKind(target));
    var html =
      '<div class="picker"><div class="pickerHeader"><h1>' +
      esc(state.summary || node.id || state.virtualPath || "Flow picker") +
      '</h1><div class="sub">' +
      esc((state.flowQName || "") + " " + (state.virtualPath || "")) +
      "</div>";
    if (props.length) {
      html += '<div class="target"><div class="propList">';
      props.forEach(function (prop) {
        html +=
          '<button class="prop ' +
          (prop.key === pickerTarget ? "active" : "") +
          '" data-picker-property-button="' +
          esc(prop.key) +
          '"><span>' +
          esc(pickerLabel(prop)) +
          '</span><span class="type">' +
          esc(pickerType(prop)) +
          "</span></button>";
      });
      html +=
        "</div>" +
        (state.applied
          ? '<div class="applied">Applied ' +
            esc(state.applied.property || "") +
            "</div>"
          : "") +
        "</div>";
    }
    if (custom) {
      var tag = typeEditorTag(pickerKind(target));
      html +=
        '<div class="pickerEditor"><' +
        tag +
        ' data-picker-editor="true"></' +
        tag +
        '></div><div class="pickerActions"><button data-apply-picked="true">Apply</button><button class="secondary" data-cancel-picked="true">Cancel</button></div>';
    } else {
      html +=
        '<div class="copybar"><input data-picker-value value="' +
        esc(pickerValue) +
        '" placeholder="pick a value"><button data-apply-picked="true">' +
        (pickerTarget ? "Apply" : "Copy") +
        "</button>" +
        (pickerTarget
          ? '<button class="secondary" data-cancel-picked="true">Cancel</button>'
          : "") +
        "</div>";
    }
    html += "</div>" + (custom ? "" : pathGroups(target));
    app.className = "";
    app.innerHTML = html + "</div>";
    if (custom) attachPickerEditor(target);
  }
  function renderObject(app) {
    var node = stateDefinition();
    var info = state.info || {};
    var defs = info.propertyDefinitions || {};
    var ordered = propOrder(info, defs, node);
    var html =
      '<div class="wrap"><div class="main"><h1>' +
      esc(state.summary || node.id || state.virtualPath || "Flow node") +
      '</h1><div class="sub">' +
      esc(state.flowQName || "") +
      " " +
      esc(state.virtualPath || "") +
      "</div>";
    html += field(
      "id",
      {
        label: "id",
        kind: "text",
        description: "Stable node identifier.",
      },
      node,
    );
    html += field(
      "block",
      {
        label: "block",
        kind: "text",
        description: "Block implementation.",
      },
      node,
    );
    if (node.comment !== undefined || state.virtualKind === "node")
      html += field(
        "comment",
        {
          label: "Comment",
          kind: "text",
          description: "Treeview comment.",
        },
        node,
      );
    ordered.forEach(function (k) {
      html += field(k, defs[k], node);
    });
    html += "</div>" + side() + "</div>";
    app.className = "";
    app.innerHTML = html;
  }
  function render() {
    var app = document.getElementById("app");
    if (!state) {
      app.className = "empty";
      app.textContent = "Select a Flow node.";
      return;
    }
    if (state.error) {
      app.className = "error";
      app.textContent = state.error;
      return;
    }
    if (state.mode === "property") {
      renderProperty(app);
    } else if (state.mode === "picker") {
      renderPicker(app);
    } else {
      renderObject(app);
    }
  }
  function input(key) {
    return document.querySelector(
      '[data-key="' + key.replace(/[^A-Za-z0-9_-]/g, "\\$&") + '"]',
    );
  }
  function changeValue(el) {
    if (state && state.mode === "property" && el) {
      setDraft(el.value);
    }
  }
  document.addEventListener("focusin", function (e) {
    var k =
      e.target && e.target.getAttribute && e.target.getAttribute("data-key");
    if (k) focusKey = k;
  });
  document.addEventListener("input", function (e) {
    var k =
      e.target && e.target.getAttribute && e.target.getAttribute("data-key");
    if (k) changeValue(e.target);
    if (
      e.target &&
      e.target.getAttribute &&
      e.target.getAttribute("data-simple") !== null
    )
      syncSimple();
    if (
      e.target &&
      e.target.getAttribute &&
      e.target.getAttribute("data-picker-value") !== null
    )
      pickerValue = e.target.value;
  });
  document.addEventListener("dragstart", function (e) {
    var path = e.target.getAttribute && e.target.getAttribute("data-path");
    if (path && e.dataTransfer) {
      e.dataTransfer.setData(
        "text/plain",
        state && state.mode === "picker" ? pickedText(path) : path,
      );
    }
  });
  document.addEventListener("click", function (e) {
    var mode =
      e.target.getAttribute && e.target.getAttribute("data-editor-mode");
    if (mode) {
      setEditorMode(mode);
      return;
    }
    var propertyButton =
      e.target.closest && e.target.closest("[data-picker-property-button]");
    if (propertyButton) {
      selectPickerTarget(
        propertyButton.getAttribute("data-picker-property-button") || "",
      );
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-cancel-picked")) {
      resetPickerValue();
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-apply-picked")) {
      var val = document.querySelector("[data-picker-value]");
      var value = val ? val.value : pickerValue;
      if (pickerTarget)
        send({
          type: "setProperty",
          property: pickerTarget,
          value: value,
        });
      else send({ type: "copy", value: value });
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-copy-picked")) {
      var val = document.querySelector("[data-picker-value]");
      send({ type: "copy", value: val ? val.value : pickerValue });
      return;
    }
    var apply = e.target.getAttribute && e.target.getAttribute("data-apply");
    if (apply) {
      var el = input(apply);
      send({
        type: "setProperty",
        property: apply,
        value: el ? el.value : "",
      });
      return;
    }
    var reset = e.target.getAttribute && e.target.getAttribute("data-reset");
    if (reset) {
      var el = input(reset);
      if (el) {
        el.value = propValue(stateDefinition(), reset);
        changeValue(el);
      }
      return;
    }
    var path = e.target.getAttribute && e.target.getAttribute("data-path");
    if (path) {
      if (state && state.mode === "picker") {
        updatePickerValue(pickedText(path));
        return;
      }
      var el = focusKey && input(focusKey);
      if (el) {
        var kind = el.getAttribute("data-kind") || "";
        if (editorMode === "simple" && templateLike(kind)) {
          var pick = document.querySelector('[data-simple="pick"]');
          if (pick) {
            pick.value = path;
            syncSimple();
            return;
          }
        }
        var text =
          kind === "template" || kind === "value" ? "{{ " + path + " }}" : path;
        var s = el.selectionStart || 0;
        var epos = el.selectionEnd || s;
        el.value = el.value.slice(0, s) + text + el.value.slice(epos);
        el.focus();
        el.selectionStart = el.selectionEnd = s + text.length;
        changeValue(el);
      }
      return;
    }
  });
  window.receiveFromJava = function (message) {
    if (!state || !message || state.virtualPath !== message.virtualPath) {
      pickerValue = "";
      pickerTarget = "";
      pickerOriginal = "";
      pickerLastTarget = "";
    }
    state = message || {};
    if (state.applied) {
      pickerTarget = state.applied.property || pickerTarget;
      pickerValue =
        state.applied.value == null ? "" : String(state.applied.value);
      pickerOriginal = pickerValue;
      pickerLastTarget = pickerTarget;
    }
    draft = state.value == null ? "" : String(state.value);
    render();
  };
})();
