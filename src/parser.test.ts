import { describe, expect, it } from "vitest";
import { parseAttrs, parseCueMd } from "./parser";

describe("parseAttrs", () => {
  it("parses quoted, unquoted, and boolean attributes", () => {
    expect(parseAttrs('title="Hello world" color=blue disabled')).toEqual({
      title: "Hello world",
      color: "blue",
      disabled: "true",
    });
  });

  it("normalizes attribute names to lowercase", () => {
    expect(parseAttrs('TITLE="Hello world" Color=blue DISABLED')).toEqual({
      title: "Hello world",
      color: "blue",
      disabled: "true",
    });
  });

  it("unescapes quoted values", () => {
    expect(parseAttrs(String.raw`label="Line\n\"quoted\""`)).toEqual({
      label: 'Line\n"quoted"',
    });
  });
});

describe("parseCueMd — callouts (GitHub Alert form)", () => {
  it("recognizes [!NOTE] as info", () => {
    const nodes = parseCueMd([
      "> [!NOTE] Heads up",
      "> Read the docs.",
    ].join("\n"));

    expect(nodes).toMatchObject([
      {
        kind: "cue",
        name: "info",
        attrs: { title: "Heads up" },
        inline: false,
        selfClosing: false,
      },
    ]);
  });

  it("maps all five alert types to callout directives", () => {
    const cases: Array<[string, string]> = [
      ["NOTE", "info"],
      ["TIP", "tip"],
      ["IMPORTANT", "important"],
      ["WARNING", "warning"],
      ["CAUTION", "danger"],
    ];
    for (const [alertType, directive] of cases) {
      const nodes = parseCueMd(`> [!${alertType}]\n> body`);
      expect(nodes).toHaveLength(1);
      expect((nodes[0] as { name: string }).name).toBe(directive);
    }
  });

  it("treats unknown alert types as plain blockquotes (no CueNode)", () => {
    const src = "> [!BUG] Tracking\n> See #42.";
    const nodes = parseCueMd(src);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe("text");
  });

  it("alert TYPE matching is case-insensitive", () => {
    const nodes = parseCueMd("> [!warning] hi\n> body");
    expect((nodes[0] as { name: string }).name).toBe("warning");
  });

  it("uses no title attribute when first line has only [!TYPE]", () => {
    const nodes = parseCueMd("> [!TIP]\n> body");
    expect((nodes[0] as { attrs: Record<string, string> }).attrs).toEqual({});
  });
});

describe("parseCueMd — fenced block directives", () => {
  it("parses a details directive with attrs", () => {
    const nodes = parseCueMd([
      "```details title=\"Trace\" color=red",
      "Body text.",
      "```",
    ].join("\n"));

    expect(nodes).toMatchObject([
      {
        kind: "cue",
        name: "details",
        attrs: { title: "Trace", color: "red" },
        inline: false,
        selfClosing: false,
      },
    ]);
  });

  it("matches fenced directive names case-insensitively", () => {
    const nodes = parseCueMd([
      "```Details TITLE=\"Trace\" COLOR=red",
      "Body text.",
      "```",
    ].join("\n"));

    expect(nodes).toMatchObject([
      {
        kind: "cue",
        name: "details",
        attrs: { title: "Trace", color: "red" },
      },
    ]);
  });

  it("leaves non-cue code blocks alone (as text passthrough)", () => {
    const src = [
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");

    const nodes = parseCueMd(src);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe("text");
    expect((nodes[0] as { content: string }).content).toContain("```js");
  });

  it("parses nested container/child via fence-length difference", () => {
    const src = [
      "````tabs",
      "```tab title=\"C++\"",
      "code",
      "```",
      "",
      "```tab title=\"Blueprint\"",
      "nodes",
      "```",
      "````",
    ].join("\n");

    const nodes = parseCueMd(src);
    expect(nodes).toHaveLength(1);
    const tabs = nodes[0] as { name: string; children: Array<{ kind: string; name?: string }> };
    expect(tabs.name).toBe("tabs");
    const tabChildren = tabs.children.filter((c) => c.kind === "cue" && c.name === "tab");
    expect(tabChildren).toHaveLength(2);
  });

  it("does not falsely match alert types inside cue fenced blocks (treats them per spec)", () => {
    // A callout inside a tab is still a callout.
    const src = [
      "````tabs",
      "```tab title=\"X\"",
      "> [!WARNING] note",
      "> body",
      "```",
      "````",
    ].join("\n");

    const nodes = parseCueMd(src);
    const tabs = nodes[0] as { children: Array<{ kind: string; name?: string; children?: unknown[] }> };
    const tab = tabs.children.find((c) => c.kind === "cue" && c.name === "tab");
    expect(tab).toBeDefined();
    const tabChildren = (tab as { children: Array<{ kind: string; name?: string }> }).children;
    const warning = tabChildren.find((c) => c.kind === "cue" && c.name === "warning");
    expect(warning).toBeDefined();
  });
});

describe("parseCueMd — void directives (Alert-extended)", () => {
  it("recognizes [!toc] as a void directive", () => {
    const nodes = parseCueMd("> [!toc title=\"Contents\" depth=3]");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      kind: "cue",
      name: "toc",
      attrs: { title: "Contents", depth: "3" },
      selfClosing: true,
      inline: false,
    });
  });
});

