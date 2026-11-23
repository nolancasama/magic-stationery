/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Relative base: the build works from any GitHub Pages sub-path or a plain folder.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500
  },
  server: { port: 5181 },
  preview: { port: 4181 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000
  }
});
