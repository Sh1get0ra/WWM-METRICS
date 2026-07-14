import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// vite移行 P8 (2026-06-22): TODO #39 = C 案 (フル ESM) + hash filename cache buster。
// 旧 ?v=N 手動 bump + 手書き sw.js は廃止。
// PWA/SW 撤去 (2026-07-14、兄貴指示「オフライン対応いらない」): vite-plugin-pwa (Workbox) precache が
// 新 deploy 後も旧 SW 経由で古い HTML/hash 資産を返し続け「reload しないと最新にならない」構造的罠だったため全廃。
// 代替 = Cloudflare Pages CDN 配信 + ブラウザ標準 HTTP cache (hash filename で永続 cache 可能)。

export default defineConfig({
  server: {
    port: 8000,         // 兄貴の慣れた port ([[dev-server-port-8000]])
    open: false,
    host: true,         // LAN 公開 (mobile 実機テスト)
    cors: true
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // chunk 警告閾値緩和 (calc.js / export.js 等 大 file あり、 現状規模で警告抑制目的)
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // 単一 entry = index.html + src/main.js。 MPA mode 廃止 (mobile.html 未使用)
      input: 'index.html',
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  plugins: [
    // data/ ディレクトリを dist/data/ に build 時 copy (動的 fetch されるため hash 化対象外)。
    // dev (vite serve) は middleware で root から配信、 同 path で揃う ([[asset-version-bump-mandatory]])
    viteStaticCopy({
      targets: [
        { src: 'data', dest: '.' },
        { src: 'assets/icons', dest: 'assets' },
        { src: 'assets/images', dest: 'assets' },
        { src: 'assets/bg', dest: 'assets' }
        // assets/fonts = build 用 ttf 配置場所 (scripts/build-kaisho-svg.cjs)、 Web 配信不要 = copy 対象外
        // 空 dir = git track されない = Cloudflare clone 時不在 = vite-plugin-static-copy fail の罠回避
      ]
    })
  ],

  cacheDir: 'node_modules/.vite'
});
