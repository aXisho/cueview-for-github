import type { GlossNode } from "../parser";

export function renderToc(node: GlossNode): HTMLElement {
  const maxDepth = node.attrs.depth ? parseInt(node.attrs.depth, 10) : 3;

  const wrapper = document.createElement("div");
  wrapper.className = "gloss-toc";

  if (node.attrs.title) {
    const titleDiv = document.createElement("div");
    titleDiv.className = "gloss-toc-title";
    titleDiv.textContent = node.attrs.title;
    wrapper.appendChild(titleDiv);
  }

  // Headings aren't in the DOM yet when the fragment is built, so populate
  // the TOC after the current task (once the fragment is inserted).
  requestAnimationFrame(() => populateToc(wrapper, maxDepth));

  return wrapper;
}

function populateToc(wrapper: HTMLElement, maxDepth: number): void {
  // Scope to the markdown container only — not GitHub UI headings
  const scope: ParentNode =
    document.querySelector(
      'article[data-testid="rendered-markdown-container"] .markdown-body'
    ) ??
    document.querySelector("article.markdown-body") ??
    document.querySelector('[data-glossview-rendered="true"]') ??
    document;

  const headings = Array.from(
    scope.querySelectorAll("h1,h2,h3,h4,h5,h6")
  ) as HTMLHeadingElement[];

  interface TocEntry { id: string; text: string; level: number; }

  const entries: TocEntry[] = [];
  for (const el of headings) {
    if (!el.id) continue;
    const level = parseInt(el.tagName.slice(1), 10);
    if (level <= maxDepth) {
      entries.push({ id: el.id, text: el.textContent ?? "", level });
    }
  }

  if (entries.length === 0) return;

  const minLevel = Math.min(...entries.map((e) => e.level));
  const ol = document.createElement("ol");

  for (const entry of entries) {
    const li = document.createElement("li");
    li.style.marginLeft = `${(entry.level - minLevel) * 1}rem`;
    const a = document.createElement("a");
    a.href = `#${entry.id}`;
    a.textContent = entry.text.trim();
    li.appendChild(a);
    ol.appendChild(li);
  }

  wrapper.appendChild(ol);
}
