# Feature Spec: landing and existing viewer

## Goal
Provide a Next.js static landing and preserve the existing viewer for Cloudflare Pages deployment.

## In Scope
- Responsive landing, verified social links, metadata, sitemap, robots.
- Copy unchanged repository viewer files into the static build.
- Document Cloudflare Pages setup and viewer compatibility checks.

## Out Of Scope
- Blog admin, D1, R2, membership, Apps Script changes.

## Existing Behavior To Preserve
- Viewer and archive files, URLs, query parameters and customer photo workflow.
- GitHub Pages production and unrelated photobooth repository changes.

## Acceptance Criteria
- Landing builds to static HTML; no broken blog links.
- Viewer files in output match GitHub source byte for byte.
- Build deployable to Cloudflare Pages without D1.

## Verification Plan
- Production static build, output checks, viewer hash comparison, browser smoke test and diff check.
- Actual QR flows and redirect query strings require Cloudflare staging testing before DNS cutover.

## Rollback
- Keep main and production DNS unchanged until cutover.
