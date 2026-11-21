// Images are resized before they are stored (page images live in DB rows).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

const img = loadSource('src/lib/compressImage.ts');

test('large photos are scaled so the longest side fits', () => {
  assert.deepEqual(img.scaledSize(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(img.scaledSize(3024, 4032, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(img.scaledSize(4000, 10, 512), { width: 512, height: 1 });
});

test('small images keep their size', () => {
  assert.deepEqual(img.scaledSize(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(img.scaledSize(1600, 900, 1600), { width: 1600, height: 900 });
});

test('page images and avatars use bounded settings', () => {
  assert.equal(img.PAGE_IMAGE_OPTIONS.maxDimension, 1600);
  assert.equal(img.AVATAR_OPTIONS.maxDimension, 512);
  assert.ok(img.MAX_PAGE_IMAGE_DATA_URL_CHARS <= 2_000_000);
});

test('output extension follows the encoded type', () => {
  assert.equal(img.extensionForImageType('image/webp'), 'webp');
  assert.equal(img.extensionForImageType('image/png'), 'png');
  assert.equal(img.extensionForImageType('image/jpeg'), 'jpg');
});
