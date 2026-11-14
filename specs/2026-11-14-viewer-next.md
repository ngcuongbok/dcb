# Feature Spec: Next.js viewer migration

## Goal
Prepare a readable, separately testable Next.js viewer based on app/web-online while preserving the live viewer.

## In Scope
- A separate `/viewer-v2` Next.js route with source-based CSS, markup and readable compatibility script.
- Preserve query strings, Apps Script endpoints, viewer actions and SelfBooth interaction as closely as possible.
- Compare with existing viewer using test sessions and document what remains unverified.

## Out Of Scope
- Replace live `/viewer` or modify Apps Script backend, capture, print, upload or key behavior.
- Claim complete React migration before incremental port and real PTB/SelfBooth validation.

## Existing Behavior To Preserve
- Existing viewer/archives URLs, QR parameters, loading, gallery, downloads, edit and submit flows.

## Acceptance Criteria
- Existing viewer unchanged; v2 is independently accessible without encoding/obfuscation.
- v2 markup displays the original viewer, with source handling retained and React rendering its shell.
- Test modes and compare original vs v2 without submitting customer orders.

## Verification Plan
- Build, source extraction equivalence, syntax, browser smoke tests, real test QR with non-destructive checks, diff whitespace.
- End-to-end cashier submission requires a disposable test order and explicit separate coordination.

## Rollback
- Remove the v2 route and assets; existing live viewer is unaffected.
