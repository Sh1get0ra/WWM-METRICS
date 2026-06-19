// css-files.cjs — CSS file 構成の単一真実 (audit/plan/apply script 共用)
//
// Step 4 (components.css per-component 分割) で file = @layer 前提が崩れる:
//   複数 file が同 layer を共有 → cascade 内 source order = 「link 読込順 (seq)」×「行番号」
//
// 提供:
//   CSS_FILES   — link 順 (index.html <link> と一致必須) の { path, layer }
//   LAYER_IDX   — layer 名 → cascade index (tokens.css 先頭 @layer 宣言順)
//   FILE_SEQ    — path → link 順 seq (同 layer 内 file 順)
//   FILE_LAYER  — path → layer index
//   ordOf(file, line) — 同 layer 内の全順序座標 (seq * ORD + line)。
//     ⚠ 比較は「同 layer 内」のみ有効。 layer 跨ぎは LAYER_IDX を先に比較する事
//   ORD         — file 間 stride (1e6 — 1 file 100 万行未満前提)

// @layer 宣言順 (styles-tokens.css 先頭) = cascade 優先順 (後勝ち)
const LAYER_NAMES = ['tokens', 'animations', 'base', 'components', 'modals', 'responsive', 'dark', 'light', 'obs'];
const LAYER_IDX = new Map(LAYER_NAMES.map((n, i) => [n, i]));

// link 順 (index.html と一致必須)。 layer 内の file 分割時はここに追記
const CSS_FILES = [
  { path: 'assets/styles/tokens.css',             layer: 'tokens' },
  { path: 'assets/styles/animations.css',         layer: 'animations' },
  { path: 'assets/styles/base.css',               layer: 'base' },
  // components layer — @layer Step 4 (2026-06-06) per-component 分割。 link 順 = 同 layer 内 cascade 順:
  // 順序は component-split-audit.cjs が機械検証した前提 — 入替えは再 audit 必須
  { path: 'assets/styles/share.css',              layer: 'components' },
  { path: 'assets/styles/hero.css',               layer: 'components' },
  { path: 'assets/styles/sidebar.css',            layer: 'components' },
  { path: 'assets/styles/layout.css',             layer: 'components' },
  { path: 'assets/styles/gear.css',               layer: 'components' },
  { path: 'assets/styles/xinfa.css',              layer: 'components' },
  { path: 'assets/styles/anlz.css',               layer: 'components' },
  { path: 'assets/styles/mobile.css',             layer: 'components' },
  { path: 'assets/styles/workspace.css',          layer: 'components' },
  // mobile-v2.css (2026-06-19) — body.mobile-mode 独立 selector で mobile 表示を gate。
  // workspace.css の後 = 後勝ち (workspace.css mobile @media 撤去済、 PC base 上書きを mobile-v2 で実施)
  { path: 'assets/styles/mobile-v2.css',          layer: 'components' },
  { path: 'assets/styles/modals.css',             layer: 'modals' },
  { path: 'assets/styles/responsive-globals.css', layer: 'responsive' },
  // dark.css 撤去 (2026-06-20 兄貴指示) — 中身 (cmp-modal-a !important background + cmp-rows padding) は modals.css に統合済
  // light.css 撤去 (2026-06-11 dark/light 双テーマ廃止)。 'light' layer 宣言は tokens.css 残置 (空 layer = 無害、 theme-swap cjs が LAYER_NAMES 前提)
  { path: 'assets/styles/obs.css',                layer: 'obs' },
];

const FILE_SEQ = new Map(CSS_FILES.map((f, i) => [f.path, i]));
const FILE_LAYER = new Map(CSS_FILES.map(f => [f.path, LAYER_IDX.get(f.layer)]));

const ORD = 1e6;
const ordOf = (file, line) => (FILE_SEQ.get(file) ?? 99) * ORD + line;

// layer 名 → 当該 layer の file path 群 (link 順)
const filesOfLayer = (layerName) => CSS_FILES.filter(f => f.layer === layerName).map(f => f.path);

// 単一 file layer の path (分割 layer に使うと throw — 呼出側の前提崩れを即検出)
const pathOf = (layerName) => {
  const fs = filesOfLayer(layerName);
  if (fs.length !== 1) throw new Error(`pathOf('${layerName}'): ${fs.length} files — filesOfLayer を使え`);
  return fs[0];
};

module.exports = { CSS_FILES, LAYER_NAMES, LAYER_IDX, FILE_SEQ, FILE_LAYER, ORD, ordOf, filesOfLayer, pathOf };
