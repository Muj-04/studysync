# Review follow-ups: document registration and PDF identity

Stacked on PR #9; fixes findings reported against PRs #2 and #3. The original PRs
should not be released without these follow-ups. No new migration is needed.

## Fixes

- Every atomic annotation replacement awaits a conflict-safe parent document insert.
  An existing document's metadata is preserved. Registration errors stop the RPC and
  propagate; later save attempts retry registration rather than caching a failed result.
- Explicit PDF reopen IDs no longer bypass content checks. Locally stored PDFs are
  compared using their actual bytes. With no local copy, a content-derived ID must
  match the selected bytes and authenticated account.
- Failed reopen validation is shown to the user, before replacing the stored PDF.

## Compatibility limitation

Legacy random document IDs cannot prove file identity on another device because no
trusted content fingerprint was retained for them. Such an explicit reopen is rejected;
use the original device with its local PDF, or open the PDF as a new document. Existing
annotations remain intact, but are not automatically copied to the new document.
A future legacy migration may persist verified fingerprints; filenames alone are not proof.
PDF bytes continue to stay local.

## Verification

24 regression tests pass, including delayed registration, registration failure/retry,
mismatched local PDF bytes, matching local legacy PDFs, content-derived IDs on a fresh
device, and cross-account ID rejection. Production dependency audit reports zero findings.

## Review still pending

The supplied review summary mentions inconsistent session exemptions in PR #4 but
omits its exact scenario and file references. That finding is not claimed resolved here;
request the full finding. PR #4 remains draft, with its existing Stripe staging gates.
All previously documented staging/RLS checks still apply. Nothing was merged or migrated.
