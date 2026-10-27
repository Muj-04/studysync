# Hosted staging checks

These scripts create synthetic fixtures and roll back all changes. Run only on
the confirmed staging project, as postgres, never on production. Each script
must be submitted as one SQL execution that stops on its first error. With psql:

```sh
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/staging/study-statistics.sql
```

The Supabase MCP execution used the entire file as one `execute_sql` call. An
error response is a failure regardless of any printed PASS text. Do not run
individual statements in an editor that continues after errors: PostgreSQL can
roll back the failed transaction and still execute a later standalone SELECT.

The tests cover database behavior only. They do not replace browser, provider,
concurrent-connection or backup/restore acceptance. Current observed results and
remaining gates are in `docs/staging-execution-2026-10-26.md`.

For the current billing path, run `billing-reconciliation.sql` after the
`serialize_billing_reconciliation` migration. `billing-quota.sql` remains a
postgres-only historical regression for the old writer and quota functions; its
timestamp-order assertions do not describe the new authoritative reconciliation
path. The old writer is deliberately revoked from service_role.
