const { copyFileSync } = require('node:fs');
const { resolve } = require('node:path');
copyFileSync(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), resolve('public/pdf.worker.min.js'));
