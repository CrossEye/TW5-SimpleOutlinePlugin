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

| Syntax                     | Meaning                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `!! text`                  | Section header (`<h2>`)                                                                              |
| `+ tiddler-title`          | Tiddler item — expandable if the tiddler has content                                                 |
| `+ tiddler-title` (with indented children) | Tiddler item that is also a parent; body appears in the expanded panel, followed by child nodes |
| `plain text`               | Structural group node — collapsible if it has children                                               |
| indentation                | Nesting (children indented under their parent)                                                       |
| `Display :: tiddler-title` | Override the display label for a tiddler item                                                        |

### Attributes

| Attribute            | Default          | Description                                                                                                                                                              |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text`               | —                | Outline definition (required)                                                                                                                                            |
| `class`              | `outline`        | CSS class(es) applied to the container `<div>`                                                                                                                           |
| `summary-template`   | —                | Tiddler rendered inside each `<summary>` for tiddler items. Receives `currentTiddler` and `so-label`.                                                                    |
| `group-template`     | —                | Tiddler rendered inside each `<summary>` for plain group nodes. Receives `so-label` only (group nodes have no associated tiddler).                                       |
| `header-template`    | —                | Tiddler rendered inside `!!` section header divs, replacing the default `<h2>`. Receives `so-label` only.                                                                |
| `detail-template`    | —                | Tiddler rendered as the expanded body for each tiddler item instead of transcluding the tiddler's own body. Receives `currentTiddler` and `so-label`.                    |
| `tiddler-link`       | —                | When non-empty, adds a small glyph link on each tiddler item's row. Clicking opens the tiddler without toggling. Works for missing tiddlers.                             |
| `tiddler-link-label` | `✳`              | Wikitext for the `tiddler-link` glyph — transclusions and HTML entities supported. Only used when `tiddler-link` is set.                                                 |
| `tiddler-label-link` | —                | When non-empty, makes each tiddler item's label itself a navigation link. Arrows remain the sole toggle. Works for missing tiddlers — useful for top-down scaffolding.   |
| `open-depth`         | `0`              | Number of levels to open by default on first render. Explicit user toggles always take precedence.                                                                       |
| `label-fields`       | `summary caption` | Space-separated list of tiddler field names tried in order to compute the display label. The outline text is the final fallback.                                         |

### Label resolution

For `+` tiddler items the display label is the first non-empty value found by walking the `label-fields` chain (default: `summary` → `caption`), falling back to the display text written in the outline.

### Session state

Open/closed state is persisted for the duration of the browser session using per-instance state tiddlers. Navigating away and back restores the outline to the same positions. Use `open-depth` to control the initial state on first visit.

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
