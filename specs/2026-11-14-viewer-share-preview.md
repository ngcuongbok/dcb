# Feature Spec: per-session viewer sharing preview

## Goal
Show an appropriate existing Drive image and safe, non-identifying metadata when a viewer link is shared.

## In Scope
- Cloudflare Worker injects per-session Open Graph/Twitter metadata into viewer HTML for recognized link-preview crawlers.
- Apps Script read-only endpoint resolves viewer aliases and selects candidate photo IDs without recording a view, changing Drive permissions, uploading or creating files.
- Prefer existing composed images; fall back to source images and the brand image on missing data, inaccessible image, timeouts or errors.
- Short per-session, per-mode cache for successful results only; preserve query strings and noindex.

## Out of Scope
- Altering viewer HTML on GitHub Pages, modifying capture/print/upload/submit, changing Drive permissions or publishing photos beyond link-sharing behavior.

## Existing Behavior To Preserve
- All /viewer/ and archive paths, query strings, API actions and customer workflows.
- Human viewer requests must not wait for preview metadata. Existing Worker serves all other static assets as before.

## Acceptance Criteria
- Recognized bots see initial HTML with title, description, session URL and a validated anonymous JPEG/PNG/WebP image when available.
- No preview API mutates Drive, marks session viewed, or returns customer identity.
- Fallback works if Apps Script action unavailable, slow, invalid ID or inaccessible image.
- Live GitHub Pages /viewer remains byte identical; no mixing cache entries among sessions.

## Verification
- Test mocked Apps Script and Worker behavior, HTML escaping and caching, route/redirect/query behavior, normal viewer and old files.
- Deploy Worker only when safe fallback verified; Apps Script action must separately be deployed to existing web app before live previews work.

## Rollback
- Restore previous Cloudflare Worker deployment; Apps Script addition is isolated in doGet.
