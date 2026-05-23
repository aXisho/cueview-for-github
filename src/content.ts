/**
 * content.ts — GlossView for GitHub content script
 */

import { parseGlossMd, parseAttrs, type GlossNode } from "./parser";
import { renderChildren, renderGlossNode } from "./renderer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGlossMdPath(): boolean {
  const p = window.location.pathname.toLowerCase();
  return p.endsWith(".gloss.md") || p.endsWith(".gloss");
}

function isGistPage(): boolean {
  return window.location.hostname === "gist.github.com";
}

function isEditPage(): boolean {
  return /^\/[^/]+\/[^/]+\/edit\//.test(window.location.pathname);
}

function getRawUrl(): string | null {
  const p = window.location.pathname;

  // Regular repo file: /owner/repo/blob/branch/path
  const blobM = p.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (blobM) {
    const [, owner, repo, branch, path] = blobM;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  // Wiki page: /owner/repo/wiki/page-name
  const wikiM = p.match(/^\/([^/]+)\/([^/]+)\/wiki\/(.+)$/);
  if (wikiM) {
    const [, owner, repo, page] = wikiM;
    return `https://raw.githubusercontent.com/wiki/${owner}/${repo}/${page}`;
  }

  return null;
}

function findContainer(): Element | null {
  return (
    document.querySelector(
      'article[data-testid="rendered-markdown-container"] .markdown-body'
    ) ??
    document.querySelector("#wiki-body .markdown-body") ??
    document.querySelector(".wiki-body .markdown-body") ??
    document.querySelector("article.markdown-body") ??
    document.querySelector(".markdown-body") ??
    null
  );
}

function findEditContainer(): Element | null {
  return (
    document.querySelector(".preview-content .markdown-body") ??
    document.querySelector('[data-testid="preview-tab-panel"] .markdown-body') ??
    document.querySelector(".js-preview-body .markdown-body") ??
    document.querySelector('[data-testid="preview"] .markdown-body') ??
    document.querySelector('[role="tabpanel"] .markdown-body') ??
    document.querySelector(".markdown-body") ??
    null
  );
}

// ── Gist support ──────────────────────────────────────────────────────────────

interface GistGlossFile {
  container: Element;
  rawUrl: string;
}

function findGistGlossFiles(): GistGlossFile[] {
  const results: GistGlossFile[] = [];
  for (const fc of document.querySelectorAll(".js-gist-file-update-container")) {
    const nameEl = fc.querySelector(".gist-blob-name");
    if (!nameEl) continue;
    const filename = (nameEl.getAttribute("title") ?? nameEl.textContent ?? "").trim();
    const fn = filename.toLowerCase();
    if (!fn.endsWith(".gloss.md") && !fn.endsWith(".gloss")) continue;

    const rawLink = fc.querySelector<HTMLAnchorElement>('a[href*="/raw/"]');
    if (!rawLink) continue;

    const container = fc.querySelector(".markdown-body");
    if (!container) continue;

    results.push({ container, rawUrl: rawLink.href });
  }
  return results;
}

// ── Hash link handling ────────────────────────────────────────────────────────

const hashLinkContainers = new WeakSet<Element>();

function installHashLinkHandlers(container: Element): void {
  if (hashLinkContainers.has(container)) return;
  hashLinkContainers.add(container);
  container.addEventListener("click", (e) => {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href?.startsWith("#")) return;
    const id = href.slice(1);
    const target = container.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// ── Edit page: enhance GitHub's rendered preview ──────────────────────────────
//
// On edit pages, GitHub re-renders the preview from the current editor content
// (including unsaved edits) each time the user clicks the Preview tab.
// Rather than trying to extract the raw markdown from the editor, we process
// GitHub's already-rendered HTML and replace Gloss fenced-code-block elements
// with our proper directive rendering.

const GLOSS_FENCED_NAMES = new Set([
  "details", "card", "math",
  "tabs", "steps", "grid",
]);

const INLINE_DIRECTIVE_RE = /^\{(badge|small|big|kbd)([^}]*)\}/;
const TOC_BLOCKQUOTE_RE = /^\[!toc([^\]]*)\]$/i;
const HEADING_DIRECTIVE_RE = /\{heading([^}]*)\}/;

