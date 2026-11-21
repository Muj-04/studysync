// Friend requests must need the receiver's consent (verified live with a
// rolled-back rehearsal on 2026-11-22; this guards the migration text).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('supabase/migrations/20261122000000_friendship_consent.sql', 'utf8')
  .replace(/--.*$/gm, '').replace(/\s+/g, ' ');

test('new friendships must be pending, own and not self', () => {
  assert.match(sql, /CREATE POLICY friendships_insert ON public\.friendships FOR INSERT TO authenticated WITH CHECK \( auth\.uid\(\) = requester_id AND requester_id <> receiver_id AND status = 'pending' \)/);
});

test('only the receiver can answer a pending request', () => {
  assert.match(sql, /FOR UPDATE TO authenticated USING \(auth\.uid\(\) = receiver_id AND status = 'pending'\) WITH CHECK \(auth\.uid\(\) = receiver_id AND status IN \('accepted', 'rejected'\)\)/);
});

test('only the status column is updatable', () => {
  assert.match(sql, /REVOKE UPDATE ON public\.friendships FROM anon, authenticated;/);
  assert.match(sql, /GRANT UPDATE \(status\) ON public\.friendships TO authenticated;/);
});
