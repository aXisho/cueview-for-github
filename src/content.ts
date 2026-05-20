/**
 * content.ts — GlossView for GitHub content script
 */

import { parseGlossMd } from "./parser";
import { renderChildren } from "./renderer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGlossMdPath(): boolean {
  return window.location.pathname.toLowerCase().endsWith(".gloss.md");
}

function getRawUrl(): string | null {
  const m = window.location.pathname.match(
    /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
  );
  if (!m) return null;
  const [, owner, repo, branch, path] = m;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

function findContainer(): Element | null {
  return (
    document.querySelector(
      'article[data-testid="rendered-markdown-container"] .markdown-body'
    ) ??
    document.querySelector("article.markdown-body") ??
    document.querySelector(".markdown-body") ??
    null
  );
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
let containerObserver: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;
let watchedContainer: Element | null = null;

const SENTINEL_ATTR = "data-glossview-sentinel";
const RENDERED_ATTR = "data-glossview-rendered";

// ── Core ──────────────────────────────────────────────────────────────────────

function buildFragment(raw: string): DocumentFragment {
  return renderChildren(parseGlossMd(raw));
}

function isOurRendering(container: Element): boolean {
  return !!container.querySelector(`[${SENTINEL_ATTR}]`);
}

/**
 * Apply our rendered content to `container` and install a MutationObserver
 * that re-applies whenever GitHub overwrites it (e.g. switching back from
 * Blame to Preview tab, or interacting with our tabs directive).
 *
 * Detection strategy: we insert a sentinel <meta> element as the first child.
 * Any DOM mutation triggers a check: if the sentinel is gone, GitHub overwrote
 * us; if it's still there, the change came from our own code (e.g. tab clicks)
 * and we leave it alone.
 */
function applyAndWatch(container: Element, raw: string): void {
  if (watchedContainer !== container) {
    containerObserver?.disconnect();
    containerObserver = null;
  }
  watchedContainer = container;

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

  if (!containerObserver) {
    containerObserver = new MutationObserver(() => {
      if (applying) return;
      if (!watchedContainer || !watchedContainer.isConnected) return;
      if (!isOurRendering(watchedContainer)) {
        apply();
      }
    });
  }
  containerObserver.observe(container, { childList: true, subtree: false });
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
      if (!isGlossMdPath()) return;
      const container = findContainer();
      if (!container) return;
      if (container === watchedContainer && isOurRendering(container)) return;
      main().catch((err) => console.error("[GlossView]", err));
    });
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!isGlossMdPath()) {
    containerObserver?.disconnect();
    containerObserver = null;
    watchedContainer = null;
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
