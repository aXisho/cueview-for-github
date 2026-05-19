import type { CueNode } from "../parser";
import { renderChildren } from "../renderer";

const ICONS: Record<string, string> = {
  info: "ℹ️",
  tip: "💡",
  important: "❗",
  warning: "⚠️",
  danger: "🔥",
};

const DEFAULT_TITLES: Record<string, string> = {
  info: "Info",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  danger: "Danger",
};

export function renderCallout(node: CueNode): HTMLElement {
  const type = node.name;

  const div = document.createElement("div");
  div.className = `cue-callout cue-callout-${type}`;

  const titleText = node.attrs.title ?? DEFAULT_TITLES[type];
  if (titleText) {
    const titleDiv = document.createElement("div");
    titleDiv.className = "cue-callout-title";

    const icon = document.createElement("span");
    icon.textContent = ICONS[type] ?? "";

    const label = document.createTextNode(titleText);

    titleDiv.appendChild(icon);
    titleDiv.appendChild(label);
    div.appendChild(titleDiv);
  }

  div.appendChild(renderChildren(node.children));
  return div;
}
