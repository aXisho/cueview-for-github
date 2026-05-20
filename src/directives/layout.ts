import type { GlossNode } from "../parser";
import { ALLOWED_COLORS, SAFE_URL_RE } from "../parser";
import { renderChildren } from "../renderer";

function isSafeHref(href: string | undefined): href is string {
  return !!href && SAFE_URL_RE.test(href);
}

function safeColor(color: string | undefined, fallback: string): string {
  if (color && (ALLOWED_COLORS as readonly string[]).includes(color)) return color;
  return fallback;
}

/**
 * For container/child directives the child inherits the container's `color`
 * unless it sets one of its own. The renderer reads inherited colour from the
 * `data-gloss-inherit-color` attribute on the closest container element so that
 * we don't have to thread state through `renderChildren`.
 */
function inheritColorFor(node: GlossNode, parentColorAttr: string | undefined, fallback: string): string {
  return safeColor(node.attrs.color, parentColorAttr ?? fallback);
}

export function renderLayout(node: GlossNode): HTMLElement {
  switch (node.name) {
    case "card": {
      const inner = document.createElement("div");
      inner.className = `gloss-card gloss-color-${safeColor(node.attrs.color, "gray")}`;

      if (node.attrs.title) {
        const titleDiv = document.createElement("div");
        titleDiv.className = "gloss-card-title";
        titleDiv.textContent = node.attrs.title;
        inner.appendChild(titleDiv);
      }

      inner.appendChild(renderChildren(node.children));

      if (isSafeHref(node.attrs.href)) {
        const a = document.createElement("a");
        a.href = node.attrs.href;
        a.className = "gloss-card-link";
        a.style.textDecoration = "none";
        a.style.color = "inherit";
        a.appendChild(inner);
        return a;
      }

      return inner;
    }

    case "grid": {
      const parentColor = safeColor(node.attrs.color, "gray");
      const parentBorder = node.attrs.border === "none" ? "none" : "solid";

      const cellChildren = node.children.filter(
        (c): c is GlossNode => c.kind === "cue" && c.name === "cell",
      );
      const cellCount = cellChildren.length;

      // cols / rows resolution — see spec for the precedence table.
      const colsAttr = node.attrs.cols ? parseInt(node.attrs.cols, 10) : NaN;
      const rowsAttr = node.attrs.rows ? parseInt(node.attrs.rows, 10) : NaN;
      const hasCols = Number.isFinite(colsAttr) && colsAttr > 0;
      const hasRows = Number.isFinite(rowsAttr) && rowsAttr > 0;
      let cols: number;
      if (hasCols) cols = colsAttr;
      else if (hasRows && cellCount > 0) cols = Math.max(1, Math.ceil(cellCount / rowsAttr));
      else cols = Math.max(1, cellCount || 2);

      const div = document.createElement("div");
      const borderClass = parentBorder === "none" ? " gloss-border-none" : "";
      div.className = `gloss-grid gloss-color-${parentColor}${borderClass}`;
      div.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      if (hasRows) div.style.gridTemplateRows = `repeat(${rowsAttr}, auto)`;
      div.setAttribute("data-gloss-parent-color", parentColor);
      for (const child of node.children) {
        if (child.kind === "cue" && child.name === "cell") {
          div.appendChild(renderCell(child, parentColor, parentBorder));
        } else if (child.kind === "cue") {
          div.appendChild(renderLayout(child));
        }
      }
      return div;
    }

    case "cell": {
      return renderCell(node, "gray", "solid");
    }

    case "steps": {
      const parentColor = safeColor(node.attrs.color, "blue");
      const ol = document.createElement("ol");
      ol.className = `gloss-steps gloss-color-${parentColor}`;
      for (const child of node.children) {
        if (child.kind === "cue" && child.name === "step") {
          ol.appendChild(renderStep(child, parentColor));
        } else if (child.kind === "cue") {
          ol.appendChild(renderLayout(child));
        }
      }
      return ol;
    }

    case "step": {
      return renderStep(node, "blue");
    }

    default: {
      const div = document.createElement("div");
      div.appendChild(renderChildren(node.children));
      return div;
    }
  }
}

function renderCell(node: GlossNode, parentColor: string, parentBorder: "solid" | "none"): HTMLElement {
  const div = document.createElement("div");
  const color = inheritColorFor(node, parentColor, "gray");
  const ownBorder = node.attrs.border;
  const effectiveBorder: "solid" | "none" =
    ownBorder === "none" ? "none" : ownBorder === "solid" ? "solid" : parentBorder;
  const borderClass = effectiveBorder === "none" ? " gloss-border-none" : effectiveBorder === "solid" ? " gloss-border-solid" : "";
  div.className = `gloss-cell gloss-color-${color}${borderClass}`;
  if (node.attrs.title) {
    const strong = document.createElement("strong");
    strong.textContent = node.attrs.title;
    div.appendChild(strong);
  }
  div.appendChild(renderChildren(node.children));
  return div;
}

function renderStep(node: GlossNode, parentColor: string): HTMLElement {
  const li = document.createElement("li");
  const color = inheritColorFor(node, parentColor, "blue");
  li.className = `gloss-step gloss-color-${color}`;
  if (node.attrs.title) {
    const strong = document.createElement("strong");
    strong.textContent = node.attrs.title;
    li.appendChild(strong);
  }
  li.appendChild(renderChildren(node.children));
  return li;
}
