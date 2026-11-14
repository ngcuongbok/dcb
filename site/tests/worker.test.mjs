import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { isPreviewCrawler, previewParams, readPreview } from '../worker.mjs';

test('recognizes sharing crawlers without slowing ordinary Zalo browsers', () => {
  assert.equal(isPreviewCrawler('ZaloBot-LinkCrawler'), true);
  assert.equal(isPreviewCrawler('facebookexternalhit/1.1'), true);
  assert.equal(isPreviewCrawler('Mozilla/5.0 Zalo/24.1 Mobile'), false);
});

test('accepts session IDs but refuses malformed IDs and unknown modes', () => {
  assert.deepEqual(previewParams(new URL('https://example.com/viewer/?mode=sb&id=261112001_S803171')), {id:'261112001_S803171',mode:'sb'});
  assert.equal(previewParams(new URL('https://example.com/viewer/?id=%3Cscript%3E')), null);
  assert.deepEqual(previewParams(new URL('https://example.com/viewer/?id=123456789&mode=other')), {id:'123456789',mode:''});
});

test('normal viewer request returns asset without calling preview backend', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('preview API must not be called'); };
  try {
    const request = new Request('https://example.com/viewer/?id=123456789', {headers:{'user-agent':'Mozilla/5.0'}});
    const asset = new Response('viewer', {status:200});
    const result = await worker.fetch(request, {ASSETS:{fetch:async () => asset}}, {waitUntil(){}});
    assert.equal(await result.text(), 'viewer');
  } finally { globalThis.fetch = originalFetch; }
});

test('preview uses preview_id only, prefers first accessible image and rejects bad types', async () => {
  const originalFetch = globalThis.fetch;
  const calls=[];
  globalThis.fetch = async (input, options={}) => {
    const url = new URL(String(input)); calls.push({url,method:options.method || 'GET'});
    if (url.hostname === 'script.google.com') {
      return Response.json({ok:true,mode:'sb',imageIds:['firstIMAGE001','secondIMAGE02','invalid!']});
    }
    if (url.href.includes('firstIMAGE001')) return new Response(null,{status:200,headers:{'content-type':'text/html'}});
    return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
  };
  try {
    const value = await readPreview({id:'261112001_S803171',mode:'sb'});
    assert.equal(calls[0].url.searchParams.get('preview_id'),'261112001_S803171');
    assert.equal(calls[0].url.searchParams.has('id'),false);
    assert.equal(value.image,'https://lh3.googleusercontent.com/d/secondIMAGE02=w1600');
    assert.equal(value.mode,'sb');
    assert.equal(calls.length,3);
  } finally { globalThis.fetch = originalFetch; }
});

test('old Apps Script fallback does not request an image', async () => {
  const originalFetch=globalThis.fetch; let calls=0;
  globalThis.fetch=async () => { calls++; return Response.json({error:'missing ID'}); };
  try { assert.equal(await readPreview({id:'123456789',mode:''}),null); assert.equal(calls,1); }
  finally { globalThis.fetch=originalFetch; }
});

test('background refresh stores only an image selected by the backend', async () => {
  const originalFetch = globalThis.fetch;
  const values = new Map();
  const kv = {get: async key => values.has(key) ? JSON.parse(values.get(key)) : null,
    put: async (key, value) => values.set(key, value)};
  const pending = [];
  globalThis.fetch = async input => new URL(String(input)).hostname === 'script.google.com'
    ? Response.json({ok:true, mode:'sb', imageIds:['trustedIMAGE001']})
    : new Response(null,{headers:{'content-type':'image/jpeg'}});
  try {
    const req = new Request('https://example.com/viewer-preview-warm?id=123456789&mode=sb&imageId=attackerIMAGE01',
      {method:'POST',headers:{Origin:'https://example.com'}});
    const result = await worker.fetch(req, {OG_PREVIEWS:kv}, {waitUntil(p){pending.push(p);}});
    assert.equal(result.status,202);
    await Promise.all(pending);
    assert.equal(JSON.parse(values.get('viewer:123456789:sb')).imageId,'trustedIMAGE001');
  } finally { globalThis.fetch = originalFetch; }
});

test('background refresh rejects cross-origin calls and works without storage', async () => {
  const url = 'https://example.com/viewer-preview-warm?id=123456789';
  const context = {waitUntil(){throw new Error('must not run');}};
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{Origin:'https://other.example'}}),{},context)).status,403);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{Origin:'https://example.com'}}),{},context)).status,503);
  assert.equal((await worker.fetch(new Request(url),{},context)).status,405);
});

test('fresh saved preview avoids another backend lookup', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {throw new Error('must not call backend');};
  const pending=[];
  const kv={get:async () => ({imageId:'trustedIMAGE001',type:'image/jpeg',savedAt:Date.now()})};
  try {
    const req=new Request('https://example.com/viewer-preview-warm?id=123456789',{method:'POST',headers:{Origin:'https://example.com'}});
    assert.equal((await worker.fetch(req,{OG_PREVIEWS:kv},{waitUntil(p){pending.push(p);}})).status,202);
    await Promise.all(pending);
  } finally { globalThis.fetch=originalFetch; }
});
