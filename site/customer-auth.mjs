import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex',...headers}});
const encoder=new TextEncoder();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
const safeId=s=>typeof s==='string' && /^[A-Za-z0-9_-]{6,160}$/.test(s);
const tokenFrom=req=>(req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-dicii_customer='))?.slice('__Host-dicii_customer='.length)||'';
const cookie=(token,age)=>`__Host-dicii_customer=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
const hashPassword=(password,salt)=>scryptSync(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});

export function customerLookup(phone,secret) {
  if(typeof secret!=='string' || !/^[a-f0-9]{64}$/i.test(secret)) throw Error('Customer lookup key is not configured');
  let digits=String(phone||'').replace(/[^0-9]/g,'');
  if(digits.length===11 && digits.startsWith('84')) digits='0'+digits.slice(2);
  if(!/^0[0-9]{9}$/.test(digits)) return null;
  return createHmac('sha256',Buffer.from(secret,'hex')).update('customer-phone:'+digits).digest('hex');
}
export async function customerIdentity(req,env) {
  const token=tokenFrom(req); if(!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.REPORTS_DB.prepare('SELECT customer_lookup FROM customer_login_sessions WHERE token_hash=? AND expires_at>?').bind(await sha(token),Math.floor(Date.now()/1000)).first();
}
async function session(db,lookup) {
  const token=randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO customer_login_sessions(token_hash,customer_lookup,expires_at) VALUES(?,?,?)').bind(await sha(token),lookup,Math.floor(Date.now()/1000)+2592000).run();
  return json({ok:true},200,{'Set-Cookie':cookie(token,2592000)});
}
async function rateLimitKey(db,source,maximum) {
  const now=Math.floor(Date.now()/1000),key=await sha(source);
  const result=await db.prepare(`INSERT INTO customer_auth_limits(ip_hash,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts`).bind(key,now,now-900,now-900).first();
  return !!result && result.attempts<=maximum;
}
export async function customerRequest(req,env) {
  if(!env.REPORTS_DB || !/^[a-f0-9]{64}$/i.test(String(env.CUSTOMER_LOOKUP_KEY||''))) return json({error:'unavailable'},503);
  const db=env.REPORTS_DB, url=new URL(req.url), path=url.pathname;
  if(req.method==='GET' && path==='/api/customer/me') {const id=await customerIdentity(req,env);return id?json({authenticated:true}):json({authenticated:false},401)}
  if(req.method==='GET' && path==='/api/customer/history') {
    const id=await customerIdentity(req,env);if(!id)return json({error:'unauthorized'},401);
    const page=Math.max(0,Math.min(1000,Number.parseInt(url.searchParams.get('page')||'0',10)||0));
    const data=await db.prepare(`SELECT alias_id,folder_id,mode,session_date,drive_state,thumbnail_file_id FROM customer_history_entries
      WHERE customer_lookup=? AND active=1 ORDER BY session_date DESC,alias_id DESC LIMIT 21 OFFSET ?`).bind(id.customer_lookup,page*20).all();
    const sessions=await Promise.all(data.results.slice(0,20).map(async row=>{
      if (!row.thumbnail_file_id && env.OG_PREVIEWS) {
        try {
          const suffix=row.mode==='sb'?'sb':'';
          const preview=await env.OG_PREVIEWS.get('viewer:'+row.alias_id+':'+suffix,'json');
          if (/^[A-Za-z0-9_-]{10,160}$/.test(String(preview?.imageId||'')) && ['image/jpeg','image/png','image/webp'].includes(preview.type)) {
            row.thumbnail_file_id=preview.imageId;
            await db.prepare('UPDATE customer_history_entries SET thumbnail_file_id=? WHERE alias_id=? AND customer_lookup=? AND active=1 AND thumbnail_file_id IS NULL').bind(preview.imageId,row.alias_id,id.customer_lookup).run();
          }
        } catch {}
      }
      return row;
    }));
    return json({sessions,has_more:data.results.length>20});
  }
  if(req.method!=='POST')return json({error:'not_found'},404);
  if(req.headers.get('Origin')!==url.origin)return json({error:'origin'},403);
  if(path==='/api/customer/logout') {const token=tokenFrom(req);if(/^[a-f0-9]{64}$/.test(token))await db.prepare('DELETE FROM customer_login_sessions WHERE token_hash=?').bind(await sha(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
  if(path!=='/api/customer/login' && path!=='/api/customer/claim')return json({error:'not_found'},404);
  if(!/^application\/json\b/i.test(req.headers.get('Content-Type')||'') || Number(req.headers.get('Content-Length')||0)>4096)return json({error:'invalid_request'},400);
  const ip=req.headers.get('CF-Connecting-IP');
  if(!ip || !await rateLimitKey(db,'ip:'+ip,60))return json({error:'rate_limit'},429);
  let body;try{const raw=await req.text();if(raw.length>4096)return json({error:'invalid_request'},400);body=JSON.parse(raw)}catch{return json({error:'invalid_request'},400)}
  const password=body?.password;
  if(typeof password!=='string' || password.length<10 || password.length>128)return json({error:'invalid_credentials'},400);
  if(path==='/api/customer/claim') {
    if(!safeId(body?.id))return json({error:'invalid_link'},400);
    if(!await rateLimitKey(db,'claim:'+body.id,10))return json({error:'rate_limit'},429);
    const salt=randomBytes(16),stored='scrypt-v1:'+salt.toString('hex')+':'+hashPassword(password,salt).toString('hex');
    const row=await db.prepare(`INSERT INTO customer_accounts(customer_lookup,password_hash,created_at)
      SELECT customer_lookup,?,? FROM customer_history_entries WHERE alias_id=? AND active=1 AND drive_state != 'expired'
      ON CONFLICT(customer_lookup) DO NOTHING RETURNING customer_lookup`).bind(stored,Math.floor(Date.now()/1000),body.id).first();
    if(!row)return json({error:'claim_unavailable'},409);
    return session(db,row.customer_lookup);
  }
  const lookup=customerLookup(body?.phone,env.CUSTOMER_LOOKUP_KEY);if(!lookup)return json({error:'invalid_credentials'},401);
  if(!await rateLimitKey(db,'login:'+lookup,10))return json({error:'rate_limit'},429);
  const user=await db.prepare('SELECT password_hash FROM customer_accounts WHERE customer_lookup=?').bind(lookup).first();
  const parts=String(user?.password_hash||'').split(':');
  const valid=parts.length===3 && parts[0]==='scrypt-v1' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{64}$/.test(parts[2]);
  const candidate=hashPassword(password,valid?Buffer.from(parts[1],'hex'):Buffer.alloc(16));
  if(!valid || !timingSafeEqual(candidate,Buffer.from(parts[2],'hex')))return json({error:'invalid_credentials'},401);
  return session(db,lookup);
}
