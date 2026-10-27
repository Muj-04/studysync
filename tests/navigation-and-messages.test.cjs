const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

test('message ordering preserves microseconds across timestamp offsets and fraction lengths', () => {
  const { mergeMessages } = loadSource('src/lib/supabase/messages.ts', { './client': {} });
  const rows = [
    { id: 'a', createdAt: '2026-10-04T14:00:00.0009+02:00' },
    { id: 'z', createdAt: '2026-10-04T12:00:00.000100Z' },
    { id: 'b', createdAt: '2026-10-04T12:00:00.000900+00:00' },
    { id: 'zero', createdAt: '2026-10-04T12:00:00Z' },
  ];
  assert.deepEqual(mergeMessages([], rows).map(row => row.id), ['zero', 'z', 'a', 'b']);
});

test('unauthenticated protected navigation retains the destination through login', async () => {
  const { NextRequest } = require('next/server');
  const { proxy } = loadSource('src/proxy.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
  });
  const response = await proxy(new NextRequest('https://studysync.test/room/invite-id?view=notes&from=friend'));
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://studysync.test');
  assert.equal(location.pathname, '/login');
  assert.equal(location.searchParams.get('redirect'), '/room/invite-id?view=notes&from=friend');
});

test('development origins include Android but are never allowed in production', () => {
  const { isAllowedOrigin, safeReturnPath, protectedPaths } = loadSource('src/lib/accessPolicy.ts');
  assert.equal(isAllowedOrigin('http://10.0.2.2:3000',false),true);
  assert.equal(isAllowedOrigin('http://10.0.2.2:3000',true),false);
  assert.equal(isAllowedOrigin('http://10.0.2.2.evil.test:3000',false),false);
  assert.equal(isAllowedOrigin('http://evil@10.0.2.2:3000',false),false);
  assert.equal(safeReturnPath('/pricing?annual=1'),'/pricing?annual=1');
  for(const value of ['https://evil.test','//evil.test','/\\evil.test','/\nevil.test']) assert.equal(safeReturnPath(value),'/dashboard');
  assert.ok(protectedPaths.includes('/flashcards'));
  assert.ok(protectedPaths.includes('/study-rooms'));
});

test('blank-page exports use virtual order instead of parsing UUID prefixes', () => {
  const { collectPages } = loadSource('src/lib/exportNotes.ts');
  const pages=collectPages({docId:'doc',pageOrder:['1','123abc-blank','2'],pageTextNotes:{'doc:2':[{content:'second PDF page'}],'doc:123abc-blank':[{content:'blank note'}]},bookmarks:[]});
  assert.deepEqual(pages.map(page=>page.pageLabel),['Page 2','Page 3']);
  assert.equal(pages[0].notes[0].content,'blank note');
});

test('conversation query selects newest messages then returns chronological order', async () => {
  const ordering=[];let filters=[];let ids;
  const rows=[{id:'newest',created_at:'2026-10-04T00:02:00Z'},{id:'older',created_at:'2026-10-04T00:01:00Z'}];
  const query={select(){return this},or(value){filters.push(value);return this},order(field,options){ordering.push([field,options.ascending]);return this},limit:async()=>({data:rows,error:null}),update(){return this},eq(){return this},in:async(_,value)=>{ids=value;return{error:null}}};
  const client={auth:{getUser:async()=>({data:{user:{id:'me'}}})},from:()=>query};
  const { getConversation,markMessagesRead }=loadSource('src/lib/supabase/messages.ts',{'./client':{createClient:()=>client}});
  const messages=await getConversation('friend',100,{createdAt:'2026-10-05T00:00:00Z',id:'cursor'});
  assert.deepEqual(ordering,[['created_at',false],['id',false]]);
  assert.deepEqual(messages.map(m=>m.id),['older','newest']);
  assert.ok(filters[1].includes('id.lt.cursor'));
  await markMessagesRead('friend',['newest']);
  assert.deepEqual(ids,['newest']);
});
