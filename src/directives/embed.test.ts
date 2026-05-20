import { describe, expect, it } from "vitest";
import { toEmbedSrc, isGistUrl, isGitHubBlobUrl } from "./embed";

describe("toEmbedSrc — YouTube", () => {
  it("converts watch URL", () => {
    expect(toEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("handles v= not as first query param", () => {
    expect(
      toEmbedSrc("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ")
    ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("handles www-less youtube.com URL", () => {
    expect(toEmbedSrc("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts youtu.be URL", () => {
    expect(toEmbedSrc("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts YouTube Shorts URL", () => {
    expect(toEmbedSrc("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });
});

describe("toEmbedSrc — Figma", () => {
  it("converts figma.com/file URL", () => {
    const url = "https://www.figma.com/file/abc123/MyDesign";
    expect(toEmbedSrc(url)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    );
  });

  it("converts figma.com/design URL", () => {
    const url = "https://www.figma.com/design/xyz789/MyComponent";
    expect(toEmbedSrc(url)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    );
  });

  it("converts figma.com/proto URL", () => {
    const url = "https://www.figma.com/proto/abc123/Prototype";
    expect(toEmbedSrc(url)).toBe(
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    );
  });

  it("does not match figma.com/community", () => {
    const url = "https://www.figma.com/community/file/123";
    expect(toEmbedSrc(url)).toBe(url); // falls through to unknown-service passthrough
  });
});

describe("toEmbedSrc — CodePen", () => {
  it("converts pen URL", () => {
    expect(toEmbedSrc("https://codepen.io/anon/pen/abcXYZ")).toBe(
      "https://codepen.io/anon/embed/abcXYZ?default-tab=result"
    );
  });

  it("does not match non-pen URL", () => {
    const url = "https://codepen.io/anon/details/abcXYZ";
    expect(toEmbedSrc(url)).toBe(url); // passthrough
  });
});

describe("isGitHubBlobUrl", () => {
  it("matches blob URL", () => {
    expect(isGitHubBlobUrl("https://github.com/user/repo/blob/main/src/file.ts")).toBe(true);
  });

  it("matches blob URL with line anchor", () => {
    expect(isGitHubBlobUrl("https://github.com/user/repo/blob/main/src/file.ts#L10-L20")).toBe(true);
  });

  it("does not match non-blob GitHub URL", () => {
    expect(isGitHubBlobUrl("https://github.com/user/repo/tree/main/src")).toBe(false);
  });

  it("does not match gist URL", () => {
    expect(isGitHubBlobUrl("https://gist.github.com/user/abc123")).toBe(false);
  });
});

describe("isGistUrl", () => {
  it("matches standard gist URL", () => {
    expect(isGistUrl("https://gist.github.com/user/abc123def456")).toBe(true);
  });

  it("matches gist URL with hash anchor", () => {
    expect(isGistUrl("https://gist.github.com/user/abc123def456#file-hello-js")).toBe(true);
  });

  it("does not match non-gist GitHub URL", () => {
    expect(isGistUrl("https://github.com/user/repo")).toBe(false);
  });

  it("does not match random URL", () => {
    expect(isGistUrl("https://example.com/gist/abc123")).toBe(false);
  });
});

describe("toEmbedSrc — general", () => {
  it("returns null for non-http URL", () => {
    expect(toEmbedSrc("ftp://example.com/file")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(toEmbedSrc("")).toBeNull();
  });

  it("returns original URL for unknown https service (iframe passthrough)", () => {
    const url = "https://example.com/embed/something";
    expect(toEmbedSrc(url)).toBe(url);
  });

  it("accepts http:// URLs", () => {
    expect(toEmbedSrc("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });
});
