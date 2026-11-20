// The scheduled Supabase Edge Function must run exactly the reviewed worker logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const body = (file) => fs.readFileSync(file, 'utf8').split('\n').slice(1).join('\n');

test('edge recording worker matches src/lib/server/recordingWorker.ts', () => {
  assert.equal(
    body('supabase/functions/recording-worker/worker.ts'),
    body('src/lib/server/recordingWorker.ts'),
    'Copy src/lib/server/recordingWorker.ts to supabase/functions/recording-worker/worker.ts (keep the npm: import) and redeploy the function.',
  );
});
