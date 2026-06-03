import { defineConfig } from 'vite';

// Phase 7.1: Vite最小導入。 既存 IIFE形式 global script そのまま動作 (MPA mode)。
// 段階的に ES module化 + asset hash自動化予定。

export default defineConfig({
  // Multi-page app (将来 mobile.html対応容易化)
  appType: 'mpa',

  server: {
    port: 8000, // 兄貴の慣れた port
    open: false,
    host: true, // LAN公開 (mobile実機テスト対応)
    cors: true
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html'
      },
      output: {
        // asset hash自動付け (兄貴の ?v=N 手動bump 永久解消)
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  // .gitignore 対象を 監視除外 (node_modules等)
  cacheDir: 'node_modules/.vite'
});
