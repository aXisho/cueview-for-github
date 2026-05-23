import type { GlossNode } from "../parser";
import { ALLOWED_COLORS } from "../parser";
import { renderChildren } from "../renderer";

function safeColor(color: string | undefined): string {
  if (color && (ALLOWED_COLORS as readonly string[]).includes(color)) return color;
  return "";
}

export function renderDetails(node: GlossNode): HTMLElement {
  const color = safeColor(node.attrs.color);
  const details = document.createElement("details");
  details.className = `gloss-details${color ? ` gloss-color-${color}` : ""}`;

  if (node.attrs.open === "true") {
    details.open = true;
  }

  const summary = document.createElement("summary");
  summary.textContent = node.attrs.title ?? "Details";
  details.appendChild(summary);

  details.appendChild(renderChildren(node.children));
  return details;
}
