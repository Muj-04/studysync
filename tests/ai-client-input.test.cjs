const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

async function withTransport(run) {
  const originalFetch = global.fetch, originalWindow = global.window;
  const requests = [];
  global.window = { dispatchEvent() {} };
  global.fetch = async (_url, init) => {
    requests.push(init.body);
    if (Buffer.byteLength(init.body, 'utf8') > 65536) return new Response('{"error":"Request body too large"}', { status: 413 });
    return new Response('{"result":"answer"}');
  };
  const client = loadSource('src/lib/gemini.ts', { '@/lib/supabase/client': { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } }) } });
  try { await run(client, requests); }
  finally { global.fetch = originalFetch; if (originalWindow === undefined) delete global.window; else global.window = originalWindow; }
}

test('long document actions serialize only the text the server uses, including multibyte and escaped inputs', async () => {
  await withTransport(async ({ callAI }, requests) => {
    for (const text of ['x'.repeat(100000), '漢😀'.repeat(100000), '\u0000'.repeat(100000), '\ud800'.repeat(100000)]) {
      for (const [action, limit] of [['summary', 8000], ['flashcards', 6000], ['explain', 2000], ['translate', 2000]]) {
        assert.equal(await callAI(action, text, action === 'translate' ? 'French' : undefined), 'answer');
        const raw = requests.at(-1), body = JSON.parse(raw);
        assert.equal(body.text, text.slice(0, limit));
        assert.ok(Buffer.byteLength(raw, 'utf8') <= 65536);
        if (action === 'translate') assert.equal(body.language, 'French');
      }
    }
  });
});

test('repeated chat requests bound page context and the current message independently without accumulating history', async () => {
  await withTransport(async ({ callAIChat }, requests) => {
    const pageText = '\u0000'.repeat(100000);
    for (let i = 0; i < 5; i++) {
      const message = `${i}:` + '漢😀\ud800\n'.repeat(30000);
      assert.equal(await callAIChat(pageText, message), 'answer');
      const raw = requests.at(-1), body = JSON.parse(raw);
      assert.deepEqual(body, { action: 'chat', text: pageText.slice(0, 6000), message: message.slice(0, 1000) });
      assert.ok(Buffer.byteLength(raw, 'utf8') <= 65536);
    }
    assert.equal(requests.length, 5);
  });
});
