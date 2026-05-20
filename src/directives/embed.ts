import type { GlossChild, GlossNode } from "../parser";

function extractText(children: Array<GlossChild>): string {
  return children
    .filter((c): c is { kind: "text"; content: string } => c.kind === "text")
    .map((c) => c.content)
    .join("")
    .trim();
}

const YOUTUBE_RE =
  /(?:youtube\.com\/watch\?(?:[^&\s]*&)*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function toYouTubeEmbedUrl(url: string): string | null {
  const m = YOUTUBE_RE.exec(url);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

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

  const ytUrl = toYouTubeEmbedUrl(url);
  if (ytUrl) {
    const aspectBox = document.createElement("div");
    aspectBox.className = "gloss-embed-aspect";
    const iframe = document.createElement("iframe");
    iframe.src = ytUrl;
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    );
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
