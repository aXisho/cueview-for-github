import { marked, Renderer } from "marked";
import markedFootnote from "marked-footnote";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import ini from "highlight.js/lib/languages/ini";
import type { GlossChild, GlossNode } from "./parser";
import { renderCallout } from "./directives/callout";
import { renderTabs } from "./directives/tabs";
import { renderDetails } from "./directives/details";
import { renderInline } from "./directives/inline";
import { renderLayout } from "./directives/layout";
import { renderToc } from "./directives/toc";
import { renderEmbed } from "./directives/embed";
import { renderMath } from "./directives/math";

// ── highlight.js ──────────────────────────────────────────────────────────────

hljs.registerLanguage("javascript", javascript); hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript); hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);         hljs.registerLanguage("py", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);             hljs.registerLanguage("rs", rust);
hljs.registerLanguage("bash", bash);             hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);             hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("xml", xml);               hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);               hljs.registerLanguage("c", cpp);
hljs.registerLanguage("csharp", csharp);         hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("ruby", ruby);             hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);         hljs.registerLanguage("kt", kotlin);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("ini", ini);               hljs.registerLanguage("toml", ini);

function hljsHighlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang }).value; } catch { /* fall through */ }
  }
  return hljs.highlight(code, { language: "plaintext" }).value;
}

// ── marked: custom renderer for syntax-highlighted code blocks ───────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const renderer = new Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }): string {
  const langStr = lang ?? "";
  const colonIdx = langStr.indexOf(":");
  const language = colonIdx >= 0 ? langStr.slice(0, colonIdx) : langStr;
  const filename = colonIdx >= 0 ? langStr.slice(colonIdx + 1) : "";

  const highlighted = hljsHighlight(text, language);
  const cls = language ? ` class="language-${language} hljs"` : ' class="hljs"';
  const codeBlock = `<pre><code${cls}>${highlighted}</code></pre>`;

  if (filename) {
    return `<div class="gloss-code-block"><div class="gloss-code-filename">${escapeHtml(filename)}</div>${codeBlock}</div>\n`;
  }
  return `${codeBlock}\n`;
};
marked.use({ renderer });
marked.use(markedFootnote());

// ── Heading slug ──────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-");
}

// ── Inline node detection ─────────────────────────────────────────────────────

const INLINE_NAMES = new Set(["badge", "small", "big", "kbd"]);

function isInlineNode(child: GlossChild): boolean {
  return child.kind === "cue" && (INLINE_NAMES.has(child.name) || child.inline);
}

// ── renderGlossNode ─────────────────────────────────────────────────────────────

export function renderGlossNode(node: GlossNode): HTMLElement | DocumentFragment {
  switch (node.name) {
    case "info": case "tip": case "important": case "warning": case "danger":
      return renderCallout(node);
    case "tabs": case "tab":
      return renderTabs(node);
    case "details": return renderDetails(node);
    case "badge": case "small": case "big": case "kbd":
      return renderInline(node);
    case "heading":
      return renderHeading(node);
    case "embed":
      return renderEmbed(node);
    case "math":
      return renderMath(node);
    case "grid": case "cell": case "card": case "steps": case "step":
      return renderLayout(node);
    case "toc":
      return renderToc(node);
    default: {
      const el = node.inline ? document.createElement("span") : document.createElement("div");
      el.className = `gloss-unknown gloss-unknown-${node.name}`;
      el.appendChild(renderChildren(node.children));
      return el;
    }
  }
}

const ALLOWED_HEADING_COLORS = new Set(["gray", "blue", "green", "yellow", "red", "purple"]);

