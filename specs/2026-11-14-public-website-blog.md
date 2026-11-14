# Feature Spec: Dicii website and blog

## Goal
Create a public Next.js site and SEO-ready blog, with protected authoring and D1/R2 storage.

## In Scope
- Homepage, published blog and topic pages, canonical metadata, sitemap, robots and article structured data.
- Admin drafts, publication, labels, image upload, Cloudflare Access verification.
- Deployment instructions for Workers, D1 and R2.

## Out Of Scope
- Member accounts, points, OTP and changes to the viewer.

## Existing Behavior To Preserve
- Existing viewer and archive paths, contents and query strings.
- Existing GitHub Pages production until explicitly switched.

## Acceptance Criteria
- Published articles render server HTML with SEO metadata; drafts remain private.
- Admin protected by validated Cloudflare Access identity.
- Uploads limited to safe image types and size.
- GitHub deployment can be previewed before DNS migration.

## Verification Plan
- Next.js and Cloudflare build; verify SEO, draft privacy, admin protection and existing viewer assets.

## Rollback
- Leave current main branch and DNS unchanged; revert the website branch if necessary.
