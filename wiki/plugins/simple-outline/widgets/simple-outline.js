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
    so-label       — the pre-computed label (label-fields chain, then display fallback)
  When absent, so-label is used as plain text.

detail-template:
  Title of a tiddler to render as the expanded body for tiddler items.
  The same two variables are set: currentTiddler and so-label.
  When absent, the tiddler's own body is transcluded directly.

group-template:
  Title of a tiddler to render inside each <summary> element for plain group
  nodes (collapsible labels that are not tiddler items).  One variable is set:
    so-label — the group label text
  currentTiddler is not set — group nodes have no associated tiddler.
  When absent, so-label is rendered as plain text.

header-template:
  Title of a tiddler to render inside !! section header divs, replacing the
  default <h2>.  One variable is set:
    so-label — the header text
  When absent, an <h2> is used.

tiddler-link:
  When non-empty, adds a small link on the summary row for every tiddler item
  (expandable and leaf alike).  The link navigates to the tiddler without
  toggling the outline node.  It is appended inline inside .so-label so it flows right after the text,
  including when the label wraps to multiple lines.  A stopPropagation handler
  prevents the click from reaching the native toggle.
  tiddler-link-label: glyph or text for the link (default ✳ U+2731).

open-depth:
  Integer.  Nodes at levels 0 through open-depth-1 are open by default on
  first render (i.e. when no saved state tiddler exists yet).  Explicit user
  toggles always take precedence over the default.  Default: 0 (all closed).

label-fields:
  Space-separated list of tiddler field names tried in order to produce the
  display label for each tiddler item.  The first non-empty value wins; the
  outline's display text is the final fallback.
  Default: "summary caption" (preserves prior behaviour).

Disclosure arrows:
  Each collapsible <summary> receives two child spans:
    .so-arrow-closed  — rendered via <<toc-closed-icon>> ($:/core/images/right-arrow)
    .so-arrow-open    — rendered via <<toc-open-icon>>   ($:/core/images/down-arrow)
  CSS controls visibility based on details[open].  Custom styles that supply
  their own arrow mechanism should hide both spans with display:none !important.

Session state:
  Open/closed state is stored in tiddlers under $:/state/simple-outline/<qualification>/<path>
  using the same <<qualification>> variable the core TOC macros use.  Path segments
  are the node label or tiddler title, so state survives reordering.  Navigating
  away and back restores the tree to the same open/closed positions.
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

//-- Parse tree node helpers --------------------------------------------------

function macroAttr(name) {
	return {type: "macro", value: {name: name, params: []}};
}