describe("parseCueMd — inline directives", () => {
  it("parses `text`{name attrs}", () => {
    const nodes = parseCueMd("API is `Stable`{badge color=green} today.");
    expect(nodes).toMatchObject([
      { kind: "text", content: "API is " },
      {
        kind: "cue",
        name: "badge",
        attrs: { color: "green" },
        inline: true,
        children: [{ kind: "text", content: "Stable" }],
      },
      { kind: "text", content: " today." },
    ]);
  });

  it("matches inline directive names case-insensitively", () => {
    const nodes = parseCueMd("API is `Stable`{Badge COLOR=green} today.");
    expect(nodes).toMatchObject([
      { kind: "text", content: "API is " },
      {
        kind: "cue",
        name: "badge",
        attrs: { color: "green" },
      },
      { kind: "text", content: " today." },
    ]);
  });

  it("leaves bare inline code spans untouched", () => {
    const nodes = parseCueMd("Use `npm install` to install.");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe("text");
  });

  it("parses kbd, mark, small inline", () => {
    const nodes = parseCueMd("Press `Ctrl + S`{kbd}.");
    expect((nodes[1] as { name: string }).name).toBe("kbd");
  });
});

describe("parseCueMd — heading promotion", () => {
  it("promotes ## `Title`{heading color=blue} to a heading CueNode", () => {
    const nodes = parseCueMd("## `Section Title`{heading color=blue}");
    expect(nodes).toMatchObject([
      {
        kind: "cue",
        name: "heading",
        attrs: { color: "blue", level: "2" },
        children: [{ kind: "text", content: "Section Title" }],
        inline: false,
        selfClosing: false,
      },
    ]);
  });

  it("matches heading directive names case-insensitively", () => {
    const nodes = parseCueMd("## `Section Title`{Heading COLOR=blue}");
    expect(nodes).toMatchObject([
      {
        kind: "cue",
        name: "heading",
        attrs: { color: "blue", level: "2" },
      },
    ]);
  });

  it("captures heading level from the marker length", () => {
    const nodes = parseCueMd("###### `Sub`{heading}");
    expect((nodes[0] as { attrs: Record<string, string> }).attrs.level).toBe("6");
  });

  it("does not promote a heading whose body is more than a heading directive", () => {
    // Heading promotion requires the only content after `## ` to be the
    // `heading` inline directive. When extra text is present, no block-level
    // heading CueNode (inline=false) is produced — inline parses may still
    // surface the directive inline.
    const nodes = parseCueMd("## intro `Sub`{heading color=blue}");
    const promoted = nodes.find(
      (n) => n.kind === "cue" && (n as { name: string }).name === "heading" && (n as { inline: boolean }).inline === false,
    );
    expect(promoted).toBeUndefined();
  });
});

describe("parseCueMd — big inline directive", () => {
  it("parses `text`{big}", () => {
    const nodes = parseCueMd("The score is `1,247`{big} today.");
    const big = nodes.find((n) => n.kind === "cue" && (n as { name: string }).name === "big");
    expect(big).toBeDefined();
    expect((big as { children: Array<{ content: string }> }).children[0].content).toBe("1,247");
  });
});

describe("parseCueMd — grid attributes", () => {
  it("captures cols, rows, and border on grid", () => {
    const nodes = parseCueMd([
      "````grid cols=2 rows=3 border=none",
      "```cell",
      "A",
      "```",
      "````",
    ].join("\n"));
    const grid = nodes[0] as { name: string; attrs: Record<string, string> };
    expect(grid.name).toBe("grid");
    expect(grid.attrs.cols).toBe("2");
    expect(grid.attrs.rows).toBe("3");
    expect(grid.attrs.border).toBe("none");
  });

  it("does not require cols (auto-fit case)", () => {
    const nodes = parseCueMd([
      "````grid border=none",
      "```cell",
      "A",
      "```",
      "",
      "```cell",
      "B",
      "```",
      "````",
    ].join("\n"));
    const grid = nodes[0] as { name: string; attrs: Record<string, string>; children: Array<{ name: string }> };
    expect(grid.attrs.cols).toBeUndefined();
    const cells = grid.children.filter((c) => c.name === "cell");
    expect(cells).toHaveLength(2);
  });
});

describe("parseCueMd — grid border=none", () => {
  it("records border=none on grid and cell", () => {
    const nodes = parseCueMd([
      "````grid cols=2 border=none",
      "```cell",
      "A",
      "```",
      "",
      "```cell border=solid",
      "B",
      "```",
      "````",
    ].join("\n"));
    expect(nodes).toHaveLength(1);
    const grid = nodes[0] as { attrs: Record<string, string>; children: Array<{ attrs: Record<string, string>; name: string }> };
    expect(grid.attrs.border).toBe("none");
    const cells = grid.children.filter((c) => c.name === "cell");
    expect(cells[0].attrs.border).toBeUndefined();
    expect(cells[1].attrs.border).toBe("solid");
  });
});

describe("parseCueMd — pass-through behaviour", () => {
  it("does not parse alerts inside fenced code blocks (verbatim passthrough)", () => {
    const src = [
      "Before.",
      "```",
      "> [!WARNING] inside",
      "> body",
      "```",
      "After.",
    ].join("\n");

    const nodes = parseCueMd(src);
    // No callout CueNode should appear; entire run is text.
    const hasCallout = nodes.some((n) => n.kind === "cue" && (n as { name: string }).name === "warning");
    expect(hasCallout).toBe(false);
  });
});
