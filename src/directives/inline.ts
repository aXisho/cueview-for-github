import type { GlossNode } from "../parser";
import { ALLOWED_COLORS } from "../parser";
import { renderInlineChildren } from "../renderer";

function safeColor(color: string | undefined): string {
  if (color && (ALLOWED_COLORS as readonly string[]).includes(color)) return color;
  return "";
}

export function renderInline(node: GlossNode): HTMLElement {
  switch (node.name) {
    case "badge": {
      const color = safeColor(node.attrs.color);
      const span = document.createElement("span");
      span.className = `gloss-badge${color ? ` gloss-color-${color}` : ""}`;
      span.appendChild(renderInlineChildren(node.children));
      return span;
    }
    case "small": {
      const small = document.createElement("small");
      small.className = "gloss-small";
      small.appendChild(renderInlineChildren(node.children));
      return small;
    }
    case "big": {
      // <big> is obsolete in HTML5; emit a span with a styling hook instead.
      const big = document.createElement("span");
      big.className = "gloss-big";
      big.appendChild(renderInlineChildren(node.children));
      return big;
    }
    case "kbd": {
      const kbd = document.createElement("span");
      kbd.className = "gloss-kbd";
      kbd.appendChild(renderInlineChildren(node.children));
      return kbd;
    }
    default: {
      const span = document.createElement("span");
      span.appendChild(renderInlineChildren(node.children));
      return span;
    }
  }
}
