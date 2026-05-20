import type { GlossChild, GlossNode } from "../parser";

function extractText(children: Array<GlossChild>): string {
  return children
    .filter((c): c is { kind: "text"; content: string } => c.kind === "text")
    .map((c) => c.content)
    .join("")
    .trim();
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
