# Feature Spec: retro landing refresh

## Goal
Refresh DiciiBooth homepage in a playful vintage collage direction inspired by the supplied reference.

## In Scope
- Homepage layout, original collage artwork, responsive styles.
- Preserve existing Photobooth, SelfBooth, photo retrieval and social/contact links.

## Out Of Scope
- Viewer, archive, AppScript, Cloudflare configuration, blog and membership flows.

## Existing Behavior To Preserve
- Navigation anchors, Facebook and TikTok targets, SEO metadata and Google Analytics.
- All viewer files and QR paths remain unchanged.

## Acceptance Criteria
- Responsive, accessible landing in retro editorial style; no fabricated services.
- Existing navigation and external links work; artwork is original.

## Verification Plan
- Build static site, browser check desktop/mobile, compare viewer output hashes, diff check.

## Rollback
- Revert the commit; backup of original working tree stored in .codex-backups.
