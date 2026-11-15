import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyAccess } from '../report-auth.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const enc = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

test('only accepts a valid Access signature, issuer, audience and expiration', async () => {
  const pair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk = await crypto.subtle.exportKey('jwk',pair.publicKey); jwk.kid = 'k1';
  const env={ACCESS_TEAM_DOMAIN:'https://dicii.cloudflareaccess.com',ACCESS_AUD:'expected'};
  const fetchKeys=async () => Response.json({keys:[jwk]});
  const token=async overrides => {
    const header=enc({alg:'RS256',kid:'k1'});
    const payload=enc({iss:env.ACCESS_TEAM_DOMAIN,aud:[env.ACCESS_AUD],email:'Manager@example.com',exp:Math.floor(Date.now()/1000)+60,...overrides});
    const data=header+'.'+payload;
    const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));
    return data+'.'+Buffer.from(signature).toString('base64url');
  };
  const request=async overrides => new Request('https://example.com/admin/',{headers:{'Cf-Access-Jwt-Assertion':await token(overrides)}});
  assert.deepEqual(await verifyAccess(await request({}),env,fetchKeys),{email:'manager@example.com'});
  assert.equal(await verifyAccess(await request({aud:['wrong']}),env,fetchKeys),null);
  assert.equal(await verifyAccess(await request({iss:'https://evil.cloudflareaccess.com'}),env,fetchKeys),null);
  assert.equal(await verifyAccess(await request({exp:1}),env,fetchKeys),null);
  assert.equal(await verifyAccess(await request({}),{},fetchKeys),null);
  assert.equal(await verifyAccess(new Request('https://example.com/admin/'),env,fetchKeys),null);
  const t=await token({});
  const bad=t.slice(0,-5)+'AAAAA';
  assert.equal(await verifyAccess(new Request('https://example.com/admin/',{headers:{'Cf-Access-Jwt-Assertion':bad}}),env,fetchKeys),null);
});
