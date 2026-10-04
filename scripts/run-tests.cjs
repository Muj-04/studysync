const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const files = readdirSync('tests').filter(name => name.endsWith('.test.cjs')).map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
