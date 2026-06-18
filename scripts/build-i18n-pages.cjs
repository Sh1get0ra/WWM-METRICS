// scripts/build-i18n-pages.cjs
// index.html (ja 既定) を読み、 en/zh/ko/vi 4 言語分の静的 HTML を /{lang}/index.html として emit。
// Google が各 URL に対して canonical/hreflang/title/description を独立認識できるようにする = SEO 多言語 index 対応の基盤。
// build pipeline 統合: npm run build (vite build) の後段に統合 (package.json scripts.build 経由)。
// ja 既定 (root index.html) は触らない。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'index.html');
const LANGS = ['en', 'zh', 'ko', 'vi'];
const SITE = 'https://wwm-metrics.pages.dev';

// 各言語 head meta。 ui.json から動的引用も可能だが、 SEO 用 description/title は手作業で言語別に最適化 (キーワード/長さ)
const META = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title:       'WWMETRICS — Where Winds Meet Damage Calculator',
    description: 'Free damage calculator for Where Winds Meet: import roleInfo from the game, view expected damage, Martial Index tier, equipment optimizer, Inner Way (xinfa) comparison, and probability distribution. Supports JA/EN/ZH/KO/VI.',
    ogTitle:     'WWMETRICS — Where Winds Meet Damage Calculator',
    ogDesc:      'Free Where Winds Meet damage calculator: expected damage, gear tier, optimizer, xinfa comparison.',
  },
  zh: {
    htmlLang: 'zh-CN',
    ogLocale: 'zh_CN',
    title:       'WWMETRICS — 燕云十六声 伤害计算器',
    description: '免费的燕云十六声伤害计算器。导入游戏角色数据,查看期望伤害、武学造诣 Tier、装备优化、心法对比与概率分布。支持日/英/中/韩/越语。',
    ogTitle:     'WWMETRICS — 燕云十六声 伤害计算器',
    ogDesc:      '免费的燕云十六声伤害计算器:期望伤害、装备 Tier、优化、心法对比。',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title:       'WWMETRICS — 풍연전 데미지 계산기',
    description: '풍연전 (Where Winds Meet) 무료 데미지 계산기. 게임 데이터 가져오기로 스탯 자동 분석, 기대 데미지·무림 조예 Tier·장비 최적화·심법 비교·확률 분포를 확인. 일/영/중/한/베트남어 지원.',
    ogTitle:     'WWMETRICS — 풍연전 데미지 계산기',
    ogDesc:      '풍연전 무료 데미지 계산기: 기대 데미지, 장비 Tier, 최적화, 심법 비교.',
  },
  vi: {
    htmlLang: 'vi',
    ogLocale: 'vi_VN',
    title:       'WWMETRICS — Where Winds Meet Bộ tính sát thương',
    description: 'Bộ tính sát thương miễn phí cho Where Winds Meet (Phong Yến Truyền). Nhập dữ liệu nhân vật, xem sát thương kỳ vọng, Tier Võ Lực, tối ưu trang bị, so sánh tâm pháp và phân bố xác suất. Hỗ trợ JA/EN/ZH/KO/VI.',
    ogTitle:     'WWMETRICS — Phong Yến Truyền Bộ tính sát thương',
    ogDesc:      'Bộ tính sát thương miễn phí Phong Yến Truyền: sát thương kỳ vọng, Tier, tối ưu, so sánh tâm pháp.',
  },
};

const URL_FOR = (lang) => lang === 'ja' ? `${SITE}/` : `${SITE}/${lang}/`;

function buildHtml(srcHtml, lang) {
  const m = META[lang];
  const selfUrl = URL_FOR(lang);
  let html = srcHtml;

  // <html lang="ja" ...> → <html lang="en|zh-CN|ko|vi" ...>
  html = html.replace(/<html lang="[^"]+"/, `<html lang="${m.htmlLang}"`);
  // <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${m.title}</title>`);
  // <meta name="description">
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${m.description}$2`);
  // canonical
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${selfUrl}$2`);
  // og:url / og:title / og:description / og:locale
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${selfUrl}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${m.ogTitle}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${m.ogDesc}$2`);
  html = html.replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${m.ogLocale}$2`);
  // JSON-LD url field (= 自身 URL)
  html = html.replace(/("url":\s*")[^"]+(")/, `$1${selfUrl}$2`);

  // asset path 絶対化 (`href="assets/..."` → `href="/assets/..."` 等)。
  // /en/ から見て assets/ は /en/assets/ に解決されるため、 必ず root absolute (/) に書換。
  // 対象 = src/href が相対 path で (http://, https://, /, #, ?, data: で始まらない) もの
  html = html.replace(/((?:src|href)=")(?!\/|https?:\/\/|#|\?|data:)([^"]+)"/g, (_, p1, p2) => `${p1}/${p2}"`);

  return html;
}

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  let emitted = [];
  for (const lang of LANGS) {
    const dir = path.join(ROOT, lang);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out = buildHtml(src, lang);
    const outPath = path.join(dir, 'index.html');
    fs.writeFileSync(outPath, out, 'utf8');
    emitted.push(`${lang}/index.html`);
  }
  console.log(`[build-i18n-pages] ✓ emitted ${emitted.length} files: ${emitted.join(', ')}`);
}

main();
