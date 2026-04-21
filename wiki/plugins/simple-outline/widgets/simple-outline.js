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
  ++ prefix    → filter expression — expands to tiddler items at render time
                 Options (after the last ] of the filter):
                   group-by:field        group results by a tiddler field value
                   group-by:<<proc>>     group results by calling a named procedure
  + with children → tiddler item that is also expandable; its body (if any)
                 is shown in the expanded panel, followed by its child nodes
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
  tiddler-link-label: wikitext for the link label (default ✳ U+2731).
                     Rendered as inline wikitext, so transclusions like
                     {{$:/core/images/link}} and HTML entities like &#x1f517;
                     are supported.
  tiddler-link-label applies to all tiddler items (expandable and leaf alike)
  and also works for missing tiddlers — navigating to a missing tiddler opens
  TiddlyWiki's new-tiddler editor.
  When tiddler-label-link is also set, the glyph anchor is removed from the
  tab order (tabIndex = -1) so each row has only one Tab stop.

tiddler-label-link:
  When non-empty, makes each tiddler item's label itself a navigation link.
  Clicking the label navigates to the tiddler (or opens the new-tiddler editor
  if the tiddler doesn't exist yet); the disclosure arrows remain the sole
  toggle mechanism for expandable nodes.  Use this when every level of the
  hierarchy is a tiddler and you want the whole label to be clickable rather
  than a separate glyph.  Works for missing tiddlers, so an outline can serve
  as a top-down scaffold: write the full structure first, then fill in tiddlers
  by clicking their labels.

open-depth:
  Integer.  Nodes at levels 0 through open-depth-1 are open by default on
  first render (i.e. when no saved state tiddler exists yet).  Explicit user
  toggles always take precedence over the default.  Default: 0 (all closed).

label-fields:
  Space-separated list of tiddler field names tried in order to produce the
  display label for each tiddler item.  The first non-empty value wins; the
  outline's display text is the final fallback.
  Default: "summary caption" (preserves prior behaviour).

so-expand / so-collapse macros:
  <<so-expand state>> and <<so-collapse state>> expand or collapse every node
  in an outline by walking its DOM container, setting each <details> open or
  closed, and writing or deleting the corresponding state tiddlers.  Both
  require the `state` attribute to be set to a known value.  Implemented as
  <$action-so-expand> and <$action-so-collapse> action widgets (defined below);
  the macros in $:/plugins/crosseye/simple-outline/macros wrap them for
  convenience.  The container <div> stores its state prefix in
  data-so-outline-state so the action widgets can find it.

Keyboard navigation:
  The container div receives a keydown listener.  Standard tree contract:
    ArrowDown/Up — next/previous visible summary
    ArrowRight   — expand closed node; move to first child if already open
    ArrowLeft    — collapse open node; move to parent summary if already closed
    Home/End     — first/last visible summary
  Enter/Space are handled natively by <details>.

Disclosure arrows:
  Each collapsible <summary> receives two child spans:
    .so-arrow-closed  — rendered via <<toc-closed-icon>> ($:/core/images/right-arrow)
    .so-arrow-open    — rendered via <<toc-open-icon>>   ($:/core/images/down-arrow)
  CSS controls visibility based on details[open].  Custom styles that supply
  their own arrow mechanism should hide both spans with display:none !important.

state:
  Optional explicit prefix for state tiddlers.  When supplied, the same prefix
  is used regardless of which tiddler the outline is rendered in, making state
  persistent across page loads and shared between outlines that use the same
  value.  When absent, a per-instance prefix derived from <<qualification>> is
  used (default behaviour: each rendering context gets isolated state).

Session state:
  Open/closed state is stored in tiddlers under <stateBase>/<path> where
  stateBase is either the explicit `state` attribute or the auto-generated
  $:/state/simple-outline/<qualification> prefix.  Path segments are the node
  label or tiddler title, so state survives reordering.  Navigating away and
  back restores the tree to the same open/closed positions.
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
	var v          = node.value;
	var header     = v.startsWith("!!");
	var filterLink = v.startsWith("++");
	var tidLink    = !filterLink && v.startsWith("+");
	var content    = v.slice(filterLink ? 2 : tidLink ? 1 : header ? 2 : 0).trim();
	if(filterLink) {
		// Split filter expression from trailing options.
		// Filter expressions always end with ]; options follow after that.
		var lastBracket = content.lastIndexOf("]");
		var filterExpr  = lastBracket !== -1 ? content.slice(0, lastBracket + 1).trim() : content;
		var optStr      = lastBracket !== -1 ? content.slice(lastBracket + 1).trim() : "";
		var groupBy     = "";
		if(optStr) {
			var gm = optStr.match(/(?:^|\s)group-by:(<<[^>]+>>|\S+)/);
			if(gm) groupBy = gm[1];
		}
		return {
			value:      content,
			header:     false,
			tidLink:    false,
			isFilter:   true,
			filterExpr: filterExpr,
			groupBy:    groupBy,
			display:    "",
			tiddler:    "",
			children:   []
		};
	}
	var parts = content.split("::").map(function(s) { return s.trim(); });
	return {
		value:      content,
		header:     header,
		tidLink:    tidLink,
		isFilter:   false,
		filterExpr: "",
		display:    parts[0],
		tiddler:    parts.length > 1 ? parts[1] : parts[0],
		children:   node.children.map(extract)
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
	// linkLabelTargets: [{domNode}]
	// One entry per tiddler-link anchor; child widgets render the label as wikitext.
	this.linkLabelTargets = [];
	// focusables: [<summary> elements] in document order for keyboard navigation.
	this.focusables = [];
	// hasFilterNodes: true if any ++ filter line was encountered during renderTree.
	// Triggers broader refresh logic so filter results stay up to date.
	this.hasFilterNodes = false;

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
	this.tiddlerLabelLink = this.getAttribute("tiddler-label-link", "");
	this.openDepth = parseInt(this.getAttribute("open-depth", "0"), 10) || 0;
	var labelFieldsAttr = this.getAttribute("label-fields", "summary caption");
	this.labelFields = labelFieldsAttr.trim().split(/\s+/).filter(Boolean);

	// Base path for state tiddlers.  If the caller supplies an explicit `state`
	// attribute, use it as-is (persistent / shareable across rendering contexts).
	// Otherwise fall back to the auto-generated per-instance prefix that uses
	// <<qualification>> — the same hash the core TOC macros use — so each
	// rendering context gets its own isolated state by default.
	var stateAttr    = this.getAttribute("state", "");
	var qualification = this.getVariable("qualification", {defaultValue: ""});
	this.stateBase   = stateAttr || ("$:/state/simple-outline" + qualification);

	var container = this.document.createElement("div");
	container.className = this.getAttribute("class", "outline");
	// Store state prefix so <$action-so-expand> / <$action-so-collapse> can find this container.
	if(container.dataset) container.dataset.soOutlineState = this.stateBase;

	var text = this.getAttribute("text", "");
	if(text.trim()) {
		var tree = makeChildren(sanitize(text)).map(extract);
		this.renderTree(tree, container, 0, "");
	}

	parent.insertBefore(container, nextSibling);
	this.domNodes.push(container);

	// Keyboard navigation — delegate from the container so a single listener
	// covers the whole outline regardless of how many nodes it has.
	if(this.focusables.length) {
		var self0 = this;
		container.addEventListener("keydown", function(e) {
			self0.handleKeydown(e);
		});
	}

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

	if(this.linkLabelTargets.length) {
		var parsedLinkLabel = this.wiki.parseText("text/vnd.tiddlywiki", this.tiddlerLinkLabel, {parseAsInline: true});
		this.linkLabelTargets.forEach(function(t) {
			allNodes.push({type: "element", tag: "span", children: parsedLinkLabel.tree});
			allDomNodes.push(t.domNode);
		});
	}

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
	// If the outline contains ++ filter nodes, any tiddler change outside this
	// outline's own state namespace might affect the filter results — re-render.
	// (Blunt but correct; state tiddlers under stateBase are excluded so that
	// node toggles don't cause an unnecessary full re-render.)
	if(this.hasFilterNodes) {
		var stateBase = this.stateBase;
		var filterNeedsRefresh = Object.keys(changedTiddlers).some(function(t) {
			return t.indexOf(stateBase) !== 0;
		});
		if(filterNeedsRefresh) {
			this.refreshSelf();
			return true;
		}
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

// Add a single .so-arrow span to a <summary> element, register it as an icon
// target, and record the summary in focusables for keyboard navigation.
SimpleOutlineWidget.prototype.addArrows = function(summary) {
	var arrow = this.document.createElement("span");
	arrow.className = "so-arrow";
	summary.appendChild(arrow);
	this.iconTargets.push({arrowDomNode: arrow});
	this.focusables.push(summary);
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
	// Store stateTitle on the element so the keyboard handler can find it.
	if(el.dataset) el.dataset.soState = stateTitle;
	el.addEventListener("toggle", function() {
		if(el.open) {
			wiki.setText(stateTitle, "text", null, "open");
		} else {
			wiki.deleteTiddler(stateTitle);
		}
	});
};

// Keyboard navigation handler (delegated from the container div).
// Implements the standard tree keyboard contract:
//   ArrowDown/Up  — move focus to next/previous visible summary
//   ArrowRight    — expand closed node; move to first child if already open
//   ArrowLeft     — collapse open node; move to parent if already closed
//   Home/End      — first/last focusable summary
// Enter/Space are already handled natively by <details>.
SimpleOutlineWidget.prototype.handleKeydown = function(e) {
	var focusables = this.focusables;
	if(!focusables.length) return;

	// Find the currently focused summary.
	var active = this.document.activeElement;
	var idx    = focusables.indexOf(active);

	// Helper: find the next VISIBLE summary starting from startIdx in direction
	// +1 or -1.  A summary is always visible inside its own <details> (even when
	// that details is closed — the summary IS the clickable header).  It becomes
	// invisible only when a GRANDPARENT-OR-HIGHER <details> is closed, so we
	// start the ancestor walk one level above the immediate parent.
	function nextVisible(startIdx, dir) {
		var i = startIdx;
		while(i >= 0 && i < focusables.length) {
			var s       = focusables[i];
			var visible = true;
			var node    = s.parentNode ? s.parentNode.parentNode : null;
			while(node) {
				if(node.tagName === "DETAILS" && !node.open) { visible = false; break; }
				node = node.parentNode;
			}
			if(visible) return i;
			i += dir;
		}
		return -1;
	}

	var key = e.key;
	if(key === "ArrowDown" || key === "ArrowUp") {
		e.preventDefault();
		if(idx === -1) {
			// Nothing focused yet — jump to first/last visible.
			var fi = nextVisible(key === "ArrowDown" ? 0 : focusables.length - 1,
			                     key === "ArrowDown" ? 1 : -1);
			if(fi !== -1) focusables[fi].focus();
		} else {
			var ni = nextVisible(idx + (key === "ArrowDown" ? 1 : -1),
			                     key === "ArrowDown" ? 1 : -1);
			if(ni !== -1) focusables[ni].focus();
		}

	} else if(key === "ArrowRight") {
		if(idx === -1) return;
		e.preventDefault();
		var details = active.parentNode;
		if(details && details.tagName === "DETAILS") {
			if(!details.open) {
				// Expand.
				details.open = true;
				var st = details.dataset.soState;
				if(st) this.wiki.setText(st, "text", null, "open");
			} else {
				// Already open — move focus to first visible child.
				var ci = nextVisible(idx + 1, 1);
				if(ci !== -1) focusables[ci].focus();
			}
		}

	} else if(key === "ArrowLeft") {
		if(idx === -1) return;
		e.preventDefault();
		var details = active.parentNode;
		if(details && details.tagName === "DETAILS") {
			if(details.open) {
				// Collapse.
				details.open = false;
				var st = details.dataset.soState;
				if(st) this.wiki.deleteTiddler(st);
			} else {
				// Already closed — move focus to parent summary.
				var ancestor = details.parentNode;
				while(ancestor) {
					if(ancestor.tagName === "DETAILS") {
						var pi = focusables.indexOf(ancestor.querySelector(":scope > summary"));
						if(pi !== -1) { focusables[pi].focus(); break; }
					}
					ancestor = ancestor.parentNode;
				}
			}
		}

	} else if(key === "Home") {
		e.preventDefault();
		var fi = nextVisible(0, 1);
		if(fi !== -1) focusables[fi].focus();

	} else if(key === "End") {
		e.preventDefault();
		var fi = nextVisible(focusables.length - 1, -1);
		if(fi !== -1) focusables[fi].focus();
	}
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
		} else if(node.tidLink) {
			// + tiddler node with children — tiddler item that is also a parent.
			// Summary row behaves like any tiddler item (label, optional link glyph,
			// optional label-link); the expanded panel holds the tiddler body (when
			// the tiddler exists and has content) followed by the child nodes.
			var tid = self.wiki.getTiddler(node.tiddler);
			self.referencedTiddlers.push(node.tiddler);

			var label = node.display;
			if(tid) {
				for(var i = 0; i < self.labelFields.length; i++) {
					var v = tid.fields[self.labelFields[i]];
					if(v) { label = v; break; }
				}
			}
			el = doc.createElement("details");
			el.className = cls + " so-tiddler" + (tid ? "" : " so-missing");
			self.wireState(el, stateTitle, level < self.openDepth);
			summary = doc.createElement("summary");
			self.addArrows(summary);
			if(self.summaryTemplate) {
				self.summaryTargets.push({label: label, tiddlerTitle: node.tiddler, domNode: summary});
			} else {
				labelSpan = doc.createElement("span");
				labelSpan.className = "so-label";
				if(self.tiddlerLabelLink) {
					var tidChildLabelLink = doc.createElement("a");
					tidChildLabelLink.href = "#";
					tidChildLabelLink.className = "so-label-link";
					tidChildLabelLink.textContent = label;
					tidChildLabelLink.addEventListener("click", function(e) {
						e.stopPropagation();
						e.preventDefault();
						self.dispatchEvent({type: "tm-navigate", navigateTo: node.tiddler});
					});
					labelSpan.appendChild(tidChildLabelLink);
				} else {
					labelSpan.textContent = label;
				}
				if(self.tiddlerLink) {
					var tidChildLinkEl = doc.createElement("a");
					tidChildLinkEl.href = "#";
					tidChildLinkEl.className = "so-tiddler-link";
					if(self.tiddlerLabelLink) tidChildLinkEl.tabIndex = -1;
					self.linkLabelTargets.push({domNode: tidChildLinkEl});
					tidChildLinkEl.addEventListener("click", function(e) {
						e.stopPropagation();
						e.preventDefault();
						self.dispatchEvent({type: "tm-navigate", navigateTo: node.tiddler});
					});
					labelSpan.appendChild(tidChildLinkEl);
				}
				summary.appendChild(labelSpan);
			}
			el.appendChild(summary);
			if(tid && tid.fields.text && tid.fields.text.trim()) {
				contentDiv = doc.createElement("div");
				contentDiv.className = "ltgraybox";
				el.appendChild(contentDiv);
				self.contentTargets.push({tiddlerTitle: node.tiddler, label: label, domNode: contentDiv});
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
		// + tiddler reference (leaf — no children in the outline)
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
				if(self.tiddlerLabelLink) {
					var contentLabelLink = doc.createElement("a");
					contentLabelLink.href = "#";
					contentLabelLink.className = "so-label-link";
					contentLabelLink.textContent = label;
					contentLabelLink.addEventListener("click", function(e) {
						e.stopPropagation();
						e.preventDefault();
						self.dispatchEvent({type: "tm-navigate", navigateTo: node.tiddler});
					});
					labelSpan.appendChild(contentLabelLink);
				} else {
					labelSpan.textContent = label;
				}
				if(self.tiddlerLink) {
					// Link is inline inside .so-label so it flows right after the text,
					// even when the label wraps to multiple lines.
					// stopPropagation prevents the click from triggering the native toggle.
					var linkEl = doc.createElement("a");
					linkEl.href = "#";
					linkEl.className = "so-tiddler-link";
					if(self.tiddlerLabelLink) linkEl.tabIndex = -1;
					self.linkLabelTargets.push({domNode: linkEl});
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
			if(self.tiddlerLabelLink) {
				var leafLabelLink = doc.createElement("a");
				leafLabelLink.href = "#";
				leafLabelLink.className = "so-label-link";
				leafLabelLink.textContent = label;
				leafLabelLink.addEventListener("click", function(e) {
					e.stopPropagation();
					e.preventDefault();
					self.dispatchEvent({type: "tm-navigate", navigateTo: node.tiddler});
				});
				p.appendChild(leafLabelLink);
			} else {
				p.textContent = label;
			}
			if(self.tiddlerLink) {
				var leafLink = doc.createElement("a");
				leafLink.href = "#";
				leafLink.className = "so-tiddler-link";
				if(self.tiddlerLabelLink) leafLink.tabIndex = -1;
				self.linkLabelTargets.push({domNode: leafLink});
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

	} else if(node.isFilter) {
		// ++ filter expression — evaluate and render each result as a tiddler item,
		// optionally grouped by a field value (Phase B) or procedure (Phase C).
		self.hasFilterNodes = true;
		var filterResults = self.wiki.filterTiddlers(node.filterExpr, self);
		// Use the filter expression as a path segment so state tiddlers don't
		// collide with manually specified + items at the same level.
		var filterPath = path + "/++:" + node.filterExpr;

		if(node.groupBy) {
			// Phase B/C — collect results into keyed groups, then render each
			// group as a collapsible group node with tiddler-item children.
			var isProcedure = /^<<[^>]+>>$/.test(node.groupBy);
			var procName    = isProcedure ? node.groupBy.slice(2, -2).trim() : "";
			var groups      = Object.create(null); // key → [title, ...]
			var groupOrder  = [];
			filterResults.forEach(function(title) {
				var key;
				if(isProcedure) {
					// Phase C: invoke named procedure with currentTiddler set.
					// parentWidget: self lets the call walk up the real widget
					// tree, so procedures defined in the hosting tiddler (or
					// globally via $:/tags/Macro) are resolvable.
					key = self.wiki.renderText("text/plain", "text/vnd.tiddlywiki",
						"<<" + procName + ">>",
						{parentWidget: self, variables: {currentTiddler: title}}).trim();
				} else {
					// Phase B: read a tiddler field directly.
					var tid = self.wiki.getTiddler(title);
					var val = tid && tid.fields[node.groupBy];
					key     = val ? String(val) : "";
				}
				if(!key) key = "(none)";
				if(!groups[key]) { groups[key] = []; groupOrder.push(key); }
				groups[key].push(title);
			});
			groupOrder.forEach(function(groupKey) {
				self.renderNode({
					value:      groupKey,
					header:     false,
					tidLink:    false,
					isFilter:   false,
					filterExpr: "",
					groupBy:    "",
					display:    groupKey,
					tiddler:    "",
					children:   groups[groupKey].map(function(title) {
						return {value: title, header: false, tidLink: true,
						        isFilter: false, filterExpr: "", groupBy: "",
						        display: title, tiddler: title, children: []};
					})
				}, parent, level, filterPath);
			});
		} else {
			// Phase A — flat list of tiddler items.
			filterResults.forEach(function(title) {
				self.renderNode({
					value: title, header: false, tidLink: true,
					isFilter: false, filterExpr: "", groupBy: "",
					display: title, tiddler: title, children: []
				}, parent, level, filterPath);
			});
		}

	} else {
		// Plain label (leaf, no + prefix)
		el = doc.createElement("div");
		el.className = cls + " so-text";
		el.textContent = node.value;
		parent.appendChild(el);
	}
};

exports["simple-outline"] = SimpleOutlineWidget;

//-- Action widgets -----------------------------------------------------------

// Shared DOM walk: find all <details data-so-state> within every container
// whose data-so-outline-state matches `state`, then open or close each one
// and write / delete the corresponding state tiddler.
function soOutlineAction(widget, expand) {
	var state = widget.getAttribute("state", "");
	if(!state) return;
	var doc = widget.document;
	if(!doc || !doc.querySelectorAll) return;
	var containers = doc.querySelectorAll("[data-so-outline-state]");
	for(var i = 0; i < containers.length; i++) {
		if(containers[i].dataset.soOutlineState !== state) continue;
		var detailsEls = containers[i].querySelectorAll("details[data-so-state]");
		for(var j = 0; j < detailsEls.length; j++) {
			var el = detailsEls[j];
			if(expand) {
				el.open = true;
				widget.wiki.setText(el.dataset.soState, "text", null, "open");
			} else {
				el.open = false;
				widget.wiki.deleteTiddler(el.dataset.soState);
			}
		}
	}
}

var ActionSoExpandWidget = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};
ActionSoExpandWidget.prototype = new Widget();
ActionSoExpandWidget.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};
ActionSoExpandWidget.prototype.execute = function() {
	this.makeChildWidgets();
};
ActionSoExpandWidget.prototype.invokeAction = function(triggeringWidget, event) {
	soOutlineAction(this, true);
	return true;
};
exports["action-so-expand"] = ActionSoExpandWidget;

var ActionSoCollapseWidget = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};
ActionSoCollapseWidget.prototype = new Widget();
ActionSoCollapseWidget.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};
ActionSoCollapseWidget.prototype.execute = function() {
	this.makeChildWidgets();
};
ActionSoCollapseWidget.prototype.invokeAction = function(triggeringWidget, event) {
	soOutlineAction(this, false);
	return true;
};
exports["action-so-collapse"] = ActionSoCollapseWidget;

})();
