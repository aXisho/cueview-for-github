/**
 * content.ts — CueView for GitHub content script
 */

import { parseCueMd } from "./parser";
import { renderChildren } from "./renderer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCueMdPath(): boolean {
  const path = window.location.pathname.toLowerCase();
  // Both extensions use the same Cue Markdown syntax; the .cuemd form is for
  // viewer-only deployments where GitHub-compatible rendering is not required,
  // but GitHub still shows the raw text so we render either kind.
  return path.endsWith(".cue.md") || path.endsWith(".cuemd");
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

// ── State ─────────────────────────────────────────────────────────────────────

const cachedRaw = new Map<string, string>();
let containerObserver: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;
let watchedContainer: Element | null = null;

const SENTINEL_ATTR = "data-cueview-sentinel";
const RENDERED_ATTR = "data-cueview-rendered";

// ── Core ──────────────────────────────────────────────────────────────────────

function buildFragment(raw: string): DocumentFragment {
  return renderChildren(parseCueMd(raw));
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
      if (!isCueMdPath()) return;
      const container = findContainer();
      if (!container) return;
      if (container === watchedContainer && isOurRendering(container)) return;
      main().catch((err) => console.error("[CueView]", err));
    });
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!isCueMdPath()) {
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
      console.warn("[CueView] Failed to fetch:", rawUrl);
      return;
    }
  }

  const container = findContainer();
  if (!container) {
    console.warn("[CueView] Markdown container not found");
    return;
  }

  applyAndWatch(container, raw);
}

// ── Navigation ────────────────────────────────────────────────────────────────

function scheduleMain(delay = 300): void {
  setTimeout(() => {
    main().catch((err) => console.error("[CueView]", err));
  }, delay);
}

installBodyObserver();
main().catch((err) => console.error("[CueView]", err));

document.addEventListener("turbo:load", () => scheduleMain(300));
document.addEventListener("turbo:render", () => scheduleMain(400));
document.addEventListener("pjax:end", () => scheduleMain(300));
