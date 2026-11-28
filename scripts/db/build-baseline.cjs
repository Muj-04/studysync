#!/usr/bin/env node
// Turns the output of scripts/db/schema-snapshot.sql into a baseline migration.
//
//   node scripts/db/build-baseline.cjs <snapshot.sql> <out-migration.sql> [source-label]
//
// The snapshot is the single text value the generator returns (psql -At or
// the SQL editor). This script only adds a header and makes the extensions
// that are Supabase-only (pg_cron, pg_net) tolerant, so the same file can be
// replayed on a plain Postgres used for tests.
'use strict';
const fs = require('node:fs');

function buildBaseline(ddl, { source = 'production', generatedOn = new Date().toISOString().slice(0, 10) } = {}) {
  if (!ddl.includes('CREATE TABLE')) throw new Error('Snapshot looks empty: no CREATE TABLE found.');
  if (/sk_(live|test)_[A-Za-z0-9]/.test(ddl)) throw new Error('Snapshot contains a Stripe key; refusing to write it.');
  const tolerant = (ext, schema) =>
    `DO $ext$ BEGIN\n  CREATE EXTENSION IF NOT EXISTS ${ext}${schema ? ` WITH SCHEMA ${schema}` : ''};\n` +
    `EXCEPTION WHEN undefined_file OR feature_not_supported THEN\n  RAISE NOTICE '${ext} is not available here (plain Postgres test database)';\nEND $ext$;`;
  const body = ddl
    .replace(/^CREATE EXTENSION IF NOT EXISTS pg_cron;$/m, tolerant('pg_cron'))
    .replace(/^CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA (\w+);$/m, (_, s) => tolerant('pg_net', s));
  const header = [
    '-- StudySync baseline schema.',
    `-- Generated ${generatedOn} from ${source} with scripts/db/schema-snapshot.sql (read-only catalog queries).`,
    '-- Recreates every StudySync object: tables, constraints, indexes, functions, views,',
    '-- triggers, RLS policies, grants, storage buckets and policies, realtime publication',
    '-- membership and cron jobs. It contains no row data and no secrets.',
    '--',
    '-- Existing databases (production, staging) already match this file: mark it applied,',
    '-- do not run it. Older history lives in supabase/migrations_archive/.',
    '',
  ].join('\n');
  return `${header}\n${body.trim()}\n`;
}

module.exports = { buildBaseline };

if (require.main === module) {
  const [input, output, source] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/db/build-baseline.cjs <snapshot.sql> <out-migration.sql> [source-label]');
    process.exit(1);
  }
  fs.writeFileSync(output, buildBaseline(fs.readFileSync(input, 'utf8'), { source }));
  console.log(`Wrote ${output}`);
}