function renderHeading(node: GlossNode): HTMLElement {
  const rawColor = node.attrs.color ?? "gray";
  const color = ALLOWED_HEADING_COLORS.has(rawColor) ? rawColor : "gray";
  const rawLevel = parseInt(node.attrs.level ?? "2", 10);
  const level = Number.isFinite(rawLevel) ? Math.min(Math.max(rawLevel, 1), 6) : 2;
  const tagName = `h${level}` as const;
  const el = document.createElement(tagName);
  el.className = `gloss-heading gloss-heading-color-${color}`;
  const rawIndent = parseInt(node.attrs.indent ?? "0", 10);
  const indent = Number.isFinite(rawIndent) && rawIndent > 0 ? rawIndent : 0;
  if (indent > 0) el.style.marginLeft = `${indent}rem`;
  const text = node.children
    .filter((c): c is { kind: "text"; content: string } => c.kind === "text")
    .map((c) => c.content)
    .join("");
  if (text) el.id = slugify(text);
  for (const c of node.children) {
    if (c.kind === "text") el.appendChild(document.createTextNode(c.content));
    else el.appendChild(renderGlossNode(c));
  }
  return el;
}

// ── renderChildren ────────────────────────────────────────────────────────────
//
// The key problem: a TextNode like "## Inline Directives\n\nThis API is "
// contains a blank line (\n\n). The part before the blank line is block-level
// markdown. The part after ("This API is ") is the start of a paragraph that
// continues with inline GlossNodes (badge, kbd, etc.).
//
// Strategy:
//   1. Split each TextNode on blank lines into "paragraphs" (chunks separated
//      by \n\n). All chunks except the last are flushed as block markdown.
//      The last chunk may continue into the next sibling inline GlossNode.
//   2. When the tail of a TextNode + the next sibling are inline-compatible,
//      collect the entire run (tail + inline nodes + more text tails) into
//      one <p> rendered with parseInline().

type FlatItem =
  | { kind: "block-text"; content: string }   // flush as marked.parse()
  | { kind: "inline-text"; content: string }  // part of an inline run
  | { kind: "paragraph-break" }               // forces a new inline run
  | { kind: "cue"; node: GlossNode };           // GlossNode

/**
 * Split a text body on blank lines, but treat fenced code blocks as opaque
 * regions whose internal blank lines do NOT count as paragraph breaks.
 * Returns the list of paragraph chunks (without the separators) along with
 * a flag indicating whether the original ended with a blank line.
 */
function splitOnBlankLines(text: string): { chunks: string[]; endedWithBlank: boolean } {
  const fenceLineRe = /^[ \t]{0,3}(`{3,}|~{3,})/;
  const lines = text.split("\n");
  const chunks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  const flush = (): void => {
    if (buf.length > 0) {
      chunks.push(buf.join("\n"));
      buf = [];
    }
  };

  for (const line of lines) {
    if (inFence) {
      buf.push(line);
      const trimmed = line.trim();
      if (trimmed.startsWith(fenceMarker) && trimmed.replace(/[`~]/g, "") === "") {
        inFence = false;
      }
      continue;
    }

    const fm = fenceLineRe.exec(line);
    if (fm) {
      inFence = true;
      fenceMarker = fm[1];
      buf.push(line);
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    buf.push(line);
  }

  flush();

  const endedWithBlank = lines.length > 0 && lines[lines.length - 1].trim() === "";
  return { chunks, endedWithBlank };
}

/**
 * Expand children into a flat list of FlatItems, splitting TextNodes on
 * blank lines so the tail of each TextNode can join an inline run.
 */
function flatten(children: GlossChild[]): FlatItem[] {
  const items: FlatItem[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child.kind === "cue") {
      items.push({ kind: "cue", node: child });
      continue;
    }

    // TextNode — split on blank lines (respecting fenced code blocks)
    const text = child.content;
    const { chunks, endedWithBlank } = splitOnBlankLines(text);
    const prevChild = children[i - 1];
    const prevIsInline = !!prevChild && isInlineNode(prevChild);
    const nextChild = children[i + 1];
    const nextIsInline = !!nextChild && isInlineNode(nextChild);

    if (chunks.length === 0) {
      // Pure whitespace text — treat as inline glue if either neighbour is inline
      if (prevIsInline || nextIsInline) {
        items.push({ kind: "inline-text", content: text });
      }
      continue;
    }

    // The first chunk continues the inline run from the previous sibling if
    // it was inline. The last chunk may continue into the next sibling if it
    // is inline (and the text didn't end with a blank line). Chunks are
    // separated by paragraph-break markers so each chunk renders as its own
    // paragraph rather than collapsing into one inline run.
    for (let p = 0; p < chunks.length; p++) {
      const chunk = chunks[p];
      const isFirst = p === 0;
      const isLast = p === chunks.length - 1;

      if (p > 0) {
        items.push({ kind: "paragraph-break" });
      }

      const joinPrev = isFirst && prevIsInline;
      const joinNext = isLast && !endedWithBlank && nextIsInline;

      if (joinPrev || joinNext) {
        items.push({ kind: "inline-text", content: chunk });
      } else {
        items.push({ kind: "block-text", content: chunk });
      }
    }

    if (endedWithBlank) {
      // Text ended with a blank line — the next sibling starts a new run.
      items.push({ kind: "paragraph-break" });
    }
  }

  return items;
}

