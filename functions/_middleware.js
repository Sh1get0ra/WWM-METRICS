// Cloudflare Pages Functions middleware
// 旧 share URL `https://wwm-metrics.pages.dev/?lang=xx` を新 path 形式 `/xx/` へ 301 redirect。
// SEO 多言語 path-based 化 (2026-06-18) で導入。 既存 OGP リンク + Discord 共有 URL 後方互換。
// query parameter match は Cloudflare _redirects file では非対応 → Functions で実装。
// query 構造 = `?lang=xx&...` のように他 param 同居の場合、 他 param は新 URL に持ち越し。

const VALID_LANGS = ['en', 'zh', 'ko', 'vi'];

export const onRequest = async ({ request, next }) => {
  const url = new URL(request.url);
  // root ('/') への ?lang=xx のみ対象。 既に /en/ 等の path に居る request はスルー。
  if (url.pathname !== '/') return next();
  const lang = url.searchParams.get('lang');
  if (!lang || !VALID_LANGS.includes(lang)) return next();
  // lang param を除いた残り query を保持
  url.searchParams.delete('lang');
  const remainder = url.searchParams.toString();
  const target = `${url.origin}/${lang}/${remainder ? '?' + remainder : ''}${url.hash || ''}`;
  return Response.redirect(target, 301);
};
