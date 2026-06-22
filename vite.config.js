import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// vite移行 P8 (2026-06-22): TODO #39 = C 案 (フル ESM) + vite-plugin-pwa (Workbox) + data network-first。
// 旧 ?v=N 手動 bump + 手書き sw.js は廃止 → hash filename + workbox precache 自動。

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
    }),

    VitePWA({
      // 自動更新 = sw register + skipWaiting + clientsClaim 自動生成。
      // 1 回違和感本懸案 (workspace v2 main merge 直後の旧 UI 一瞬出現) の根本解消。
      registerType: 'autoUpdate',

      // dist 内 全 hash file を precache manifest に自動追加
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,ttf,ico}'],

        // HTML = network-first (古い HTML 配信 = 古い script src 参照 = 詰む罠回避)
        // navigateFallback 廃止 (SPA でない、 単一 index.html)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/sw\.js$/, /^\/workbox-.+\.js$/, /^\/data\//, /^\/assets\//],

        runtimeCaching: [
          {
            // data/* (i18n json 等) = network-first (DISPLAY_VERSION bump 忘れ罠 [[asset-version-bump-mandatory]] 回避)
            urlPattern: /\/data\/.*\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'wwm-data',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }  // 7 日
            }
          },
          {
            // 公式 CDN img (wherewindsmeetgame.com 等) = cache-first (不変、 30 日)
            urlPattern: /^https:\/\/(www\.)?wherewindsmeetgame\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wwm-official-cdn',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // 外部 CDN script (cdnjs / jsdelivr / google fonts 等) = cache-first
            urlPattern: /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wwm-cdn',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ],

        // sw activate 即時 (旧 controller 待たず)
        skipWaiting: true,
        clientsClaim: true,
        // 旧 precache cache を自動削除 (1 発勝負カードで旧 UI 残らないよう確実化、 workbox default false)
        cleanupOutdatedCaches: true
      },

      // manifest = 現 sw.js + 既存 PWA 設定継承予定 (兄貴判断後)。 false = manifest 生成しない、 sw のみ
      manifest: false,

      // 開発 sw 生成 (dev で SW 体験確認可能)
      devOptions: {
        enabled: false  // dev 中は SW 無効化 (DX 優先、 build/preview でのみ動作確認)
      }
    })
  ],

  cacheDir: 'node_modules/.vite'
});
