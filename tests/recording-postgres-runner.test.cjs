const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('disposable PostgreSQL runner removes inherited host/service overrides before connecting', () => {
  let connection;
  const env = {
    RECORDING_TEST_PG_SOCKET: '/tmp/local-test-socket',
    RECORDING_TEST_PG_DATABASE: 'integrity_recordings',
    USER: 'local-test-user', PATH: '/usr/bin',
    PGHOSTADDR: '192.0.2.1', PGSERVICE: 'remote-service', PGSERVICEFILE: '/tmp/remote-service.conf',
  };
  assert.throws(() => vm.runInNewContext(fs.readFileSync('scripts/test-recording-postgres.cjs', 'utf8'), {
    process: { env }, console,
    require: name => name === 'node:child_process' ? {
      spawnSync: (bin, args, options) => { connection = { bin, args, options }; return { status: 1, stderr: 'test stopped before executing SQL' }; },
      spawn: () => { throw Error('unexpected connection'); },
    } : require(name),
  }), /test stopped before executing SQL/);
  assert.equal(connection.args[connection.args.indexOf('-h') + 1], '/tmp/local-test-socket');
  assert.ok(connection.options.env, 'child connections require an explicitly sanitized environment');
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) assert.equal(connection.options.env[key], undefined);
  assert.equal(env.PGHOSTADDR, '192.0.2.1', 'the caller environment must remain unchanged');
});
