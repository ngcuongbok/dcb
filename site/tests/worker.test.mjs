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
