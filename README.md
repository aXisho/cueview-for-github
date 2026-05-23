# GlossView for GitHub

A Chrome extension that renders [Gloss Markdown](https://github.com/aXisho/glossmd) directives on GitHub pages. When you browse a `.gloss.md` file on GitHub, the extension intercepts the page and transforms directive markup into rich UI — callouts, tabs, badges, grids, steps, and more.

## What it does

GitHub already renders most Gloss Markdown directives readably out of the box (Alert callouts, fenced code blocks, inline code spans). This extension upgrades the experience further:

**File view** (`.gloss.md` blob pages):

1. Detects that the current GitHub page is a `.gloss.md` file.
2. Fetches the raw source from `raw.githubusercontent.com`.
3. Parses the Gloss Markdown directive tree.
4. Re-renders the page's markdown container with the full Gloss Markdown output: directive blocks are replaced with styled DOM elements (tabbed interfaces, collapsible details, color-coded callouts, etc.), and plain Markdown text is rendered via [marked.js](https://marked.js.org/).

**Edit page preview** (`/edit/` URLs):

When you click the **Preview** tab while editing a `.gloss.md` file, the extension enhances GitHub's own rendered preview in place — replacing Gloss fenced directive blocks (and heading, inline, and TOC directives) without re-fetching the raw source. This means the preview reflects your unsaved edits.

**Gist pages**:

Gist files whose names end in `.gloss.md` or `.gloss` are detected and rendered automatically, fetching the raw content from `gist.githubusercontent.com`.

## Supported directives

| Directive | Form | Description |
|-----------|------|-------------|
| `info` / `tip` / `important` / `warning` / `danger` | `> [!TYPE] title` | Callout blocks (GitHub Alert) |
| `details` | ` ```details ` fence | Collapsible section |
| `card` | ` ```card ` fence | Bordered card |
| `tabs` / `tab` | ` ````tabs ` + nested ` ```tab ` | Tabbed content |
| `steps` / `step` | ` ````steps ` + nested ` ```step ` | Numbered step list |
| `grid` / `cell` | ` ````grid ` + nested ` ```cell ` | CSS grid layout |
| `math` | ` ```math ` fence | Math expression (KaTeX MathML) |
| `toc` | `> [!toc ...]` | Auto-generated table of contents |
| `badge` | `` `text`{badge ...} `` | Inline pill badge |
| `small` | `` `text`{small} `` | Small muted text |
| `big` | `` `text`{big} `` | Larger emphasis text |
| `kbd` | `` `text`{kbd} `` | Keyboard key rendering |
| `heading` | `` ## `Title`{heading color=blue} `` | Background-coloured heading |

GitHub-flavoured footnotes (`[^id]`) are also rendered, with the same definition / back-reference layout that GitHub itself uses.

Code blocks inside rendered content include a hover copy button.

## Installation (load unpacked)

The extension is not yet published to the Chrome Web Store. To install locally:

1. Build the extension (see below).
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dist/glossview-for-github/` directory.

## Building

```bash
npm install
npm run build
```

This bundles `src/content.ts` (and all imported files) into `dist/glossview-for-github/src/content.js` using [Vite](https://vite.dev/), then creates `dist/glossview-for-github-1.0.0.zip`. Generated JavaScript is kept out of `src/`.

To watch for changes during development:

```bash
npm run watch
```

After any rebuild, click the reload button on the extension card at `chrome://extensions`.

## Testing

```bash
npm test
```

Unit tests run with [Vitest](https://vitest.dev/).

## How it works

```
GitHub blob view (.gloss.md)
  └─ content.ts runs at document_idle
       ├─ isGlossMdPath() → true
       ├─ getRawUrl() → https://raw.githubusercontent.com/...
       ├─ fetch(rawUrl) → raw source text
       ├─ parseGlossMd(raw) → GlossChild[] tree
       ├─ renderChildren(tree) → DocumentFragment
       └─ container.replaceChildren(fragment) → DOM updated

GitHub edit page preview (/edit/ URL, Preview tab)
  └─ content.ts enhanced on tab-switch
       ├─ isEditPage() → true
       ├─ findEditContainer() → .markdown-body in preview panel
       ├─ enhanceGitHubPreview(container)
       │    ├─ Pass 1: fenced blocks (tabs/details/card/steps/grid/math)
       │    │    └─ <code class="language-NAME"> → renderGlossNode()
       │    ├─ Pass 2: heading directives in h1–h6
       │    ├─ Pass 3: inline directives (badge/kbd/small/big)
       │    └─ Pass 4: toc blockquotes
       └─ sentinel prepended to prevent double-processing

GitHub Gist page
  └─ content.ts scans .js-gist-file-update-container elements
       ├─ filename ends in .gloss.md / .gloss
       ├─ rawUrl from [href*="/raw/"] link
       └─ applyAndWatch(container, raw) → same render path as blob view
```

The parser (`src/parser.ts`) recognizes the three Gloss Markdown directive forms (GitHub Alerts, fenced code blocks, inline code + brace attrs) and produces a tree of `GlossNode` / `TextNode` values. The renderer (`src/renderer.ts`) walks the tree and delegates each directive to its handler in `src/directives/`. HTML output from marked.js is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify).

## Permissions

- `https://github.com/*` — inject content script on GitHub pages.
- `https://gist.github.com/*` — inject content script on Gist pages.
- `https://raw.githubusercontent.com/*` — fetch raw file content for blob view.
- `https://gist.githubusercontent.com/*` — fetch raw Gist file content.

No background service worker. No storage. No external data collection.

## Known limitations

- **GitHub UI changes**: GitHub occasionally restructures its page markup. If the extension stops working, check whether `article[data-testid="rendered-markdown-container"] .markdown-body` or `.markdown-body` still matches the rendered content container.
- **SPA navigation**: The extension listens for `turbo:load`, `turbo:render`, and `pjax:end` events. If GitHub migrates to a different router these may need updating.
- **Edit page preview**: The extension processes GitHub's rendered HTML rather than the raw editor content, so rendering fidelity depends on how GitHub serialises the markdown to HTML. Constructs that GitHub renders identically (e.g. two different Gloss directives producing the same `<code class="language-X">`) cannot be distinguished.
