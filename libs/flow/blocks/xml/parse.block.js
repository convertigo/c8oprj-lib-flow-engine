const _meta = {
  "version": 1,
  "icon": "mdi:xml",
  "description": "Parses raw XML text into the Convertigo JSON shape; XML attributes are exposed under attr (for example enclosure.attr.url).",
  "longDescription": "Pass the text returned by asset.read or the content field of a resource envelope. Element attributes are grouped under attr, for example <enclosure url=\"...\"> becomes enclosure.attr.url. This block rejects resource metadata objects so path and content mistakes fail explicitly.",
  "properties": {
    "text": {
      "label": "text",
      "kind": "template",
      "type": "string",
      "default": "{{ local.text }}",
      "description": "XML text to parse."
    },
    "out": {
      "label": "out",
      "kind": "path",
      "mode": "write",
      "default": "local.xml",
      "description": "Scope path receiving the parsed XML object."
    }
  },
  "outputs": {
    "out": {
      "type": "object"
    }
  },
  "runtime": "rhino",
  "hooks": {
    "file": "parse.hooks.js"
  },
  "tags": [
    "xml",
    "parse"
  ]
}

(function () {
	var DocumentBuilderFactory = Packages.javax.xml.parsers.DocumentBuilderFactory;
	var InputSource = Packages.org.xml.sax.InputSource;
	var StringReader = Packages.java.io.StringReader;

	function tryFeature(factory, feature, value) {
		try {
			factory.setFeature(feature, value);
		} catch (e) {
		}
	}

	function parseXml(text) {
		var factory = DocumentBuilderFactory.newInstance();
		factory.setNamespaceAware(true);
		tryFeature(factory, "http://apache.org/xml/features/disallow-doctype-decl", true);
		tryFeature(factory, "http://xml.org/sax/features/external-general-entities", false);
		tryFeature(factory, "http://xml.org/sax/features/external-parameter-entities", false);
		tryFeature(factory, "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
		try {
			factory.setXIncludeAware(false);
		} catch (e) {
		}
		factory.setExpandEntityReferences(false);
		return factory.newDocumentBuilder().parse(new InputSource(new StringReader(String(text))));
	}

	function nodeName(node) {
		return String(node.getNodeName());
	}

	function addChild(target, key, value) {
		if (target[key] === undefined) {
			target[key] = value;
		} else if (Object.prototype.toString.call(target[key]) === "[object Array]") {
			target[key].push(value);
		} else {
			target[key] = [target[key], value];
		}
	}

	function elementValue(element) {
		var output = {};
		var attrs = element.getAttributes();
		if (attrs && attrs.getLength && attrs.getLength() > 0) {
			output.attr = {};
			for (var a = 0; a < attrs.getLength(); a++) {
				var attr = attrs.item(a);
				output.attr[nodeName(attr)] = String(attr.getNodeValue());
			}
		}

		var text = "";
		var hasElement = false;
		var children = element.getChildNodes();
		for (var i = 0; i < children.getLength(); i++) {
			var child = children.item(i);
			var type = Number(child.getNodeType());
			if (type === 1) {
				hasElement = true;
				addChild(output, nodeName(child), elementValue(child));
			} else if (type === 3 || type === 4) {
				text += String(child.getNodeValue());
			}
		}

		text = String(text).trim();
		if (!hasElement && !output.attr) {
			return text;
		}
		if (text || (!hasElement && output.attr)) {
			output.text = text;
		}
		return output;
	}

	function documentValue(doc) {
		var root = doc.getDocumentElement();
		var output = {};
		output[nodeName(root)] = elementValue(root);
		return output;
	}

	return {
		run: function (ctx, node) {
			var props = ctx.props(node);
			var text = ctx.template(props.text);
			if (text === undefined || text === null || text === "") {
				return {};
			}
			if (typeof text === "object") {
				throw new Error("xml.parse expects raw XML text, not a resource object. Use asset.read({ path: \"libs/flow/resources/...\" }) in Flow code, or pass resource.get(...).content.");
			}
			var parsed = documentValue(parseXml(text));
			if (props.out && ctx.learnOutputSchema) {
				ctx.learnOutputSchema(node, "out", props.out, parsed);
			}
			return parsed;
		}
	};
}())
