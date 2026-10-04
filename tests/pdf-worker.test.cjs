const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
test('served PDF worker matches the installed renderer version exactly', () => {
  assert.deepEqual(readFileSync('public/pdf.worker.min.js'), readFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'));
});
