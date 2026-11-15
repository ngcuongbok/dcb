import { verifyAccess } from './report-auth.mjs';

const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z'));

export async function reportRequest(request, env) {
  if (!env.REPORTS_DB || !env.REPORT_OWNER_EMAIL || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return json({error:'report_not_configured'},503);
  const identity = await verifyAccess(request, env);
  if (!identity) return json({error:'unauthorized'},401);
  const owner = identity.email === String(env.REPORT_OWNER_EMAIL).trim().toLowerCase();
  const manager = owner ? null : await env.REPORTS_DB.prepare('SELECT email FROM report_allowed_managers WHERE email = ?').bind(identity.email).first();
  if (!owner && !manager) return json({error:'forbidden'},403);
  const url = new URL(request.url);
  if (url.pathname === '/admin/api/me' && request.method === 'GET') return json({email:identity.email, owner});
  if (url.pathname === '/admin/api/managers') {
    if (!owner) return json({error:'owner_only'},403);
    if (request.method === 'GET') return json({managers:(await env.REPORTS_DB.prepare('SELECT email, added_at FROM report_allowed_managers ORDER BY email').all()).results});
    if (request.method !== 'POST' && request.method !== 'DELETE') return json({error:'method'},405);
    if (request.headers.get('origin') !== url.origin) return json({error:'origin'},403);
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json({error:'content_type'},415);
    let body; try { body = await request.json(); } catch { return json({error:'invalid_json'},400); }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!validEmail(email) || email === identity.email) return json({error:'invalid_email'},400);
    if (request.method === 'POST') await env.REPORTS_DB.prepare('INSERT INTO report_allowed_managers(email,added_at,added_by) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING').bind(email,new Date().toISOString(),identity.email).run();
    else await env.REPORTS_DB.prepare('DELETE FROM report_allowed_managers WHERE email = ?').bind(email).run();
    return json({ok:true});
  }
  if (url.pathname !== '/admin/api/report' || request.method !== 'GET') return json({error:'not_found'},404);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!validDate(from) || !validDate(to) || from > to) return json({error:'invalid_date_range'},400);
  const snapshot = await env.REPORTS_DB.prepare('SELECT snapshot_id, completed_at, checked_at FROM report_snapshots WHERE complete = 1 ORDER BY completed_at DESC LIMIT 1').first();
  if (!snapshot) return json({snapshot:null, summary:null, staff:[], shifts:[]});
  const db=env.REPORTS_DB, id=snapshot.snapshot_id;
  const results=await db.batch([
    db.prepare(`WITH keys AS (SELECT j.value AS data FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind='keys' AND substr(json_extract(j.value,'$.created_at'),1,10) BETWEEN ? AND ?)
      SELECT COUNT(*) AS keys, COUNT(DISTINCT json_extract(data,'$.order_group')) AS orders,
      SUM(CASE WHEN json_extract(data,'$.legacy_order')=1 THEN 1 ELSE 0 END) AS legacy_keys,
      SUM(CASE WHEN json_extract(data,'$.status')='used' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN json_extract(data,'$.status')='used' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS used_revenue,
      SUM(CASE WHEN json_extract(data,'$.booth_type')='ptb' THEN 1 ELSE 0 END) AS ptb,
      SUM(CASE WHEN json_extract(data,'$.booth_type')='selfbooth' THEN 1 ELSE 0 END) AS selfbooth FROM keys`).bind(id,from,to),
    db.prepare(`WITH keys AS (SELECT j.value AS data FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind='keys' AND substr(json_extract(j.value,'$.created_at'),1,10) BETWEEN ? AND ?)
      SELECT json_extract(data,'$.staff_id') AS staff_id, MAX(json_extract(data,'$.staff_name')) AS name, COUNT(*) AS keys,
      SUM(CASE WHEN json_extract(data,'$.status')='used' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN json_extract(data,'$.status')='used' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS used_revenue
      FROM keys GROUP BY staff_id ORDER BY used_revenue DESC`).bind(id,from,to),
    db.prepare(`SELECT json_extract(j.value,'$.staff_name') AS staff_name,json_extract(j.value,'$.start_at') AS start_at,json_extract(j.value,'$.end_at') AS end_at,json_extract(j.value,'$.status') AS status,json_extract(j.value,'$.total_revenue') AS total_revenue,json_extract(j.value,'$.cash_revenue') AS cash_revenue,json_extract(j.value,'$.transfer_revenue') AS transfer_revenue,json_extract(j.value,'$.ptb_revenue') AS ptb_revenue,json_extract(j.value,'$.selfbooth_revenue') AS selfbooth_revenue
      FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind='shifts' AND substr(json_extract(j.value,'$.start_at'),1,10) BETWEEN ? AND ? ORDER BY start_at DESC LIMIT 500`).bind(id,from,to)
  ]);
  return json({snapshot:{completed_at:snapshot.completed_at,checked_at:snapshot.checked_at},summary:results[0].results[0],staff:results[1].results,shifts:results[2].results});
}
