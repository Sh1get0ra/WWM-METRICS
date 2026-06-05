# VRT (Visual Regression Test)

Tier 1 !important 削減 等の広域 CSS 改修で visual regression を検知する safety net。

## 構成

```
scripts/vrt/
  scenes.cjs        # viewport × theme × scene 定義
  snapshot.cjs      # screenshot 撮影
  compare.cjs       # baseline vs current pixel diff
  README.md         # この doc

.vrt/               # gitignore (regenerable)
  baseline/         # 基準 snapshot
  current/          # 比較対象 snapshot
  diff/             # FAIL ファイルのみ赤 highlight diff
  report.html       # 一覧 (PASS/FAIL/MISSING/SIZE_MISMATCH)
```

## 標準 flow

```bash
# 1. dev server 起動 (別 terminal)
npm run dev

# 2. fixture 配置 (初回 1 回 — 下記 「fixture 抽出」 参照)
#    .vrt/fixture.json に実 build localStorage 内容を保存

# 3. baseline 撮影 (改修着手前、 例: Tier 1 着手直前)
npm run vrt:baseline

# 3. 改修作業 (CSS 変更等)
# ...

# 4. current 撮影 + 比較 (一括)
npm run vrt

# 5. FAIL あれば .vrt/report.html を browser で開いて目視確認
# 想定外の差分 = regression → 修正
# 想定通り (色変更等) = baseline 更新で吸収
```

## fixture 抽出 (初回 1 回)

VRT 用に **実 build state** を `.vrt/fixture.json` に保存。 装備/心法/武格指数 全て計算済の状態で撮影 = 実 regression 検出が可能になる。

手順:

1. **chrome で http://localhost:8000/ を開く** (普段使ってる profile で OK)
2. 公式ツール (or import URL) から **実 build を import 済の state** にする
3. DevTools (F12) → Console で 以下 実行:

```js
copy(JSON.stringify(Object.fromEntries(
  Object.entries(localStorage).filter(([k]) => k.startsWith('wwm_'))
), null, 2))
```

4. clipboard に JSON copied → `.vrt/fixture.json` に paste 保存
5. `.vrt/` は gitignore = local 専用 = 共有不要

fixture 更新タイミング:
- 別 build で撮りたい時 → 同手順で上書き
- localStorage schema 変わった時 (state.js 改修)

**fixture なしでも snapshot は撮れる** が、 装備 0 / 心法 0 / 武格指数 0 の default state = 視覚情報少 = regression 検出能力低。 必ず配置推奨。

## script 個別

| script | 機能 |
|---|---|
| `npm run vrt:baseline` | 基準 snapshot → `.vrt/baseline/` |
| `npm run vrt:snap` | 比較対象 snapshot → `.vrt/current/` |
| `npm run vrt:compare` | baseline vs current diff + report 生成 |
| `npm run vrt` | snap + compare 一括 |

## 環境変数

| var | default | 効果 |
|---|---|---|
| `VRT_URL` | `http://localhost:8000/` | dev server URL |
| `VRT_HOLD` | `400` | scene 切替後 wait ms (animation 落ち着き) |
| `VRT_OPT_TIMEOUT` | `120000` | 装備最適化計算完了 wait timeout ms (build 規模次第で増減) |
| `VRT_THRESHOLD` | `0.1` | FAIL 判定 pixel diff 比率 (%) |
| `VRT_PX_THRESHOLD` | `0.1` | pixelmatch per-pixel color threshold (0..1) |

threshold 緩める例 (font-fit / sub-pixel rendering 揺らぎ吸収):
```bash
VRT_THRESHOLD=0.5 npm run vrt:compare
```

## シーン追加

`scenes.cjs` の `SCENES` 配列に追加:

```js
{
  name: 'modal-import',
  fullPage: (ctx) => !ctx.isMobile,  // optional: mobile overlay 系は viewport のみ
  skip: (ctx) => !ctx.isMobile,      // optional: 特定 viewport 限定
  setup: async (page, ctx) => {      // ctx = { viewport, theme, isMobile }
    await page.click('#openImportBtn');  // 該当 selector
    await page.waitForTimeout(500);
  }
}
```

mobile の anlz tab は `#wwmMobileAnlzOverlay` 内 = `gotoAnlzTab(page, ctx, tab)` helper が overlay 開閉を自動処理。

追加後 baseline 撮り直し: `npm run vrt:baseline`

## トラブル

| 症状 | 原因 / 対策 |
|---|---|
| `dev server 接続不可` | 別 terminal で `npm run dev` 起動してから再実行 |
| 全 file FAIL (大幅差) | font-fit / animation 揺らぎ → `VRT_HOLD=800` で長めに wait、 または `reducedMotion: 'reduce'` 確認 |
| 一部 FAIL (微小 ~0.5%) | sub-pixel rendering / アンチエイリアス揺らぎ → `VRT_THRESHOLD=0.5` で緩和 |
| `MISSING` | baseline にあるが current にない → scenes.cjs 変更で scene 名変わった or 撮影失敗 |
| `SIZE_MISMATCH` | viewport size 変更 / responsive で full-page 高さ変動 → baseline 撮り直し |

## baseline 更新タイミング

- Tier 1 着手前 (current commit を基準にする)
- 意図的な visual 変更 commit 後 (新色 / 新レイアウト)
- viewport 定義変更後
- シーン追加後

baseline は `.vrt/baseline/` ごと削除して再撮影が安全。

## scene 一覧

| scene | 内容 | viewport |
|---|---|---|
| main-top | top page (overlay 閉) | mobile のみ (desktop は anlz-opt fullPage が兼ねる) |
| hero-closeup | hero section element 限定 (donut % / 武格指数 の小領域変化 感度確保) | 全 |
| anlz-opt / anlz-rank / anlz-history | 格析 tab 3種 (mobile = overlay 内) | 全 |
| modal-gear-edit | 武具対照 (slot 1 = 武器) | 全 |
| modal-xinfa-edit | 心法対照 (slot 0) | 全 |
| modal-arsenal-edit | 武庫対照 | 全 |
| modal-note | NOTE (仕様 + changelog) | 全 |
| modal-import-setup | IMPORT setup wizard | 全 |

modal scene は `resetModals()` (Escape ×2 + mobile overlay close) で前 scene の状態 cleanup してから開く。

## 既知の限界

- **完全網羅ではない**: 動的 data (装備値 / 武格指数 等) は fixture state 固定で撮るため、 「特殊 build でのみ起きる regression」 は検出不可
- **modal 内 scroll 下部**: modal/overlay は viewport 撮影 = fold 下は写らない (compare modal の長い affix list 下部等)
- **animation 揺らぎ**: `reducedMotion: 'reduce'` + `animations: 'disabled'` で多くは抑えられるが、 transition 中の screenshot は注意