export function renderChildren(children: GlossChild[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  const items = flatten(children);

  // marked-footnote requires all footnote references and definitions to appear
  // in the same marked.parse() call. Strategy: build one combined markdown
  // string with HTML comment placeholders for non-text items (inline runs and
  // block GlossNodes), parse once, then replace each placeholder comment with
  // the real DOM node in-place before moving children into the fragment.
  const PLACEHOLDER = "cuemd-ph";
  const slots = new Map<number, Element>();  // index → pre-built DOM node

  let md = "";
  let i = 0;
  while (i < items.length) {
    const item = items[i];

    if (item.kind === "paragraph-break") { md += "\n\n"; i++; continue; }

    if (item.kind === "block-text") { md += item.content + "\n\n"; i++; continue; }

    if (item.kind === "inline-text" || (item.kind === "cue" && isInlineNode(item.node))) {
      const p = document.createElement("p");
      while (i < items.length) {
        const cur = items[i];
        if (cur.kind === "block-text") break;
        if (cur.kind === "paragraph-break") { i++; break; }
        if (cur.kind === "cue" && !isInlineNode(cur.node)) break;
        if (cur.kind === "inline-text") {
          const txt = cur.content.replace(/\n/g, " ");
          if (txt.trim()) {
            const html = marked.parseInline(txt) as string;
            const tmp = document.createElement("span");
            tmp.innerHTML = html;
            while (tmp.firstChild) p.appendChild(tmp.firstChild);
          }
        } else if (cur.kind === "cue") {
          p.appendChild(renderGlossNode(cur.node));
        }
        i++;
      }
      if (p.hasChildNodes()) {
        const idx = slots.size;
        slots.set(idx, p);
        md += `<!--${PLACEHOLDER}-${idx}-->\n\n`;
      }
      continue;
    }

    if (item.kind === "cue") {
      const idx = slots.size;
      const el = document.createElement("div");
      el.appendChild(renderGlossNode(item.node));
      slots.set(idx, el);
      md += `<!--${PLACEHOLDER}-${idx}-->\n\n`;
      i++;
      continue;
    }

    i++;
  }

  // Parse the combined markdown once so footnotes resolve correctly.
  const html = marked.parse(md.trim()) as string;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  for (const h of wrapper.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (!h.id) h.id = slugify(h.textContent ?? "");
  }

  // Replace placeholder comments with pre-built DOM nodes in document order.
  const placeholderRe = new RegExp(`^${PLACEHOLDER}-(\\d+)$`);
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_COMMENT);
  const replacements: Array<{ comment: Comment; el: Element }> = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const m = placeholderRe.exec((n as Comment).data.trim());
    if (m) {
      const el = slots.get(parseInt(m[1], 10));
      if (el) replacements.push({ comment: n as Comment, el });
    }
  }
  for (const { comment, el } of replacements) {
    comment.replaceWith(...Array.from(el.childNodes));
  }

  while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
  return frag;
}

// ── renderInlineChildren (for badge/kbd/mark/small content) ──────────────────

export function renderInlineChildren(children: GlossChild[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const child of children) {
    if (child.kind === "text") {
      try {
        const html = marked.parseInline(child.content) as string;
        const tmp = document.createElement("span");
        tmp.innerHTML = html;
        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      } catch {
        frag.appendChild(document.createTextNode(child.content));
      }
    } else {
      frag.appendChild(renderGlossNode(child));
    }
  }
  return frag;
}
