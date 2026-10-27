const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const client = { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) };
const storage = { KEYS: {}, storageGet: () => null, storageSet: () => true };
test('drawing save rejection is reported and local drawing remains available', async t => {
  const harness = createHookHarness(); const errors = [];
  t.mock.method(console, 'warn', (...args) => errors.push(args));
  const failure = Error('document deleted');
  const { usePDFDrawings } = loadSource('src/hooks/usePDFDrawings.ts', {
    react: harness.react, './useClientReady': { useClientReady: () => false },
    '@/lib/storage': storage, '@/lib/supabase/client': client,
    '@/lib/supabase/db': { saveDrawing: async () => { throw failure; } },
  });
  const hook = harness.render(usePDFDrawings); await tick();
  hook.saveDrawing('doc', 1, 'drawing'); await tick();
  assert.equal(harness.render(usePDFDrawings).getDrawing('doc', 1), 'drawing');
  assert.equal(errors.length, 1); assert.equal(errors[0].at(-1), failure);
});
test('voice upload rejection is reported while the recorded note is retained', async t => {
  const harness = createHookHarness(); const errors = []; let recorder;
  t.mock.method(console, 'warn', (...args) => errors.push(args));
  t.mock.method(console, 'log', () => {});
  const originalRecorder = global.MediaRecorder;
  global.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { recorder = { start() {} }; return recorder; }
  };
  const failure = Error('registration failed');
  t.after(() => { harness.unmount(); global.MediaRecorder = originalRecorder; });
  t.mock.method(global, 'setInterval', () => 1);
  const { useVoiceNotes } = loadSource('src/hooks/useVoiceNotes.ts', {
    react: harness.react,
    './useRecordingLifetime': { useRecordingLifetime: () => async () => ({ getTracks: () => [] }) },
    '@/lib/storage': storage, '@/lib/supabase/client': client,
    '@/lib/supabase/db': { fetchVoiceNotes: async () => [], getProfile: async () => null,
      getTotalVoiceStorageBytes: async () => 0, saveVoiceNote: async () => { throw failure; } },
  });
  const hook = harness.render(useVoiceNotes); await tick();
  await hook.startRecording('doc', 1);
  recorder.ondataavailable({ data: new Blob(['audio']) }); recorder.onstop(); await tick();
  const notes = harness.render(useVoiceNotes).notes;
  assert.equal(notes.length, 1); URL.revokeObjectURL(notes[0].audioUrl);
  assert.equal(errors.length, 1); assert.equal(errors[0].at(-1), failure);
});
