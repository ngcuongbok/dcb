# Feature Spec: prepare sharing previews after viewer loads

## Goal
Prepare a session's sharing image after its viewer has loaded so sharing bots can reuse the result.

## In Scope
- Trigger a background preview refresh after successful viewer data loading, without blocking the viewer.
- Store only validated, publicly readable Drive image URLs per session in a shared Cloudflare KV namespace.
- Have bots prefer the saved preview, with the existing read-only Apps Script lookup and brand image as fallbacks.
- Verify every candidate on the server: a browser must not be able to assign an unrelated photo to a session.

## Out Of Scope
- Changing GitHub Pages viewer, capture, printing, submission or Drive permissions.
- Uploading photos or storing customer details.

## Existing Behavior To Preserve
- Existing routes, viewer API calls, buttons, error handling and edit flow.
- Loading must work unchanged if preview storage or refresh fails.

## Acceptance Criteria
- [ ] Preview preparation happens only after a successful viewer response and does not delay display.
- [ ] Sessions cannot be assigned images supplied by an untrusted client.
- [ ] Stored images are scoped to the requested session; missing KV, inaccessible images and old Apps Script deployments fail safely.
- [ ] A later edit eventually refreshes a cached preview.

## Verification Plan
- [ ] Test success, invalid requests, disabled storage, backend failure, session separation and refresh behavior.
- [ ] Build, run Worker locally and verify existing viewer flows.
- [ ] Confirm Cloudflare deployment and Apps Script support before claiming end-to-end success.

## Rollback
Revert the website commit and remove its KV binding; leave existing Apps Script viewer actions unchanged.
