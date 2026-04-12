# TW5 Simple Outline Plugin

A [TiddlyWiki 5](https://tiddlywiki.com/) plugin that provides a `<$simple-outline>` widget for rendering collapsible hierarchical outlines using native HTML `<details>`/`<summary>` elements.

**[Live demo →](https://crosseye.github.io/TW5-SimpleOutlinePlugin/)**

## Usage

```
<$simple-outline text="""
!! Section header
  Group label
    + tiddler-name
    + another-tiddler :: Display Text
""" class="outline"/>
```

The `text` attribute can also be supplied via transclusion (`text={{MyOutlineTiddler}}`) or any other TW expression.

### Input format

| Syntax                     | Meaning                                                |
| -------------------------- | ------------------------------------------------------ |
| `!! text`                  | Section header (`<h2>`)                                |
| `+ tiddler-title`          | Tiddler item — expandable if the tiddler has content   |
| `plain text`               | Structural group node — collapsible if it has children |
| indentation                | Nesting (children indented under their parent)         |
| `Display :: tiddler-title` | Override the display label for a tiddler item          |

### Attributes

| Attribute          | Default   | Description                                                                                                                                                                |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`             | —         | Outline definition (required)                                                                                                                                              |
| `class`            | `outline` | CSS class(es) applied to the container `<div>`                                                                                                                             |
| `summary-template` | —         | Tiddler rendered inside each `<summary>` element for tiddler items. Receives `currentTiddler` (the item's tiddler title) and `so-label` (the computed label) as variables. |
| `detail-template`  | —         | Tiddler rendered as the expanded body for each tiddler item, instead of transcluding the tiddler's own body. Receives the same `currentTiddler` and `so-label` variables.  |

### Label fallback chain

For `+` tiddler items the display label is resolved in this order:

1. `summary` field of the tiddler
2. `caption` field of the tiddler
3. The display text from the outline (or the tiddler title if no `::` override)

### Session state

Open/closed state is persisted for the duration of the browser session. Navigating away and back restores the outline to the same positions.

## Installation

Drag the [[$:/plugins/crosseye/simple-outline]](https://crosseye.github.io/TW5-SimpleOutlinePlugin/) link from the demo wiki into your own TiddlyWiki and save.  Requires TiddlyWiki 5.3.0 or later.

## Development

```
npm install
npm start        # dev server at http://localhost:6543
npm run build    # build docs/index.html
npm run release  # build + copy versioned snapshot to docs/<version>/
npm run bump -- patch   # bump version (patch | minor | major | alpha | beta | rc)
```

Pushing to `main` triggers a GitHub Actions workflow that builds the docs, writes a version changelog tiddler, commits both back, and (on minor/major releases) creates a git tag and GitHub release.

## License

[MIT](LICENSE) © 2026 Scott Sauyet
