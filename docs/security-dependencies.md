# Security dependencies and PDF.js compatibility

Stacked on PR #6. Review/merge the earlier PRs first.

## Changes

- Next.js / eslint-config-next 16.3.8, PDF.js 6.4.299, DOMPurify 3.4.16.
- Refresh vulnerable transitive dependencies within supported dependency ranges.
- Require Node >=22.13.0; `.nvmrc` selects Node 22.
- Copy the matching PDF worker on install/build and test byte-for-byte agreement.
- Adapt PDF.js 6 loading to `{ url }` and cleanup to `loadingTask.destroy()`.
- Release the temporary PDF task used for AI text extraction.

## Verification

- 19 regression tests pass under Node 22.
- TypeScript passes against the upgraded packages.
- Next.js production build passes using placeholder public Supabase build settings.
- Headless Chrome smoke test loads a local PDF blob, renders a page, extracts expected
  text, and destroys its loading task successfully. This is a renderer smoke test,
  not authenticated end-to-end coverage of the entire workspace.
- `npm audit --omit=dev`: zero findings.
- Full audit: five high findings remain in the ESLint development dependency chain
  (`braces` -> `micromatch` -> `fast-glob` -> Next ESLint plugin/config). The suggested
  force fix downgrades Next ESLint to an incompatible major; it was not applied.

No production environment settings or migrations were changed. Existing Cloudflare
Pages preview checks fail independently of the passing GitHub regression checks and
Vercel previews; inspect that integration before treating all deployment gates as green.
