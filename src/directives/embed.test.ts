import { describe, expect, it } from "vitest";
import {
  toYouTubeEmbedUrl,
  toFigmaEmbedUrl,
  toCodePenEmbedUrl,
  resolveEmbed,
} from "./embed";

describe("toYouTubeEmbedUrl", () => {
  it("converts watch URL", () => {
    expect(toYouTubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts youtu.be URL", () => {
    expect(toYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts YouTube Shorts URL", () => {
    expect(toYouTubeEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("appends start param for numeric t", () => {
    expect(toYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=42"
    );
  });

  it("ignores non-numeric t", () => {
    expect(toYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=1m30s")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("returns null for non-YouTube URL", () => {
    expect(toYouTubeEmbedUrl("https://example.com/video")).toBeNull();
  });
});

describe("toFigmaEmbedUrl", () => {
  it("converts figma.com/file URL", () => {
    const url = "https://www.figma.com/file/abc123/MyDesign";
    expect(toFigmaEmbedUrl(url)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    );
  });

  it("converts figma.com/design URL", () => {
    const url = "https://www.figma.com/design/xyz789/MyComponent";
    expect(toFigmaEmbedUrl(url)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    );
  });

  it("converts figma.com/proto URL", () => {
    const url = "https://www.figma.com/proto/abc123/Prototype";
    expect(toFigmaEmbedUrl(url)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    );
  });

  it("returns null for non-Figma URL", () => {
    expect(toFigmaEmbedUrl("https://www.figma.com/community/file/123")).toBeNull();
  });
});

describe("toCodePenEmbedUrl", () => {
  it("converts codepen.io pen URL", () => {
    expect(toCodePenEmbedUrl("https://codepen.io/anon/pen/abcXYZ")).toBe(
      "https://codepen.io/anon/embed/abcXYZ?default-tab=result"
    );
  });

  it("returns null for non-pen URL", () => {
    expect(toCodePenEmbedUrl("https://codepen.io/anon/details/abcXYZ")).toBeNull();
  });
});

describe("resolveEmbed", () => {
  it("resolves YouTube with allow attribute", () => {
    const info = resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.iframeUrl).toContain("youtube.com/embed");
    expect(info!.allow).toContain("autoplay");
  });

  it("resolves Figma without allow attribute", () => {
    const info = resolveEmbed("https://www.figma.com/design/abc123/Test");
    expect(info).not.toBeNull();
    expect(info!.iframeUrl).toContain("figma.com/embed");
    expect(info!.allow).toBeUndefined();
  });

  it("resolves CodePen", () => {
    const info = resolveEmbed("https://codepen.io/user/pen/PenId");
    expect(info).not.toBeNull();
    expect(info!.iframeUrl).toContain("codepen.io/user/embed/PenId");
  });

  it("returns null for unknown URL", () => {
    expect(resolveEmbed("https://example.com/foo")).toBeNull();
  });
});
