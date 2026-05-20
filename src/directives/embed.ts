import hljs from "highlight.js/lib/core";
import type { GlossChild, GlossNode } from "../parser";

function extractText(children: Array<GlossChild>): string {
  return children
    .filter((c): c is { kind: "text"; content: string } => c.kind === "text")
    .map((c) => c.content)
    .join("")
    .trim();
}

// ── GitHub Gist embed ─────────────────────────────────────────────────────────

const GIST_RE = /^https?:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)/i;

export function isGistUrl(url: string): boolean {
  return GIST_RE.test(url);
}

function extractGistId(url: string): string | null {
  const m = GIST_RE.exec(url);
  return m ? m[2] : null;
}

function gistAnchor(url: string): string {
  try { return new URL(url).hash.slice(1).toLowerCase(); } catch { return ""; }
}

// GitHub derives file anchors as: "file-" + filename.toLowerCase().replace(/\./g, "-")
function fileMatchesAnchor(filename: string, anchor: string): boolean {
  if (!anchor) return true;
  return "file-" + filename.toLowerCase().replace(/\./g, "-") === anchor;
}

function applyHighlight(codeEl: HTMLElement, content: string, language: string | null): void {
  if (language) {
    const lang = language.toLowerCase();
    if (hljs.getLanguage(lang)) {
      codeEl.innerHTML = hljs.highlight(content, { language: lang }).value;
      codeEl.className = `hljs language-${lang}`;
      return;
    }
  }
  codeEl.textContent = content;
}

interface GistFile {
  filename: string;
  language: string | null;
  content: string | null;
  raw_url: string;
}

async function renderGistEmbed(wrapper: HTMLElement, url: string): Promise<void> {
  const gistId = extractGistId(url);
  if (!gistId) return;

  const anchor = gistAnchor(url);

  const loading = document.createElement("span");
  loading.className = "gloss-gist-loading";
  loading.textContent = "Loading Gist…";
  wrapper.appendChild(loading);

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { files: Record<string, GistFile>; html_url: string };

    wrapper.removeChild(loading);
    const container = document.createElement("div");
    container.className = "gloss-gist";

    for (const file of Object.values(data.files)) {
      if (!fileMatchesAnchor(file.filename, anchor)) continue;

      const fileEl = document.createElement("div");
      fileEl.className = "gloss-gist-file";

      const header = document.createElement("div");
      header.className = "gloss-gist-header";
      const link = document.createElement("a");
      link.href = url;
      link.textContent = file.filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      header.appendChild(link);
      fileEl.appendChild(header);

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      applyHighlight(code, file.content ?? "", file.language);
      pre.appendChild(code);
      fileEl.appendChild(pre);
      container.appendChild(fileEl);
    }

    const footer = document.createElement("div");
    footer.className = "gloss-gist-footer";
    const footerLink = document.createElement("a");
    footerLink.href = data.html_url;
    footerLink.textContent = "View on GitHub Gist";
    footerLink.target = "_blank";
    footerLink.rel = "noopener noreferrer";
    footer.appendChild(footerLink);
    container.appendChild(footer);

    wrapper.appendChild(container);
  } catch {
    wrapper.textContent = "";
    const link = document.createElement("a");
    link.href = url;
    link.textContent = "View Gist on GitHub";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "gloss-embed-link";
    wrapper.appendChild(link);
  }
}

// ── URL → embed src ───────────────────────────────────────────────────────────
//
// Returns the iframe src to use, or null if the URL is not embeddable.
// Unknown https services return the original URL (try iframe unconditionally).

export function toEmbedSrc(url: string): string | null {
  if (!/^https?:\/\//.test(url)) return null;

  // `(?:.*&)?` optionally matches leading query params before `v=`.
  const ytWatch =
    /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]+)/.exec(url);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;

  const ytBe = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]+)/.exec(url);
  if (ytBe) return `https://www.youtube.com/embed/${ytBe[1]}`;

  const ytShorts =
    /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]+)/.exec(url);
  if (ytShorts) return `https://www.youtube.com/embed/${ytShorts[1]}`;

  if (/^https?:\/\/www\.figma\.com\/(file|design|proto)\//.test(url)) {
    return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
  }

  const cpPen = /^https?:\/\/codepen\.io\/([^/]+)\/pen\/([A-Za-z0-9]+)/.exec(url);
  if (cpPen) return `https://codepen.io/${cpPen[1]}/embed/${cpPen[2]}?default-tab=result`;

  return url;
}

function youtubeAllow(): string {
  return "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
}

function isYouTubeEmbedSrc(src: string): boolean {
  return src.startsWith("https://www.youtube.com/embed/");
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderEmbed(node: GlossNode): HTMLElement {
  const url = extractText(node.children);
  const wrapper = document.createElement("div");
  wrapper.className = "gloss-embed";

  if (isGistUrl(url)) {
    void renderGistEmbed(wrapper, url);
    return wrapper;
  }

  const src = toEmbedSrc(url);
  if (!src) {
    const code = document.createElement("code");
    code.textContent = url || "(empty embed)";
    wrapper.appendChild(code);
    return wrapper;
  }

  const aspectBox = document.createElement("div");
  aspectBox.className = "gloss-embed-aspect";
  const iframe = document.createElement("iframe");
  iframe.src = src;
  if (isYouTubeEmbedSrc(src)) iframe.setAttribute("allow", youtubeAllow());
  iframe.allowFullscreen = true;
  aspectBox.appendChild(iframe);
  wrapper.appendChild(aspectBox);
  return wrapper;
}
