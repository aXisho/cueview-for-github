import type { GlossNode } from "../parser";
import { ALLOWED_COLORS } from "../parser";
import { renderChildren } from "../renderer";

function safeColor(color: string | undefined, fallback: string): string {
  if (color && (ALLOWED_COLORS as readonly string[]).includes(color)) return color;
  return fallback;
}

export function renderDetails(node: GlossNode): HTMLElement {
  const details = document.createElement("details");
  details.className = `gloss-details cue-color-${safeColor(node.attrs.color, "gray")}`;

  if (node.attrs.open === "true") {
    details.open = true;
  }

  const summary = document.createElement("summary");
  summary.textContent = node.attrs.title ?? "Details";
  details.appendChild(summary);

  details.appendChild(renderChildren(node.children));
  return details;
}
