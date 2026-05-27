import path from "node:path";
import { defineConfig } from "vite";

const root = path.resolve(import.meta.dirname, "../h5");
const publicDir = path.resolve(import.meta.dirname, "public");

export default defineConfig({
  root,
  publicDir,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(root, "index.html"),
        admin: path.resolve(root, "admin.html")
      }
    }
  },
  server: {
    fs: {
      allow: [path.resolve(import.meta.dirname, "..")]
    }
  }
});
