import katex from "katex";
import type { GlossNode } from "../parser";

function extractLatex(node: GlossNode): string {
  return node.children
    .filter((c): c is { kind: "text"; content: string } => c.kind === "text")
    .map((c) => c.content)
    .join("")
    .trim();
}

export function renderMath(node: GlossNode): HTMLElement {
  const latex = extractLatex(node);
  const displayMode = !node.inline;
  const el = displayMode
    ? document.createElement("div")
    : document.createElement("span");
  el.className = displayMode ? "gloss-math-block" : "gloss-math-inline";
  try {
    el.innerHTML = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "mathml",
    });
  } catch {
    el.textContent = latex;
  }
  return el;
}
