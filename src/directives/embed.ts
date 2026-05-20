import type { GlossChild, GlossNode } from "../parser";

function extractText(children: Array<GlossChild>): string {
  return children
    .filter((c): c is { kind: "text"; content: string } => c.kind === "text")
    .map((c) => c.content)
    .join("")
    .trim();
}

// ── YouTube ───────────────────────────────────────────────────────────────────
//
// Supported inputs:
//   https://www.youtube.com/watch?v=VIDEO_ID[&t=SECONDS]
//   https://youtu.be/VIDEO_ID[?t=SECONDS]
//   https://www.youtube.com/shorts/VIDEO_ID

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function toYouTubeEmbedUrl(url: string): string | null {
  const m = YOUTUBE_RE.exec(url);
  if (!m) return null;
  const videoId = m[1];
  let t: string | null = null;
  try { t = new URL(url).searchParams.get("t"); } catch { /* ignore */ }
  const params = t && /^\d+$/.test(t) ? `?start=${t}` : "";
  return `https://www.youtube.com/embed/${videoId}${params}`;
}

// ── Figma ─────────────────────────────────────────────────────────────────────
//
// Supported inputs:
//   https://www.figma.com/file/FILEKEY/...
//   https://www.figma.com/design/FILEKEY/...
//   https://www.figma.com/proto/FILEKEY/...

const FIGMA_RE = /^https:\/\/www\.figma\.com\/(file|design|proto)\//;

export function toFigmaEmbedUrl(url: string): string | null {
  if (!FIGMA_RE.test(url)) return null;
  return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
}

// ── CodePen ───────────────────────────────────────────────────────────────────
//
// Supported inputs:
//   https://codepen.io/USERNAME/pen/PEN_SLUG

const CODEPEN_RE = /^https:\/\/codepen\.io\/([^/]+)\/pen\/([^/?#]+)/;

export function toCodePenEmbedUrl(url: string): string | null {
  const m = CODEPEN_RE.exec(url);
  if (!m) return null;
  return `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`;
}

// ── Resolve ───────────────────────────────────────────────────────────────────

interface EmbedInfo {
  iframeUrl: string;
  allow?: string;
}

export function resolveEmbed(url: string): EmbedInfo | null {
  const ytUrl = toYouTubeEmbedUrl(url);
  if (ytUrl) {
    return {
      iframeUrl: ytUrl,
      allow:
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    };
  }

  const figmaUrl = toFigmaEmbedUrl(url);
  if (figmaUrl) return { iframeUrl: figmaUrl };

  const codepenUrl = toCodePenEmbedUrl(url);
  if (codepenUrl) return { iframeUrl: codepenUrl };

  return null;
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderEmbed(node: GlossNode): HTMLElement {
  const url = extractText(node.children);
  const wrapper = document.createElement("div");
  wrapper.className = "gloss-embed";

  if (!url.startsWith("https://")) {
    const code = document.createElement("code");
    code.textContent = url || "(empty embed)";
    wrapper.appendChild(code);
    return wrapper;
  }

  const info = resolveEmbed(url);
  if (info) {
    const aspectBox = document.createElement("div");
    aspectBox.className = "gloss-embed-aspect";
    const iframe = document.createElement("iframe");
    iframe.src = info.iframeUrl;
    if (info.allow) iframe.setAttribute("allow", info.allow);
    iframe.allowFullscreen = true;
    aspectBox.appendChild(iframe);
    wrapper.appendChild(aspectBox);
    return wrapper;
  }

  const a = document.createElement("a");
  a.href = url;
  a.className = "gloss-embed-link";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = url;
  wrapper.appendChild(a);
  return wrapper;
}
