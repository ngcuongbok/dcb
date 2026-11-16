import { authorized } from './report-sync.mjs';
const out=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const safe=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{6,160}$/.test(s);
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const valid=r=>r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).every(k=>['alias_id','customer_lookup','folder_id','mode','session_date','drive_state','thumbnail_file_id'].includes(k))&&safe(r.alias_id)&&safe(r.folder_id)&&digest(r.customer_lookup)&&['ptb','sb'].includes(r.mode)&&typeof r.session_date==='string'&&r.session_date.length<=32&&['unknown','available','expired'].includes(r.drive_state)&&(r.thumbnail_file_id===null||safe(r.thumbnail_file_id));
export async function customerIngest(request,env) {
 if(!env.REPORTS_DB||!env.REPORT_SYNC_TOKEN)return out({error:'unavailable'},503);
 if(request.method!=='POST')return out({error:'method'},405);
 if(!await authorized(request,env.REPORT_SYNC_TOKEN))return out({error:'unauthorized'},401);
 if(!/^application\/json\b/i.test(request.headers.get('content-type')||'')||Number(request.headers.get('content-length')||0)>60000)return out({error:'invalid_request'},400);
 let data;try{const raw=await request.text();if(raw.length>60000)return out({error:'invalid_request'},400);data=JSON.parse(raw)}catch{return out({error:'invalid_request'},400)}
 if(Array.isArray(data?.blocked)) {
   if(!data.blocked.length||data.blocked.length>25||!data.blocked.every(safe)||new Set(data.blocked).size!==data.blocked.length)return out({error:'invalid_rows'},400);
   await env.REPORTS_DB.batch(data.blocked.map(id=>env.REPORTS_DB.prepare('UPDATE customer_history_entries SET active=0 WHERE alias_id=?').bind(id)));
   return out({ok:true});
 }
 if(!Array.isArray(data?.rows)||!data.rows.length||data.rows.length>25||!data.rows.every(valid)||new Set(data.rows.map(r=>r.alias_id)).size!==data.rows.length)return out({error:'invalid_rows'},400);
 await env.REPORTS_DB.batch(data.rows.map(r=>env.REPORTS_DB.prepare(`INSERT INTO customer_history_entries(alias_id,customer_lookup,folder_id,mode,session_date,drive_state,thumbnail_file_id)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(alias_id) DO UPDATE SET
   active=CASE WHEN customer_history_entries.customer_lookup=excluded.customer_lookup AND customer_history_entries.folder_id=excluded.folder_id THEN 1 ELSE 0 END,
   session_date=CASE WHEN customer_history_entries.customer_lookup=excluded.customer_lookup AND customer_history_entries.folder_id=excluded.folder_id THEN excluded.session_date ELSE customer_history_entries.session_date END,
   drive_state=CASE WHEN customer_history_entries.customer_lookup!=excluded.customer_lookup OR customer_history_entries.folder_id!=excluded.folder_id OR excluded.drive_state='unknown' THEN customer_history_entries.drive_state ELSE excluded.drive_state END,
   thumbnail_file_id=CASE WHEN customer_history_entries.customer_lookup!=excluded.customer_lookup OR customer_history_entries.folder_id!=excluded.folder_id THEN customer_history_entries.thumbnail_file_id ELSE COALESCE(excluded.thumbnail_file_id,customer_history_entries.thumbnail_file_id) END`).bind(r.alias_id,r.customer_lookup,r.folder_id,r.mode,r.session_date,r.drive_state,r.thumbnail_file_id)));
 return out({ok:true});
}
