/*\
title: $:/plugins/crosseye/simple-outline/widgets/simple-outline.js
type: application/javascript
module-type: widget

Simple collapsible outline widget.

Usage:
  <$simple-outline text="""
  !! Section header
    + tiddler-name
    Group label
      + another-tiddler
  """ class="outline"/>

  or via transclusion/variable:
  <$simple-outline text={{MyOutlineTiddler}} class="my-outline"/>

  with a summary template:
  <$simple-outline text="""...""" summary-template="My Summary Template"/>

Input format:
  !! prefix    → section header (h2)
  + prefix     → tiddler reference (reads summary/caption + text fields)
  plain text   → structural group node (collapsible if it has children)
  indentation  → nesting (children are indented under their parent)
  :: separator → display text :: tiddler title (overrides display label)

summary-template:
  Title of a tiddler to render inside each <summary> element for tiddler items.
  Two variables are set when the template is rendered:
    currentTiddler — the item tiddler title
    so-label       — the pre-computed label (summary → caption → display fallback)
  When absent, so-label is used as plain text.
\*/
(function() {
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

//-- Parser (adapted from raw-js/index.js) ------------------------------------

function sanitize(str) {
	return str.trim().replace(/\n\s*\n/g, "\n");
}

function cut(str, ch) {
	var pos = str.indexOf(ch);
	return pos === -1 ? [str, ""] : [str.slice(0, pos), str.slice(pos + 1)];
}

function outdent(str) {
	var spaces = Math.max(0, str.search(/\S/));
	var re = new RegExp("(^|\\n)[ \\t]{" + spaces + "}", "g");
	return str.replace(re, "$1");
}

function makeChildren(str) {
	return str === "" ? [] : str.split(/\n(?!\s)/).map(makeNode);
}

function makeNode(str) {
	var parts = cut(str, "\n");
	return {value: parts[0].trim(), children: makeChildren(outdent(parts[1]))};
}

function extract(node) {
	var v       = node.value;
	var header  = v.startsWith("!!");
	var tidLink = v.startsWith("+");
	var content = v.slice(tidLink ? 1 : header ? 2 : 0).trim();
	var parts   = content.split("::").map(function(s) { return s.trim(); });
	return {
		value:    content,
		header:   header,
		tidLink:  tidLink,
		display:  parts[0],
		tiddler:  parts.length > 1 ? parts[1] : parts[0],
		children: node.children.map(extract)
	};
}

//-- Widget -------------------------------------------------------------------

var SimpleOutlineWidget = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

SimpleOutlineWidget.prototype = new Widget();

SimpleOutlineWidget.prototype.render = function(parent, nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
	this.referencedTiddlers = [];

	// summaryTargets: [{label, tiddlerTitle, domNode}]
	// Filled during the tree walk when summary-template is in use.
	this.summaryTargets = [];
	// contentTargets: [{tiddlerTitle, domNode}]
	// Filled for every tiddler item that has expandable content.
	this.contentTargets = [];

	this.summaryTemplate = this.getAttribute("summary-template", "");
	if(this.summaryTemplate) {
		this.referencedTiddlers.push(this.summaryTemplate);
	}

	var container = this.document.createElement("div");
	container.className = this.getAttribute("class", "outline");

	var text = this.getAttribute("text", "");
	if(text.trim()) {
		var tree = makeChildren(sanitize(text)).map(extract);
		this.renderTree(tree, container, 0);
	}

	parent.insertBefore(container, nextSibling);
	this.domNodes.push(container);

	// Build one combined parse tree and create all child widgets in a single
	// makeChildWidgets call.  summaryTargets come first (indices 0..s-1),
	// contentTargets follow (indices s..end).
	var self = this;
	var allNodes = [];

	this.summaryTargets.forEach(function(t) {
		// Wrap in two $set nodes so the template sees currentTiddler and so-label.
		allNodes.push({
			type: "set",
			attributes: {
				name:  {type: "string", value: "currentTiddler"},
				value: {type: "string", value: t.tiddlerTitle}
			},
			children: [{
				type: "set",
				attributes: {
					name:  {type: "string", value: "so-label"},
					value: {type: "string", value: t.label}
				},
				children: [{
					type: "transclude",
					attributes: {
						tiddler: {type: "string", value: self.summaryTemplate}
					},
					isBlock: false,
					children: []
				}]
			}]
		});
	});

	this.contentTargets.forEach(function(t) {
		allNodes.push({
			type: "transclude",
			attributes: {
				tiddler: {type: "string", value: t.tiddlerTitle}
			},
			isBlock: true,
			children: []
		});
	});

	if(allNodes.length) {
		this.makeChildWidgets(allNodes);
		var allTargets = this.summaryTargets.concat(this.contentTargets);
		this.children.forEach(function(child, i) {
			child.render(allTargets[i].domNode, null);
		});
	}
};

SimpleOutlineWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(Object.keys(changedAttributes).length > 0) {
		this.refreshSelf();
		return true;
	}
	// Re-render the whole outline if a referenced tiddler changed structurally
	// (e.g. text went from empty to non-empty, or tiddler appeared/disappeared,
	// or the summary-template tiddler itself changed).
	var needsRefresh = this.referencedTiddlers.some(function(title) {
		return !!changedTiddlers[title];
	});
	if(needsRefresh) {
		this.refreshSelf();
		return true;
	}
	// Otherwise let the transclude children refresh themselves in place.
	return this.refreshChildren(changedTiddlers);
};

//-- Tree rendering -----------------------------------------------------------

SimpleOutlineWidget.prototype.renderTree = function(nodes, parent, level) {
	var self = this;
	nodes.forEach(function(node) {
		self.renderNode(node, parent, level);
	});
};

SimpleOutlineWidget.prototype.renderNode = function(node, parent, level) {
	var self   = this;
	var cls    = "level-" + level;
	var doc    = this.document;
	var el, summary, contentDiv, p, h2;

	if(node.children.length) {
		if(node.header) {
			// !! Section header with children
			el = doc.createElement("div");
			el.className = cls;
			h2 = doc.createElement("h2");
			h2.textContent = node.value;
			el.appendChild(h2);
			self.renderTree(node.children, el, level + 1);
		} else {
			// Plain group node — collapsible
			el = doc.createElement("details");
			el.className = cls;
			summary = doc.createElement("summary");
			if(self.summaryTemplate) {
				// Mirror the so-label/so-toggle structure the template produces,
				// so the same CSS rules apply to group nodes.
				var labelSpan = doc.createElement("span");
				labelSpan.className = "so-label";
				labelSpan.textContent = node.value;
				var toggleSpan = doc.createElement("span");
				toggleSpan.className = "so-toggle";
				summary.appendChild(labelSpan);
				summary.appendChild(toggleSpan);
			} else {
				summary.textContent = node.value;
			}
			el.appendChild(summary);
			self.renderTree(node.children, el, level + 1);
		}
		parent.appendChild(el);

	} else if(node.tidLink) {
		// + tiddler reference
		var tid = self.wiki.getTiddler(node.tiddler);
		self.referencedTiddlers.push(node.tiddler);

		var label = tid
			? (tid.fields.summary || tid.fields.caption || node.display)
			: node.display;
		var hasContent = tid && tid.fields.text && tid.fields.text.trim();

		if(hasContent) {
			el = doc.createElement("details");
			el.className = cls;
			summary = doc.createElement("summary");
			// If a summary-template is set, the template will be rendered into
			// this summary element by the child widget machinery below; otherwise
			// just set plain text.
			if(self.summaryTemplate) {
				self.summaryTargets.push({label: label, tiddlerTitle: node.tiddler, domNode: summary});
			} else {
				summary.textContent = label;
			}
			el.appendChild(summary);
			contentDiv = doc.createElement("div");
			contentDiv.className = "ltgraybox";
			el.appendChild(contentDiv);
			self.contentTargets.push({tiddlerTitle: node.tiddler, domNode: contentDiv});
		} else {
			el = doc.createElement("div");
			el.className = cls + " item";
			p = doc.createElement("p");
			p.textContent = label;
			el.appendChild(p);
		}
		parent.appendChild(el);

	} else {
		// Plain label (leaf, no + prefix)
		el = doc.createElement("div");
		el.className = cls;
		el.textContent = node.value;
		parent.appendChild(el);
	}
};

exports["simple-outline"] = SimpleOutlineWidget;

})();
