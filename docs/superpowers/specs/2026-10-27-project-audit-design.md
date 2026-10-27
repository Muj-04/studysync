# Project audit and modularity

The user requested a project-wide engineering review, confirmed bug fixes, focused
PRs, and smaller files separated by responsibility. Preserve existing features and
public interfaces. The baseline is PR15 (`f202cec`), which already fixes lint and
billing reconciliation. Do not merge or deploy production, add credentials, or
change hosted data in this audit.

Use independent branches for database modules, workspace extraction, API repairs,
and remaining UI repairs. Each targets PR15 until its dependency is merged into dev.
Prefer cohesive modules with compatibility facades to a flag-day import rewrite.
Do not split every file mechanically or make speculative product changes. Audit
remaining large files and document residual risks, including existing access gates.

Validate each branch with focused tests and TypeScript/lint, and validate their
combined tree with the full suite/build. Preserve database authorization, recovery,
queue coordination, browser hydration, cleanup and error reporting. Real provider
acceptance and production backup remain separate gates; no claim of zero defects.
