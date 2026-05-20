/**
 * content.ts — GlossView for GitHub content script
 */

import { parseGlossMd } from "./parser";
import { renderChildren } from "./renderer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGlossMdPath(): boolean {
  const p = window.location.pathname.toLowerCase();
  return p.endsWith(".gloss.md") || p.endsWith(".gloss");
}

function isGistPage(): boolean {
  return window.location.hostname === "gist.github.com";
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
    if (!filename.toLowerCase().endsWith(".gloss.md")) continue;

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

// ── State ─────────────────────────────────────────────────────────────────────

const cachedRaw = new Map<string, string>();
const watchedContainers = new Map<Element, MutationObserver>();
let bodyObserver: MutationObserver | null = null;

const SENTINEL_ATTR = "data-glossview-sentinel";
const RENDERED_ATTR = "data-glossview-rendered";

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
    container.setAttribute(RENDERED_ATTR, "true");
    installHashLinkHandlers(container);
    queueMicrotask(() => {
      applying = false;
    });
  };

  apply();

  if (!watchedContainers.has(container)) {
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
        const res = await fetch(rawUrl);
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
  if (!container) {
    console.warn("[GlossView] Markdown container not found");
    return;
  }

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

document.addEventListener("turbo:load", () => scheduleMain(300));
document.addEventListener("turbo:render", () => scheduleMain(400));
document.addEventListener("pjax:end", () => scheduleMain(300));
