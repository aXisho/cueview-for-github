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

function isEditPage(): boolean {
  return /^\/[^/]+\/[^/]+\/edit\//.test(window.location.pathname);
}

function getRawUrl(): string | null {
  const p = window.location.pathname;

  // Repo file on blob view or edit page: /owner/repo/blob|edit/branch/path
  const fileM = p.match(/^\/([^/]+)\/([^/]+)\/(?:blob|edit)\/([^/]+)\/(.+)$/);
  if (fileM) {
    const [, owner, repo, branch, path] = fileM;
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
  const selectors = [
    '[data-testid="preview-tab-panel"] .markdown-body',
    '[data-testid="preview"] .markdown-body',
    ".js-preview-panel .markdown-body",
    ".js-preview-body .markdown-body",
    ".preview-content .markdown-body",
    ".preview-content.markdown-body",
    ".js-preview-body.markdown-body",
    '[role="tabpanel"] .markdown-body',
  ];

  const explicitCandidates = selectors.flatMap((selector) =>
    Array.from(document.querySelectorAll<Element>(selector))
  );
  const renderedFallbacks = Array.from(document.querySelectorAll<Element>("div.markdown-body"))
    .filter((el) => (
      el.classList.contains("container-lg") ||
      !!el.querySelector(".markdown-heading, .snippet-clipboard-content, .markdown-alert, [data-sourcepos]")
    ));
  const candidates = Array.from(new Set([...explicitCandidates, ...renderedFallbacks]));

  return (
    candidates.find((el) => el.isConnected && el.getClientRects().length > 0) ??
    candidates.find((el) => el.isConnected) ??
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

// ── State ─────────────────────────────────────────────────────────────────────

const cachedRaw = new Map<string, string>();
const watchedContainers = new Map<Element, MutationObserver>();
const renderedSources = new WeakMap<Element, string>();
let bodyObserver: MutationObserver | null = null;

const SENTINEL_ATTR = "data-glossview-sentinel";
const EDITOR_CONTENT_ATTR = "data-glossview-content";
const EDITOR_REQUEST_EVENT = "__glossview_request_editor_content";
const EDITOR_RESPONSE_EVENT = "__glossview_editor_content";

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
    renderedSources.set(container, raw);
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

async function getRawForCurrentPage(): Promise<string | null> {
  const rawUrl = getRawUrl();
  if (!rawUrl) return null;

  const cacheKey = window.location.pathname;
  let raw = cachedRaw.get(cacheKey);
  if (raw !== undefined) return raw;

  try {
    const res = await fetch(rawUrl);
    if (!res.ok) return null;
    raw = await res.text();
    cachedRaw.set(cacheKey, raw);
    return raw;
  } catch {
    console.warn("[GlossView] Failed to fetch:", rawUrl);
    return null;
  }
}

function getCapturedEditorContent(): string | null {
  const raw = document.documentElement.getAttribute(EDITOR_CONTENT_ATTR);
  return raw && raw.trim() ? raw : null;
}

function requestEditorContent(timeoutMs = 600): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;

    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      document.removeEventListener(EDITOR_RESPONSE_EVENT, onResponse as EventListener);
      resolve(value);
    };

    const onResponse = (event: Event): void => {
      const detail = (event as CustomEvent<string | null>).detail;
      if (detail && detail.trim()) finish(detail);
    };

    document.addEventListener(EDITOR_RESPONSE_EVENT, onResponse as EventListener, { once: true });
    document.dispatchEvent(new CustomEvent(EDITOR_REQUEST_EVENT));
    window.setTimeout(() => finish(getCapturedEditorContent()), timeoutMs);
  });
}

async function main(): Promise<void> {
  if (isGistPage()) {
    return mainGist();
  }

  if (!isGlossMdPath()) {
    clearWatched();
    return;
  }

  // Edit page: target the preview tab panel; blob/wiki: the rendered article.
  const container = isEditPage() ? findEditContainer() : findContainer();
  if (!container) return;

  const raw = isEditPage()
    ? (await requestEditorContent()) ?? (await getRawForCurrentPage())
    : await getRawForCurrentPage();
  if (!raw) return;

  if (
    watchedContainers.has(container) &&
    isOurRendering(container) &&
    renderedSources.get(container) === raw
  ) {
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

document.addEventListener("turbo:load", () => {
  cachedRaw.clear();
  scheduleMain(300);
});
document.addEventListener("turbo:render", () => { scheduleMain(400); });
document.addEventListener("pjax:end", () => {
  cachedRaw.clear();
  scheduleMain(300);
});

// On edit pages, tab switches may use CSS show/hide without DOM mutations.
// Schedule main() on any tab-like click so the preview panel is picked up.
document.addEventListener("click", (e) => {
  if (!isGlossMdPath() || !isEditPage()) return;
  const target = e.target as Element;
  const btn = target.closest('[role="tab"], .tabnav-tab, [data-tab], button, a');
  const label = (btn?.textContent ?? btn?.getAttribute("aria-label") ?? "").trim().toLowerCase();
  if (!btn || (!label.includes("preview") && !btn.matches('[role="tab"], .tabnav-tab, [data-tab]'))) {
    return;
  }
  scheduleMain(150);
  scheduleMain(500);
  scheduleMain(1000);
});
