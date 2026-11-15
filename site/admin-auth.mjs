import { scryptSync, timingSafeEqual } from 'node:crypto';

const json = (v, status=200, headers={}) => Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const sha = async v => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),x=>x.toString(16).padStart(2,'0')).join('');
const cookie = req => (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-dicii_admin='))?.slice(19) || '';
const cookieHeader = (token, age) => `__Host-dicii_admin=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
const originOK = req => req.headers.get('Origin') === new URL(req.url).origin;

export async function adminIdentity(request, env) {
  if (!env.REPORTS_DB || !env.ADMIN_PASSWORD_HASH) return null;
  const token=cookie(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row=await env.REPORTS_DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(await sha(token),Math.floor(Date.now()/1000)).first();
  return row ? {email:'admin',owner:true} : null;
}

export async function adminAuthRequest(req, env) {
  if (!env.REPORTS_DB || !env.ADMIN_PASSWORD_HASH) return json({error:'not_configured'},503);
  if (req.method !== 'POST') return json({error:'method'},405);
  if (!originOK(req)) return json({error:'origin'},403);
  const path=new URL(req.url).pathname;
  if (path === '/admin/api/logout') {
    const token=cookie(req);
    if (/^[a-f0-9]{64}$/.test(token)) await env.REPORTS_DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await sha(token)).run();
    return json({ok:true},200,{'Set-Cookie':cookieHeader('',0)});
  }
  if (path !== '/admin/api/login') return json({error:'not_found'},404);
  if (!/^application\/json\b/i.test(req.headers.get('Content-Type')||'') || Number(req.headers.get('Content-Length')||0)>4096) return json({error:'invalid_request'},400);
  const ip=req.headers.get('CF-Connecting-IP');
  if (!ip) return json({error:'unavailable'},503);
  const now=Math.floor(Date.now()/1000), ipHash=await sha(ip);
  const limit=await env.REPORTS_DB.prepare(`INSERT INTO admin_login_limits(ip_hash,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts`).bind(ipHash,now,now-900,now-900).first();
  if (!limit || limit.attempts>10) return json({error:'rate_limit'},429);
  let body;try {const raw=await req.text();if(raw.length>4096)return json({error:'invalid_request'},400);body=JSON.parse(raw)} catch {return json({error:'invalid_request'},400)}
  if (typeof body?.password !== 'string' || body.password.length>256) return json({error:'invalid_credentials'},401);
  const parts=String(env.ADMIN_PASSWORD_HASH).split(':');
  if (parts.length!==3 || parts[0]!=='scrypt-v1' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return json({error:'not_configured'},503);
  const candidate=scryptSync(body.password,Buffer.from(parts[1],'hex'),32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  if (body.username !== 'admin' || !timingSafeEqual(candidate,Buffer.from(parts[2],'hex'))) return json({error:'invalid_credentials'},401);
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  await env.REPORTS_DB.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)').bind(await sha(token),now+28800).run();
  return json({ok:true},200,{'Set-Cookie':cookieHeader(token,28800)});
}
