import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {scryptSync} from 'node:crypto';
import {adminAuthRequest} from '../admin-auth.mjs';
import {reportRequest} from '../reports.mjs';

test('admin login protects report, validates origin, rate limits and revokes sessions', async () => {
 const db=new DatabaseSync(':memory:');
 for (const name of ['0001_online_reports','0002_report_access','0003_report_sync_health','0004_report_chunks','0005_admin_login']) db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 const wrapped={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:db.prepare(sql).run(...args)}}}},async batch(statements){return Promise.all(statements.map(s=>s.all()))}};
 const salt=Buffer.alloc(16,1), hash=scryptSync('test-password',salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 const env={REPORTS_DB:wrapped,ADMIN_PASSWORD_HASH:`scrypt-v1:${salt.toString('hex')}:${hash.toString('hex')}`};
 function request(path, options={}) {return new Request('https://example.com'+path,options)}
 const login=(password,origin='https://example.com')=>request('/admin/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify({username:'admin',password})});
 assert.equal((await reportRequest(request('/admin/api/me'),env)).status,401);
 assert.equal((await adminAuthRequest(login('test-password','https://evil.example'),env)).status,403);
 assert.equal((await adminAuthRequest(login('wrong'),env)).status,401);
 const response=await adminAuthRequest(login('test-password'),env);assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await reportRequest(request('/admin/api/me',{headers:{Cookie:cookie}}),env)).status,200);
 assert.equal((await reportRequest(request('/admin/api/report?from=2026-11-01&to=2026-11-30',{headers:{Cookie:cookie}}),env)).status,200);
 assert.equal((await adminAuthRequest(request('/admin/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://example.com'}}),env)).status,200);
 assert.equal((await reportRequest(request('/admin/api/me',{headers:{Cookie:cookie}}),env)).status,401);
 for(let i=0;i<8;i++) await adminAuthRequest(login('wrong'),env);
 assert.equal((await adminAuthRequest(login('test-password'),env)).status,429);
 db.close();
});
