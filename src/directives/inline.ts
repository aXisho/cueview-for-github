import type { CueNode } from "../parser";
import { ALLOWED_COLORS } from "../parser";
import { renderInlineChildren } from "../renderer";

function safeColor(color: string | undefined): string {
  if (color && (ALLOWED_COLORS as readonly string[]).includes(color)) return color;
  return "gray";
}

export function renderInline(node: CueNode): HTMLElement {
  switch (node.name) {
    case "badge": {
      const span = document.createElement("span");
      span.className = `cue-badge cue-color-${safeColor(node.attrs.color)}`;
      span.appendChild(renderInlineChildren(node.children));
      return span;
    }
    case "mark": {
      const mark = document.createElement("mark");
      mark.className = `cue-mark cue-color-${safeColor(node.attrs.color)}`;
      mark.appendChild(renderInlineChildren(node.children));
      return mark;
    }
    case "small": {
      const small = document.createElement("small");
      small.className = "cue-small";
      small.appendChild(renderInlineChildren(node.children));
      return small;
    }
    case "big": {
      // <big> is obsolete in HTML5; emit a span with a styling hook instead.
      const big = document.createElement("span");
      big.className = "cue-big";
      big.appendChild(renderInlineChildren(node.children));
      return big;
    }
    case "kbd": {
      const kbd = document.createElement("kbd");
      kbd.className = "cue-kbd";
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
