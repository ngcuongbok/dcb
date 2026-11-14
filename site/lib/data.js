import { getCloudflareContext } from '@opennextjs/cloudflare';
export async function env() { return (await getCloudflareContext({ async: true })).env; }
export async function posts() { const e=await env(); return (await e.DB.prepare("SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC").all()).results; }
export async function post(slug) { const e=await env(); return e.DB.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").bind(slug).first(); }
export function labels(p) { try { const v=JSON.parse(p.labels); return Array.isArray(v)?v:[]; } catch { return []; } }
export const base='https://diciibooth.vn';
