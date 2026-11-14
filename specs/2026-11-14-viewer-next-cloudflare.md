# Cloudflare Next.js viewer

## Goal
Use the tested Next.js compatibility viewer for the Cloudflare build at /viewer/ while retaining the original viewer files for GitHub Pages.

## In scope
- Cloudflare Next.js build route, legacy QR aliases and query strings, archive preservation.
- Tests for PTB, SelfBooth and deploy rollback.

## Out of scope
- Altering root viewer files, Apps Script deployment, key/capture/print or modifying live GitHub Pages viewer.
- Claiming full React rewrite or resolving pre-existing PT Card issues without validation.

## Preserve
- viewer/index.html and archive.html in repository, API, QR links, editing, downloads, submit workflow.

## Acceptance
- Build routes /viewer/, /viewer/index.html, archive and query params work on Cloudflare.
- Original GitHub Pages viewer bytes remain unchanged.
- PTB and SelfBooth tested; known PT Card and Apps Script limitations documented before rollout.

## Verification
- Build, syntax, local Workers routing, exact source comparisons, read-only PTB/SB test sessions and diff check.
- Roll back by reverting deployment commit; GitHub Pages files unchanged.
