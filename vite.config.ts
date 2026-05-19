import { fileURLToPath } from "node:url";

export default {
  build: {
    target: "chrome120",
    outDir: "dist/cueview-for-github/src",
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("src/content.ts", import.meta.url)),
      name: "CueViewForGithub",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
};
