import { jwtVerify, createRemoteJWKSet } from 'jose';
import { env } from './data';
export async function authorized(req) {
  const e=await env(); const team=e.ACCESS_TEAM_DOMAIN; const aud=e.ACCESS_AUD;
  if (!team || !aud || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) return false;
  const token=req.headers.get('cf-access-jwt-assertion'); if (!token) return false;
  try { await jwtVerify(token, createRemoteJWKSet(new URL(team+'/cdn-cgi/access/certs')), { issuer:team, audience:aud }); return true; } catch { return false; }
}
export function sameOrigin(req) { const origin=req.headers.get('origin'); return !!origin && origin===new URL(req.url).origin; }
