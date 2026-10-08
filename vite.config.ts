import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        application: fileURLToPath(new URL("./index.html", import.meta.url)),
        projectsPreview: fileURLToPath(
          new URL("./previews/projects.html", import.meta.url),
        ),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    maxWorkers: 4,
    pool: "threads",
    setupFiles: "./src/test/setup.ts",
    // The Planning cockpit renders a large day-by-day accessibility tree. Give
    // full-suite workers enough headroom when several jsdom files run together.
    testTimeout: 20_000,
  },
});
