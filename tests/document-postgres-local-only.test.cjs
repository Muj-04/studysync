const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
for (const variable of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE']) {
 test(`local document PostgreSQL runner rejects ${variable} before invoking psql`,()=>{
  const env={...process.env,STUDYSYNC_PSQL:'/nonexistent-studysync-test-psql',PGHOST:'/tmp/studysync-local-test'};
  for (const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE']) delete env[key];
  env[variable]='unexpected-override';
  const result=spawnSync(process.execPath,['scripts/test-document-generations-postgres.cjs'],{env,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,new RegExp(`${variable} must be unset`));
  assert.doesNotMatch(result.stderr,/ENOENT/,'must reject before starting the configured executable');
 });
}
