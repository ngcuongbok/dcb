import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {reportRequest} from '../reports.mjs';
if (!globalThis.crypto) globalThis.crypto=webcrypto;

test('owner and approved manager access only verified, complete data', async () => {
  const db=new DatabaseSync(':memory:');
  for (const name of ['0001_online_reports','0002_report_access','0003_report_sync_health','0004_report_chunks']) db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
  const wrapped={prepare(sql){let args=[];return {bind(...values){args=values;return this}, async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:db.prepare(sql).run(...args)}}}},async batch(statements){return Promise.all(statements.map(s=>s.all()))}};
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='key';
  const env={REPORTS_DB:wrapped,REPORT_OWNER_EMAIL:'owner@example.com',ACCESS_TEAM_DOMAIN:'https://dicii.cloudflareaccess.com',ACCESS_AUD:'aud'};
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  async function request(email,path,method='GET',body){
    const h=encode({alg:'RS256',kid:'key'}), p=encode({iss:env.ACCESS_TEAM_DOMAIN,aud:['aud'],email,exp:Math.floor(Date.now()/1000)+60});
    const signed=h+'.'+p, sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(signed));
    const headers={'Cf-Access-Jwt-Assertion':signed+'.'+Buffer.from(sig).toString('base64url')};
    if(body){headers.Origin='https://example.com';headers['Content-Type']='application/json'}
    return new Request('https://example.com'+path,{method,headers,body:body?JSON.stringify(body):undefined});
  }
  try {
    assert.equal((await reportRequest(await request('intruder@example.com','/admin/api/me'),env)).status,403);
    assert.equal((await reportRequest(await request('owner@example.com','/admin/api/managers','POST',{email:'manager@example.com'}),env)).status,200);
    assert.equal((await reportRequest(await request('manager@example.com','/admin/api/managers'),env)).status,403);
    assert.equal((await reportRequest(await request('manager@example.com','/admin/api/me'),env)).status,200);
    let res=await reportRequest(await request('manager@example.com','/admin/api/report?from=2026-11-01&to=2026-11-30'),env);
    assert.equal((await res.json()).snapshot,null);
    db.prepare("INSERT INTO report_snapshots(snapshot_id,created_at,completed_at,checked_at,expected_keys,expected_shifts,expected_staff,complete) VALUES('s','2026-11-15','2026-11-15','2026-11-15',2,0,0,1)").run();
    const rows=[{order_group:'same',legacy_order:0,status:'used',booth_type:'ptb',created_at:'2026-11-15',staff_id:'a',staff_name:'A',final_amount:60000},{order_group:'same',legacy_order:0,status:'available',booth_type:'ptb',created_at:'2026-11-15',staff_id:'a',staff_name:'A',final_amount:50000}];
    db.prepare("INSERT INTO report_chunks VALUES('s','keys',0,2,?)").run(JSON.stringify(rows));
    res=await reportRequest(await request('manager@example.com','/admin/api/report?from=2026-11-01&to=2026-11-30'),env);
    const data=await res.json();assert.equal(data.summary.orders,1);assert.equal(data.summary.keys,2);assert.equal(data.summary.used_revenue,60000);
    assert.equal((await reportRequest(await request('owner@example.com','/admin/api/managers','DELETE',{email:'manager@example.com'}),env)).status,200);
    assert.equal((await reportRequest(await request('manager@example.com','/admin/api/me'),env)).status,403);
  } finally {globalThis.fetch=original;db.close()}
});
