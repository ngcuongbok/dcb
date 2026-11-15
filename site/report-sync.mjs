const out = (body, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fields = {
  keys:['row_id','order_group','legacy_order','created_at','status','booth_type','payment_method','staff_id','staff_name','final_amount','gross_amount','discount_amount','estimated_amount','product'],
  shifts:['shift_id','staff_id','staff_name','start_at','end_at','status','total_revenue','cash_revenue','transfer_revenue','ptb_revenue','selfbooth_revenue'],
  staff:['staff_id','staff_name','active']
};
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const short = (x,max=120) => typeof x === 'string' && x.length <= max;
const amount = x => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000;
function validRow(kind,r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !fields[kind].includes(k))) return false;
  if (kind === 'keys') return hex(r.row_id) && hex(r.order_group) && [0,1].includes(r.legacy_order) && short(r.created_at,40) && /^\d{4}-\d\d-\d\d/.test(r.created_at) && ['available','pending','used'].includes(r.status) && ['ptb','selfbooth'].includes(r.booth_type) && short(r.payment_method,30) && short(r.staff_id,120) && short(r.staff_name,120) && amount(r.final_amount) && (r.gross_amount === undefined || (amount(r.gross_amount) && amount(r.discount_amount) && r.gross_amount === r.discount_amount + r.final_amount && [0,1].includes(r.estimated_amount) && ['sbLong','sbMedium','sbShort','ptb2x6','ptb4x6'].includes(r.product)));
  if (kind === 'shifts') return short(r.shift_id,120) && !!r.shift_id && short(r.staff_id,120) && short(r.staff_name,120) && short(r.start_at,40) && /^\d{4}-\d\d-\d\d/.test(r.start_at) && short(r.end_at,40) && short(r.status,30) && ['total_revenue','cash_revenue','transfer_revenue','ptb_revenue','selfbooth_revenue'].every(k => amount(r[k]));
  return short(r.staff_id,120) && !!r.staff_id && short(r.staff_name,120) && [0,1].includes(r.active);
}
async function authorized(request, token) {
  if (typeof token !== 'string' || token.length < 32) return false;
  const supplied = request.headers.get('authorization') || '';
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(supplied)),crypto.subtle.digest('SHA-256',encoder.encode('Bearer '+token))]);
  const x=new Uint8Array(a), y=new Uint8Array(b); let diff=0;
  for (let i=0;i<x.length;i++) diff |= x[i]^y[i];
  return diff === 0;
}

export async function syncRequest(request, env) {
  if (!env.REPORTS_DB || !env.REPORT_SYNC_TOKEN) return out({error:'not_configured'},503);
  if (request.method !== 'POST') return out({error:'method'},405);
  if (!await authorized(request,env.REPORT_SYNC_TOKEN)) return out({error:'unauthorized'},401);
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return out({error:'content_type'},415);
  if (Number(request.headers.get('content-length') || 0) > 150000) return out({error:'too_large'},413);
  let body; try { const raw=await request.text(); if(raw.length>150000) return out({error:'too_large'},413); body=JSON.parse(raw); } catch { return out({error:'invalid_json'},400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out({error:'invalid_json'},400);
  if (body.action === 'touch') {
    const result=await env.REPORTS_DB.prepare('UPDATE report_snapshots SET checked_at=? WHERE snapshot_id=? AND complete=1').bind(new Date().toISOString(),body.snapshot_id || '').run();
    return result.meta.changes ? out({ok:true}) : out({error:'snapshot_unavailable'},409);
  }
  const id=body.snapshot_id;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return out({error:'invalid_snapshot'},400);
  const db=env.REPORTS_DB;
  if (body.action === 'begin') {
    if (!Number.isSafeInteger(body.keys) || body.keys < 1 || body.keys > 50000 || !Number.isSafeInteger(body.shifts) || body.shifts < 0 || body.shifts > 10000 || !Number.isSafeInteger(body.staff) || body.staff < 0 || body.staff > 10000) return out({error:'invalid_counts'},400);
    await db.prepare('INSERT INTO report_snapshots(snapshot_id,created_at,expected_keys,expected_shifts,expected_staff) VALUES(?,?,?,?,?) ON CONFLICT(snapshot_id) DO NOTHING').bind(id,new Date().toISOString(),body.keys,body.shifts,body.staff).run();
    const existing=await db.prepare('SELECT complete,expected_keys,expected_shifts,expected_staff FROM report_snapshots WHERE snapshot_id=?').bind(id).first();
    if (!existing || existing.complete || existing.expected_keys !== body.keys || existing.expected_shifts !== body.shifts || existing.expected_staff !== body.staff) return out({error:'snapshot_unavailable'},409);
    return out({ok:true});
  }
  const snapshot=await db.prepare('SELECT complete,expected_keys,expected_shifts,expected_staff FROM report_snapshots WHERE snapshot_id=?').bind(id).first();
  if (snapshot && snapshot.complete === 1 && body.action === 'finish') return out({ok:true});
  if (!snapshot || snapshot.complete !== 0) return out({error:'snapshot_unavailable'},409);
  if (body.action === 'chunk') {
    const kind=body.kind, rows=body.rows, index=body.chunk_index;
    if (!Object.hasOwn(fields,kind) || !Number.isSafeInteger(index) || index < 0 || index > 500 || !Array.isArray(rows) || !rows.length || rows.length > 100 || !rows.every(row => validRow(kind,row))) return out({error:'invalid_rows'},400);
    await db.prepare('INSERT OR REPLACE INTO report_chunks(snapshot_id,kind,chunk_index,row_count,records_json) VALUES(?,?,?,?,?)').bind(id,kind,index,rows.length,JSON.stringify(rows)).run();
    return out({ok:true});
  }
  if (body.action === 'finish') {
    const identifiers={keys:'row_id',shifts:'shift_id',staff:'staff_id'};
    const counts=await db.batch(['keys','shifts','staff'].map(kind => db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT json_extract(j.value,'$.${identifiers[kind]}')) AS unique_ids FROM report_chunks c, json_each(c.records_json) j WHERE c.snapshot_id=? AND c.kind=?`).bind(id,kind)));
    if (counts.some((result,i) => result.results[0].n !== snapshot[['expected_keys','expected_shifts','expected_staff'][i]] || result.results[0].n !== result.results[0].unique_ids)) return out({error:'incomplete_snapshot'},409);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db.batch([
      db.prepare('UPDATE report_snapshots SET complete=1, completed_at=?, checked_at=? WHERE snapshot_id=? AND complete=0').bind(new Date().toISOString(),new Date().toISOString(),id),
      db.prepare('DELETE FROM report_snapshots WHERE complete=1 AND snapshot_id NOT IN (SELECT snapshot_id FROM report_snapshots WHERE complete=1 ORDER BY completed_at DESC LIMIT 2)'),
      db.prepare('DELETE FROM report_snapshots WHERE complete=0 AND created_at < ?').bind(cutoff)
    ]);
    return out({ok:true});
  }
  return out({error:'invalid_action'},400);
}
