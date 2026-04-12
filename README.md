# TW5 Simple Outline Plugin

A [TiddlyWiki 5](https://tiddlywiki.com/) plugin that provides a `<$simple-outline>` widget for rendering collapsible hierarchical outlines using native HTML `<details>`/`<summary>` elements.

## Usage

```
<$simple-outline text="""
!! Section header
  Group label
    + tiddler-name
    + another-tiddler :: Display Text
""" class="outline"/>
```

### Input format

| Syntax | Meaning |
|--------|---------|
| `!! text` | Section header (`<h2>`) |
| `+ tiddler-title` | Tiddler item — expandable if the tiddler has content |
| `plain text` | Structural group node — collapsible if it has children |
| indentation | Nesting (children indented under their parent) |
| `Display :: tiddler-title` | Override the display label for a tiddler item |

### Attributes

| Attribute | Description |
|-----------|-------------|
| `text` | Outline definition. Accepts any TW expression: literal, `{{transclusion}}`, `<<variable>>`, or `{{{filter}}}`. |
| `class` | CSS class(es) applied to the container `<div>`. Defaults to `outline`. |
| `summary-template` | Title of a tiddler rendered inside each `<summary>` element for tiddler items. Two variables are available: `currentTiddler` (the item's tiddler title) and `so-label` (the computed label). |

### Label fallback chain

For `+` tiddler items the display label is resolved in this order:

1. `summary` field of the tiddler
2. `caption` field of the tiddler
3. The display text from the outline (or the tiddler title if no `::` override)

## Getting started

```
npm install
npm start
```

Then open <http://localhost:6543> in your browser.

## License

[MIT](LICENSE) © 2026 Scott Sauyet