function enhanceGitHubPreview(container: Element): void {
  // Pass 1: fenced block directives (tabs, details, card, math, steps, grid)
  const replaced = new Set<Element>();
  for (const codeEl of Array.from(container.querySelectorAll("code"))) {
    let name = "";
    let attrStr = "";

    const langClass = Array.from(codeEl.classList).find(c => c.startsWith("language-"));
    if (langClass) {
      const info = langClass.replace("language-", "");
      const sp = info.indexOf(" ");
      name = (sp >= 0 ? info.slice(0, sp) : info).toLowerCase();
      attrStr = sp >= 0 ? info.slice(sp + 1) : "";
    } else {
      const pre = codeEl.closest("pre");
      const langAttr = pre?.getAttribute("lang") ?? "";
      const sp = langAttr.indexOf(" ");
      name = (sp >= 0 ? langAttr.slice(0, sp) : langAttr).toLowerCase();
      attrStr = sp >= 0 ? langAttr.slice(sp + 1) : "";
    }

    if (!name || !GLOSS_FENCED_NAMES.has(name)) continue;

    const pre = codeEl.closest("pre");
    const replaceTarget = (pre?.closest(".highlight") ?? pre ?? codeEl) as Element;
    if (replaced.has(replaceTarget)) continue;
    replaced.add(replaceTarget);

    const node: GlossNode = {
      kind: "cue",
      name,
      attrs: parseAttrs(attrStr),
      children: parseGlossMd(codeEl.textContent ?? ""),
      inline: false,
      selfClosing: false,
    };

    const wrapper = document.createElement("div");
    wrapper.appendChild(renderGlossNode(node));
    replaceTarget.replaceWith(wrapper);

    // Remove GitHub's native clipboard button — it copies the raw directive
    // source which is meaningless after we've replaced the block.
    wrapper.closest(".snippet-clipboard-content")
      ?.querySelector(".zeroclipboard-container")
      ?.remove();
  }

  // Pass 2: heading directives — GitHub renders `# \`text\`{heading color=blue}` as
  //   <h1><code>text</code>{heading color=blue}</h1>
  for (const hEl of Array.from(container.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
    let attrStr = "";
    let directiveTextNode: Text | null = null;
    for (const child of Array.from(hEl.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const m = (child as Text).textContent?.match(HEADING_DIRECTIVE_RE);
      if (m) { attrStr = m[1].trim(); directiveTextNode = child as Text; break; }
    }
    if (!directiveTextNode) continue;

    const level = parseInt(hEl.tagName.slice(1), 10);
    const attrs = parseAttrs(attrStr);
    if (!attrs.level) attrs.level = String(level);

    const codeChild = hEl.querySelector("code");
    const text = codeChild?.textContent
      ?? (hEl.textContent ?? "").replace(HEADING_DIRECTIVE_RE, "").trim();

    const node: GlossNode = {
      kind: "cue",
      name: "heading",
      attrs,
      children: [{ kind: "text", content: text }],
      inline: false,
      selfClosing: false,
    };
    hEl.replaceWith(renderGlossNode(node));
  }

  // Pass 3: inline directives — GitHub renders `` `text`{badge color=green} `` as
  //   <code>text</code>{badge color=green} (text node following <code>)
  for (const codeEl of Array.from(container.querySelectorAll("code"))) {
    if (codeEl.closest("pre")) continue;
    const nextSib = codeEl.nextSibling;
    if (!nextSib || nextSib.nodeType !== Node.TEXT_NODE) continue;

    const textContent = nextSib.textContent ?? "";
    const m = INLINE_DIRECTIVE_RE.exec(textContent);
    if (!m) continue;

    const rest = textContent.slice(m[0].length);
    const node: GlossNode = {
      kind: "cue",
      name: m[1],
      attrs: parseAttrs(m[2].trim()),
      children: [{ kind: "text", content: codeEl.textContent ?? "" }],
      inline: true,
      selfClosing: false,
    };

    if (rest) {
      (nextSib as Text).textContent = rest;
    } else {
      nextSib.parentNode?.removeChild(nextSib);
    }
    codeEl.replaceWith(renderGlossNode(node));
  }

  // Pass 4: TOC blockquotes — GitHub renders `> [!toc title="目次" depth=3]` as
  //   <blockquote><p>[!toc title="目次" depth=3]</p></blockquote>
  for (const bq of Array.from(container.querySelectorAll("blockquote"))) {
    if (bq.children.length !== 1) continue;
    const p = bq.querySelector("p");
    if (!p) continue;

    const text = (p.textContent ?? "").trim();
    const m = TOC_BLOCKQUOTE_RE.exec(text);
    if (!m) continue;

    const node: GlossNode = {
      kind: "cue",
      name: "toc",
      attrs: parseAttrs(m[1].trim()),
      children: [],
      inline: false,
      selfClosing: true,
    };
    bq.replaceWith(renderGlossNode(node));
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

const cachedRaw = new Map<string, string>();
const watchedContainers = new Map<Element, MutationObserver>();
let bodyObserver: MutationObserver | null = null;

const SENTINEL_ATTR = "data-glossview-sentinel";

// ── Core ──────────────────────────────────────────────────────────────────────

function buildFragment(raw: string): DocumentFragment {
  return renderChildren(parseGlossMd(raw));
}

function isOurRendering(container: Element): boolean {
  return !!container.querySelector(`[${SENTINEL_ATTR}]`);
}

function applyAndWatch(container: Element, raw: string): void {
  let applying = false;

  const apply = (): void => {
    applying = true;
    const frag = buildFragment(raw);
    const sentinel = document.createElement("meta");
    sentinel.setAttribute(SENTINEL_ATTR, "1");
    sentinel.style.display = "none";
    frag.prepend(sentinel);
    container.replaceChildren(frag);
    installHashLinkHandlers(container);
    queueMicrotask(() => {
      applying = false;
    });
  };

  apply();

  const existing = watchedContainers.get(container);
  if (existing) existing.disconnect();

  const observer = new MutationObserver(() => {
    if (applying) return;
    if (!container.isConnected) {
      observer.disconnect();
      watchedContainers.delete(container);
      return;
    }
    if (!isOurRendering(container)) {
      apply();
    }
  });
  observer.observe(container, { childList: true, subtree: false });
  watchedContainers.set(container, observer);
}

function clearWatched(): void {
  for (const obs of watchedContainers.values()) obs.disconnect();
  watchedContainers.clear();
}

/**
 * Watch the document for container churn (turbo navigation, tab switches that
 * swap the article element entirely). When a fresh markdown container appears,
 * re-run main(). Installed once and left in place.
 */
function installBodyObserver(): void {
  if (bodyObserver) return;
  let pending = false;
  bodyObserver = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!isGlossMdPath() && !isGistPage()) return;
      main().catch((err) => console.error("[GlossView]", err));
    });
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function mainGist(): Promise<void> {
  const files = findGistGlossFiles();
  for (const { container, rawUrl } of files) {
    if (watchedContainers.has(container) && isOurRendering(container)) continue;

    let raw = cachedRaw.get(rawUrl);
    if (raw === undefined) {
      try {
        const res = await fetch(rawUrl, { cache: "no-cache" });
        if (!res.ok) continue;
        raw = await res.text();
        cachedRaw.set(rawUrl, raw);
      } catch {
        console.warn("[GlossView] Failed to fetch:", rawUrl);
        continue;
      }
    }
    applyAndWatch(container, raw);
  }
}

async function main(): Promise<void> {
  if (isGistPage()) {
    return mainGist();
  }

  if (!isGlossMdPath()) {
    clearWatched();
    return;
  }

  // Edit page: enhance GitHub's own rendered preview in-place.
  // GitHub re-renders the preview from current editor content on each tab switch,
  // so we don't need the raw markdown — just process the HTML GitHub already produced.
  if (isEditPage()) {
    const container = findEditContainer();
    if (!container) return;
    if (isOurRendering(container)) return;

    enhanceGitHubPreview(container);

    const sentinel = document.createElement("meta");
    sentinel.setAttribute(SENTINEL_ATTR, "1");
    sentinel.style.display = "none";
    container.prepend(sentinel);
    installHashLinkHandlers(container);
    return;
  }

  const rawUrl = getRawUrl();
  if (!rawUrl) return;

  const cacheKey = window.location.pathname;
  let raw = cachedRaw.get(cacheKey);

  if (raw === undefined) {
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) return;
      raw = await res.text();
      cachedRaw.set(cacheKey, raw);
    } catch {
      console.warn("[GlossView] Failed to fetch:", rawUrl);
      return;
    }
  }

  const container = findContainer();
  if (!container) return;
  if (watchedContainers.has(container) && isOurRendering(container)) return;
  applyAndWatch(container, raw);
}

// ── Navigation ────────────────────────────────────────────────────────────────

function scheduleMain(delay = 300): void {
  setTimeout(() => {
    main().catch((err) => console.error("[GlossView]", err));
  }, delay);
}

installBodyObserver();
main().catch((err) => console.error("[GlossView]", err));

document.addEventListener("turbo:load", () => { cachedRaw.clear(); scheduleMain(300); });
document.addEventListener("turbo:render", () => { scheduleMain(400); });
document.addEventListener("pjax:end", () => { cachedRaw.clear(); scheduleMain(300); });

// On edit pages, tab switches may use CSS show/hide without DOM mutations.
// Trigger main() on any tab-like click so the preview is picked up.
document.addEventListener("click", (e) => {
  if (!isGlossMdPath() || !isEditPage()) return;
  const btn = (e.target as Element).closest('[role="tab"], .tabnav-tab, [data-tab]');
  if (!btn) return;
  scheduleMain(300);
});
