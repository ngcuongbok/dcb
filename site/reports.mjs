import { adminIdentity } from './admin-auth.mjs';

const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z'));

export async function reportRequest(request, env) {
  if (!env.REPORTS_DB || !env.ADMIN_PASSWORD_HASH) return json({error:'report_not_configured'},503);
  const identity = await adminIdentity(request, env);
  if (!identity) return json({error:'unauthorized'},401);
  const url = new URL(request.url);
  if (url.pathname === '/admin/api/me' && request.method === 'GET') return json({email:'admin', owner:true});
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
      COALESCE(SUM(json_extract(data,'$.final_amount')),0) AS sold_revenue,
      SUM(CASE WHEN json_extract(data,'$.gross_amount') IS NULL THEN 1 ELSE 0 END) AS details_missing,
      SUM(json_extract(data,'$.gross_amount')) AS gross_revenue,
      SUM(json_extract(data,'$.discount_amount')) AS discounts,
      SUM(json_extract(data,'$.estimated_amount')) AS estimated,
      SUM(CASE WHEN json_extract(data,'$.discount_amount')>0 THEN 1 ELSE 0 END) AS discounted,
      SUM(CASE WHEN json_extract(data,'$.status')='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN json_extract(data,'$.status')='available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN json_extract(data,'$.booth_type')='ptb' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS ptb_revenue,
      SUM(CASE WHEN json_extract(data,'$.booth_type')='selfbooth' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS sb_revenue,
      SUM(CASE WHEN json_extract(data,'$.payment_method')='transfer' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS transfer_revenue,
      SUM(CASE WHEN json_extract(data,'$.payment_method')!='transfer' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS cash_revenue,
      SUM(CASE WHEN json_extract(data,'$.booth_type')='ptb' THEN 1 ELSE 0 END) AS ptb,
      SUM(CASE WHEN json_extract(data,'$.booth_type')='selfbooth' THEN 1 ELSE 0 END) AS selfbooth FROM keys`).bind(id,from,to),
    db.prepare(`WITH keys AS (SELECT j.value AS data FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind='keys' AND substr(json_extract(j.value,'$.created_at'),1,10) BETWEEN ? AND ?)
      SELECT json_extract(data,'$.staff_id') AS staff_id, MAX(json_extract(data,'$.staff_name')) AS name, COUNT(*) AS keys,
      SUM(CASE WHEN json_extract(data,'$.status')='used' THEN 1 ELSE 0 END) AS used,
      SUM(CASE WHEN json_extract(data,'$.status')='used' THEN json_extract(data,'$.final_amount') ELSE 0 END) AS used_revenue
      FROM keys GROUP BY staff_id ORDER BY used_revenue DESC`).bind(id,from,to),
    db.prepare(`SELECT json_extract(j.value,'$.staff_name') AS staff_name,json_extract(j.value,'$.start_at') AS start_at,json_extract(j.value,'$.end_at') AS end_at,json_extract(j.value,'$.status') AS status,json_extract(j.value,'$.total_revenue') AS total_revenue,json_extract(j.value,'$.cash_revenue') AS cash_revenue,json_extract(j.value,'$.transfer_revenue') AS transfer_revenue,json_extract(j.value,'$.ptb_revenue') AS ptb_revenue,json_extract(j.value,'$.selfbooth_revenue') AS selfbooth_revenue
      FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind='shifts' AND substr(json_extract(j.value,'$.start_at'),1,10) BETWEEN ? AND ? ORDER BY start_at DESC LIMIT 500`).bind(id,from,to),
    db.prepare(`SELECT substr(json_extract(j.value,'$.created_at'),1,10) AS day, COUNT(*) AS keys,
      SUM(json_extract(j.value,'$.final_amount')) AS revenue,
      SUM(json_extract(j.value,'$.gross_amount')) AS gross,
      SUM(json_extract(j.value,'$.discount_amount')) AS discount,
      SUM(CASE WHEN json_extract(j.value,'$.product')='ptb2x6' THEN 1 ELSE 0 END) AS ptb2x6,
      SUM(CASE WHEN json_extract(j.value,'$.product')='ptb4x6' THEN 1 ELSE 0 END) AS ptb4x6,
      SUM(CASE WHEN json_extract(j.value,'$.product')='sbShort' THEN 1 ELSE 0 END) AS sbShort,
      SUM(CASE WHEN json_extract(j.value,'$.product')='sbMedium' THEN 1 ELSE 0 END) AS sbMedium,
      SUM(CASE WHEN json_extract(j.value,'$.product')='sbLong' THEN 1 ELSE 0 END) AS sbLong
      FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind='keys' AND substr(json_extract(j.value,'$.created_at'),1,10) BETWEEN ? AND ? GROUP BY day ORDER BY day`).bind(id,from,to)
  ]);
  return json({snapshot:{completed_at:snapshot.completed_at,checked_at:snapshot.checked_at},summary:results[0].results[0],staff:results[1].results,shifts:results[2].results,daily:results[3].results});
}
