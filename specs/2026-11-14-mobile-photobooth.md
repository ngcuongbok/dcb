# Feature Spec: Mobile photobooth service

## Goal
Add a public service tab and page showing mobile photobooth sample photos supplied by the user.

## In Scope
- Homepage navigation and link, service description, gallery, inquiry link, metadata and sitemap.
- Optimized images from the supplied Drive demo folder.

## Out Of Scope
- Unconfirmed price list, booking backend, viewer, capture or existing customer flow changes.

## Preserve
- Existing homepage navigation, social links, viewer files and QR URLs.

## Acceptance / Verification
- Service page and four demo images build and render on desktop/mobile.
- Inquiry and navigation links resolve; viewer files match the source.
- Build, static routes and diff checks pass.

## Rollback
- Revert the page commit; pre-change diff/status backup is in .codex-backups.