function transcludeNode(tiddlerAttr, isBlock) {
	return {
		type: "transclude",
		attributes: {tiddler: tiddlerAttr},
		isBlock: !!isBlock,
		children: []
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
	// groupTargets: [{label, domNode}]
	// Filled during the tree walk when group-template is in use.
	this.groupTargets = [];
	// headerTargets: [{label, domNode}]
	// Filled during the tree walk when header-template is in use.
	this.headerTargets = [];
	// iconTargets: [{arrowDomNode}]
	// One entry per collapsible node; child widgets render the TW arrow icons.
	this.iconTargets = [];
	// contentTargets: [{tiddlerTitle, label, domNode}]
	// Filled for every tiddler item that has expandable content.
	this.contentTargets = [];

	this.summaryTemplate = this.getAttribute("summary-template", "");
	if(this.summaryTemplate) {
		this.referencedTiddlers.push(this.summaryTemplate);
	}
	this.groupTemplate = this.getAttribute("group-template", "");
	if(this.groupTemplate) {
		this.referencedTiddlers.push(this.groupTemplate);
	}
	this.headerTemplate = this.getAttribute("header-template", "");
	if(this.headerTemplate) {
		this.referencedTiddlers.push(this.headerTemplate);
	}
	this.detailTemplate = this.getAttribute("detail-template", "");
	if(this.detailTemplate) {
		this.referencedTiddlers.push(this.detailTemplate);
	}
	this.tiddlerLink = this.getAttribute("tiddler-link", "");
	this.tiddlerLinkLabel = this.getAttribute("tiddler-link-label", "\u2731");
	this.openDepth = parseInt(this.getAttribute("open-depth", "0"), 10) || 0;
	var labelFieldsAttr = this.getAttribute("label-fields", "summary caption");
	this.labelFields = labelFieldsAttr.trim().split(/\s+/).filter(Boolean);

	// Base path for state tiddlers.  <<qualification>> is a per-rendering-context
	// hash that the core TOC macros also use, ensuring instances in different
	// tiddlers don't share state.
	var qualification = this.getVariable("qualification", {defaultValue: ""});
	this.stateBase = "$:/state/simple-outline" + qualification;

	var container = this.document.createElement("div");
	container.className = this.getAttribute("class", "outline");

	var text = this.getAttribute("text", "");
	if(text.trim()) {
		var tree = makeChildren(sanitize(text)).map(extract);
		this.renderTree(tree, container, 0, "");
	}

	parent.insertBefore(container, nextSibling);
	this.domNodes.push(container);

	// Build allNodes and allDomNodes in parallel so we can render each child
	// widget into the right DOM node regardless of how many nodes each target
	// contributes (summary targets = 1 node, icon targets = 2, content = 1).
	var self = this;
	var allNodes    = [];
	var allDomNodes = [];

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
				children: [transcludeNode({type: "string", value: self.summaryTemplate}, false)]
			}]
		});
		allDomNodes.push(t.domNode);
	});

	// group-template: no currentTiddler (group nodes have no associated tiddler).
	this.groupTargets.forEach(function(t) {
		allNodes.push({
			type: "set",
			attributes: {
				name:  {type: "string", value: "so-label"},
				value: {type: "string", value: t.label}
			},
			children: [transcludeNode({type: "string", value: self.groupTemplate}, false)]
		});
		allDomNodes.push(t.domNode);
	});

	// header-template: no currentTiddler (header nodes have no associated tiddler).
	this.headerTargets.forEach(function(t) {
		allNodes.push({
			type: "set",
			attributes: {
				name:  {type: "string", value: "so-label"},
				value: {type: "string", value: t.label}
			},
			children: [transcludeNode({type: "string", value: self.headerTemplate}, false)]
		});
		allDomNodes.push(t.domNode);
	});

	this.iconTargets.forEach(function(t) {
		allNodes.push(transcludeNode(macroAttr("toc-closed-icon"), false));
		allDomNodes.push(t.arrowDomNode);
	});

	this.contentTargets.forEach(function(t) {
		if(self.detailTemplate) {
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
					children: [transcludeNode({type: "string", value: self.detailTemplate}, true)]
				}]
			});
		} else {
			allNodes.push(transcludeNode({type: "string", value: t.tiddlerTitle}, true));
		}
		allDomNodes.push(t.domNode);
	});

	if(allNodes.length) {
		this.makeChildWidgets(allNodes);
		this.children.forEach(function(child, i) {
			child.render(allDomNodes[i], null);
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
	// State tiddlers ($:/state/simple-outline/...) are intentionally NOT in
	// referencedTiddlers — toggling a node must not trigger a full re-render.
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

SimpleOutlineWidget.prototype.renderTree = function(nodes, parent, level, path) {
	var self = this;
	nodes.forEach(function(node) {
		self.renderNode(node, parent, level, path);
	});
};

// Add a single .so-arrow span to a <summary> element and register it as an
// icon target.  CSS rotates the icon 90° when details[open] — no show/hide.
SimpleOutlineWidget.prototype.addArrows = function(summary) {
	var arrow = this.document.createElement("span");
	arrow.className = "so-arrow";
	summary.appendChild(arrow);
	this.iconTargets.push({arrowDomNode: arrow});
};

// Wire up session-state persistence for a <details> element.
// stateTitle is a qualified tiddler title unique to this node's position.
// On render: restore open attribute from the state tiddler if present.
// On toggle: write/delete the state tiddler (does NOT trigger full re-render
// because state tiddlers are not in referencedTiddlers).
SimpleOutlineWidget.prototype.wireState = function(el, stateTitle, defaultOpen) {
	var wiki = this.wiki;
	var existing = wiki.getTiddlerText(stateTitle, "");
	if(existing === "open" || (defaultOpen && existing === "")) {
		el.setAttribute("open", "");
	}
	el.addEventListener("toggle", function() {
		if(el.open) {
			wiki.setText(stateTitle, "text", null, "open");
		} else {
			wiki.deleteTiddler(stateTitle);
		}
	});
};

SimpleOutlineWidget.prototype.renderNode = function(node, parent, level, path) {
	var self       = this;
	var cls        = "level-" + level;
	var doc        = this.document;
	// Use node label or tiddler title as path segment — stable across reordering.
	var key        = node.tidLink ? node.tiddler : node.value;
	var nodePath   = path + "/" + key;
	var stateTitle = this.stateBase + nodePath;
	var el, summary, contentDiv, p, h2, labelSpan, toggleSpan;

	if(node.children.length) {
		if(node.header) {
			// !! Section header with children
			el = doc.createElement("div");
			el.className = cls + " so-header";
			if(self.headerTemplate) {
				var headerTarget = doc.createElement("div");
				el.appendChild(headerTarget);
				self.headerTargets.push({label: node.value, domNode: headerTarget});
			} else {
				h2 = doc.createElement("h2");
				h2.textContent = node.value;
				el.appendChild(h2);
			}
			self.renderTree(node.children, el, level + 1, nodePath);
		} else {
			// Plain group node — collapsible
			el = doc.createElement("details");
			el.className = cls + " so-group";
			self.wireState(el, stateTitle, level < self.openDepth);
			summary = doc.createElement("summary");
			self.addArrows(summary);
			if(self.groupTemplate) {
				// group-template renders into summary; register for child widget.
				self.groupTargets.push({label: node.value, domNode: summary});
			} else if(self.summaryTemplate) {
				// Mirror the so-label/so-toggle structure the template produces,
				// so the same CSS rules apply to group nodes.
				labelSpan = doc.createElement("span");
				labelSpan.className = "so-label";
				labelSpan.textContent = node.value;
				toggleSpan = doc.createElement("span");
				toggleSpan.className = "so-toggle";
				summary.appendChild(labelSpan);
				summary.appendChild(toggleSpan);
			} else {
				labelSpan = doc.createElement("span");
				labelSpan.className = "so-label";
				labelSpan.textContent = node.value;
				summary.appendChild(labelSpan);
			}
			el.appendChild(summary);
			self.renderTree(node.children, el, level + 1, nodePath);
		}
		parent.appendChild(el);

	} else if(node.tidLink) {
		// + tiddler reference
		var tid = self.wiki.getTiddler(node.tiddler);
		self.referencedTiddlers.push(node.tiddler);

		var label = node.display;
		if(tid) {
			for(var i = 0; i < self.labelFields.length; i++) {
				var v = tid.fields[self.labelFields[i]];
				if(v) { label = v; break; }
			}
		}
		var hasContent = tid && tid.fields.text && tid.fields.text.trim();

		if(hasContent) {
			el = doc.createElement("details");
			el.className = cls + " so-tiddler";
			self.wireState(el, stateTitle, level < self.openDepth);
			summary = doc.createElement("summary");
			self.addArrows(summary);
			if(self.summaryTemplate) {
				// Template renders its own label structure; register for child widget.
				self.summaryTargets.push({label: label, tiddlerTitle: node.tiddler, domNode: summary});
			} else {
				labelSpan = doc.createElement("span");
				labelSpan.className = "so-label";
				labelSpan.textContent = label;
				if(self.tiddlerLink) {
					// Link is inline inside .so-label so it flows right after the text,
					// even when the label wraps to multiple lines.
					// stopPropagation prevents the click from triggering the native toggle.
					var linkEl = doc.createElement("a");
					linkEl.href = "#";
					linkEl.className = "so-tiddler-link";
					linkEl.textContent = self.tiddlerLinkLabel;
					linkEl.addEventListener("click", function(e) {
						e.stopPropagation();
						e.preventDefault();
						self.dispatchEvent({type: "tm-navigate", navigateTo: node.tiddler});
					});
					labelSpan.appendChild(linkEl);
				}
				summary.appendChild(labelSpan);
			}
			el.appendChild(summary);
			contentDiv = doc.createElement("div");
			contentDiv.className = "ltgraybox";
			el.appendChild(contentDiv);
			self.contentTargets.push({tiddlerTitle: node.tiddler, label: label, domNode: contentDiv});
		} else {
			el = doc.createElement("div");
			el.className = cls + " so-leaf item" + (tid ? "" : " so-missing");
			p = doc.createElement("p");
			p.textContent = label;
			if(self.tiddlerLink && tid) {
				var leafLink = doc.createElement("a");
				leafLink.href = "#";
				leafLink.className = "so-tiddler-link";
				leafLink.textContent = self.tiddlerLinkLabel;
				leafLink.addEventListener("click", function(e) {
					e.stopPropagation();
					e.preventDefault();
					self.dispatchEvent({type: "tm-navigate", navigateTo: node.tiddler});
				});
				p.appendChild(leafLink);
			}
			el.appendChild(p);
		}
		parent.appendChild(el);

	} else {
		// Plain label (leaf, no + prefix)
		el = doc.createElement("div");
		el.className = cls + " so-text";
		el.textContent = node.value;
		parent.appendChild(el);
	}
};

exports["simple-outline"] = SimpleOutlineWidget;

})();
