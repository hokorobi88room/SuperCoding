import { defineConfig } from "vite";
import process from "node:process";

export default defineConfig({
  base: process.env.PAGES_BASE ?? "/",
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 編集ツールの一時ファイルを Deno の fs.watch が掴むとクラッシュするため、
      // ポーリング方式 + 一時ファイル除外にする
      usePolling: true,
      interval: 300,
      ignored: ["**/*.tmp.*", "**/node_modules/**", "**/.git/**"],
    },
  },
  build: {
    target: "es2022",
  },
});
