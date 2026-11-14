// Per-session sharing previews for link crawlers. Regular viewer requests are
// served straight from static assets without waiting for Drive or Apps Script.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4V5uwc4dNMR3f4JcsVuwpoOm5N8JhxjNQBXjTdWqEAezqr53B-6RkQY0C1O85Zssa/exec';
const DEFAULT_IMAGE = 'https://i.ibb.co/ksJDTmT7/new-transparent.png';
const CRAWLER = /facebookexternalhit|facebot|zalobot|telegrambot|twitterbot|whatsapp|discordbot|slackbot|linkedinbot|pinterest|skypeuripreview/i;
const IMAGE_ID = /^[A-Za-z0-9_-]{10,160}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{6,160}$/;
const MODES = new Set(['sb','selfbooth','ptb','photobooth','addon','extras','add-on','in-them']);

export function isPreviewCrawler(userAgent) { return CRAWLER.test(userAgent || ''); }
export function previewParams(url) {
  const id = url.searchParams.get('id') || '';
  if (!SESSION_ID.test(id)) return null;
  const rawMode = (url.searchParams.get('mode') || '').toLowerCase();
  const mode = MODES.has(rawMode) ? rawMode : '';
  return {id, mode};
}
export function describe(mode) {
  if (mode === 'sb' || mode === 'selfbooth') return {title:'Ảnh SelfBooth của bạn | DiciiBooth', description:'Xem lại và tải những khoảnh khắc SelfBooth của bạn tại DiciiBooth.'};
  if (mode === 'ptb' || mode === 'photobooth') return {title:'Ảnh Photobooth của bạn | DiciiBooth', description:'Xem lại và tải ảnh, video kỷ niệm Photobooth của bạn tại DiciiBooth.'};
  return {title:'Ảnh kỷ niệm của bạn | DiciiBooth', description:'Xem lại và tải những khoảnh khắc của bạn tại DiciiBooth.'};
}
function urlForSession(url, params) {
  const canonical = new URL('/viewer/', url.origin);
  canonical.searchParams.set('id', params.id);
  if (params.mode) canonical.searchParams.set('mode', params.mode);
  return canonical.href;
}
async function timedFetch(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, redirect:'follow', signal:controller.signal }); }
  finally { clearTimeout(timer); }
}
export async function readPreview(params) {
  const endpoint = new URL(SCRIPT_URL);
  endpoint.searchParams.set('action', 'getSharePreview');
  // Older deployments only look for `id`; without it they safely return the
  // missing-ID error rather than listing files or changing their sharing.
  endpoint.searchParams.set('preview_id', params.id);
  if (params.mode) endpoint.searchParams.set('mode', params.mode);
  try {
    const response = await timedFetch(endpoint, { headers:{'Accept':'application/json'} }, 6500);
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.ok !== true || !Array.isArray(data.imageIds)) return null;
    const candidates = data.imageIds.filter((id) => typeof id === 'string' && IMAGE_ID.test(id)).slice(0, 3);
    const checks = await Promise.all(candidates.map(async (id) => {
      const image = 'https://lh3.googleusercontent.com/d/' + id + '=w1600';
      try {
        const response = await timedFetch(image, {method:'HEAD'}, 4000);
        const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
        return response.ok && ['image/jpeg','image/png','image/webp'].includes(type) ? {image,type} : null;
      } catch { return null; }
    }));
    const selected = checks.find(Boolean);
    if (!selected) return null;
    return {...selected, mode:['sb','ptb','addon'].includes(data.mode) ? data.mode : params.mode};
  } catch { return null; }
}
async function getPreview(url, params, ctx) {
  // Cache only successful image lookups and isolate entries by full session/mode.
  const keyUrl = new URL('/__dicii_og_cache_v1', url.origin);
  keyUrl.searchParams.set('id', params.id);
  if (params.mode) keyUrl.searchParams.set('mode', params.mode);
  const key = new Request(keyUrl.href);
  try {
    const cached = await caches.default.match(key);
    if (cached) return await cached.json();
  } catch {}
  const result = await readPreview(params);
  if (result) {
    try { ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(result), {headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'}}))); } catch {}
  }
  return result;
}
function metaHandler(value) { return {element(element) { element.setAttribute('content', value); }}; }
function rewrite(response, requestUrl, params, result) {
  const detail = describe(result?.mode || params?.mode || '');
  const image = result?.image || DEFAULT_IMAGE;
  const canonical = params ? urlForSession(requestUrl, params) : new URL('/viewer/', requestUrl.origin).href;
  const rewriter = new HTMLRewriter()
    .on('title', {element(element) { element.setInnerContent(detail.title); }})
    .on('meta[name="description"]', metaHandler(detail.description))
    .on('meta[property="og:title"]', metaHandler(detail.title))
    .on('meta[property="og:description"]', metaHandler(detail.description))
    .on('meta[property="og:url"]', metaHandler(canonical))
    .on('meta[property="og:image"]', metaHandler(image))
    .on('meta[name="twitter:title"]', metaHandler(detail.title))
    .on('meta[name="twitter:description"]', metaHandler(detail.description))
    .on('meta[name="twitter:image"]', metaHandler(image))
    .on('link[rel="canonical"]', {element(element) { element.setAttribute('href', canonical); }});
  const output = rewriter.transform(response);
  const headers = new Headers(output.headers);
  headers.delete('content-length');
  headers.set('Cache-Control', 'private, no-store');
  headers.append('Vary', 'User-Agent');
  return new Response(output.body, {status:output.status,statusText:output.statusText,headers});
}
export default {
  async fetch(request, env, ctx) {
    const asset = await env.ASSETS.fetch(request);
    if (request.method !== 'GET' || asset.status !== 200 || !isPreviewCrawler(request.headers.get('user-agent'))) return asset;
    const url = new URL(request.url);
    const params = previewParams(url);
    const result = params ? await getPreview(url, params, ctx) : null;
    return rewrite(asset, url, params, result);
  },
};
