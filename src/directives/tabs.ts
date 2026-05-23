import type { GlossNode } from "../parser";
import { ALLOWED_COLORS } from "../parser";
import { renderChildren } from "../renderer";

function safeColor(color: string | undefined, fallback = ""): string {
  if (color && (ALLOWED_COLORS as readonly string[]).includes(color)) return color;
  return fallback;
}

function colorClass(color: string): string {
  return color ? ` gloss-color-${color}` : "";
}

export function renderTabs(node: GlossNode): HTMLElement {
  // A bare `tab` (no `tabs` parent) is rendered standalone — show its title
  // and body without the tab-strip chrome. This corresponds to diagnostic
  // CUE005 (tab outside tabs) which the parser does not enforce.
  if (node.name === "tab") {
    const orphan = document.createElement("div");
    const color = safeColor(node.attrs.color);
    orphan.className = `gloss-tab-orphan${colorClass(color)}`;
    if (node.attrs.title) {
      const strong = document.createElement("strong");
      strong.textContent = node.attrs.title;
      orphan.appendChild(strong);
    }
    orphan.appendChild(renderChildren(node.children));
    return orphan;
  }

  // Collect direct GlossNode children with name === "tab"
  const tabs = node.children.filter(
    (c): c is GlossNode => c.kind === "cue" && c.name === "tab"
  );

  const parentColor = safeColor(node.attrs.color);

  const wrapper = document.createElement("div");
  wrapper.className = `gloss-tabs${colorClass(parentColor)}`;

  if (tabs.length === 0) {
    // No tab children — render contents as-is
    wrapper.appendChild(renderChildren(node.children));
    return wrapper;
  }

  // Tab bar
  const bar = document.createElement("div");
  bar.className = "gloss-tabs-bar";
  bar.setAttribute("role", "tablist");

  // Panel container
  const panel = document.createElement("div");
  panel.className = "gloss-tabs-panel";
  panel.setAttribute("role", "tabpanel");

  // Active index managed in closure
  let activeIndex = 0;

  function renderPanel() {
    // Clear and re-render panel for active tab
    panel.replaceChildren(renderChildren(tabs[activeIndex].children));
  }

  const buttons: HTMLButtonElement[] = [];

  tabs.forEach((tab, idx) => {
    const btn = document.createElement("button");
    const tabColor = safeColor(tab.attrs.color, parentColor);
    btn.className = `gloss-tabs-btn${colorClass(tabColor)}` + (idx === 0 ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", idx === 0 ? "true" : "false");
    btn.textContent = tab.attrs.title ?? `Tab ${idx + 1}`;

    btn.addEventListener("click", () => {
      if (activeIndex === idx) return;
      // Update previous button
      buttons[activeIndex].classList.remove("active");
      buttons[activeIndex].setAttribute("aria-selected", "false");
      // Update new button
      activeIndex = idx;
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      renderPanel();
    });

    buttons.push(btn);
    bar.appendChild(btn);
  });

  renderPanel();

  wrapper.appendChild(bar);
  wrapper.appendChild(panel);
  return wrapper;
}
