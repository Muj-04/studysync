const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }

test('settings email network failure exits loading, displays error and permits retry', async () => {
  const harness = createHookHarness(); let calls = 0;
  const jsx = (type, props) => ({ type, props });
  const { AccountSection } = loadSource('src/features/settings/AccountSection.tsx', {
    react: { ...harness.react, useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ replace() {} }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ t: key => key }) },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/supabase/client': { createClient: () => ({ auth: { updateUser: async () => { calls++; if (calls === 1) throw Error('Network unavailable'); return { error: { message: 'Try another address' } }; } } }) },
    '@/lib/supabase/db': {},
    '@/components/AuthCaptcha': { default: () => null },
    '@/hooks/useAuthCaptcha': { useAuthCaptcha: () => ({ ready: true }) },
  });
  const render = () => nodes(harness.render(() => AccountSection({userEmail:'old@example.invalid',displayName:'Owner',profileHandle:'owner'})));
  let tree = render();
  const email = tree.find(n => n.props?.type === 'email');
  email.props.onChange('new@example.invalid');
  tree=render();
  const emailSection = tree.find(n => n.type==='div' && nodes(n).includes(tree.find(x=>x.props?.type==='email')) && n.props?.style?.marginBottom===20);
  const button = nodes(emailSection).find(n=>n.props?.onClick);
  await assert.doesNotReject(button.props.onClick());
  tree=render();
  assert.ok(tree.some(n=>n.props?.type==='err' && n.props.children==='Network unavailable'));
  const retrySection = tree.find(n=>n.type==='div' && n.props?.style?.marginBottom===20 && nodes(n).some(x=>x.props?.type==='email'));
  const retry=nodes(retrySection).find(n=>n.props?.onClick);
  assert.equal(retry.props.loading,false);
  await retry.props.onClick();
  assert.equal(calls,2);
  assert.ok(render().some(n=>n.props?.type==='err' && n.props.children==='Try another address'));
});

test('failed cloud deletion preserves local data and leaves settings confirmation retryable', async () => {
  const harness=createHookHarness(); const writes=[];
  const jsx=(type,props)=>({type,props});
  const { DataSection }=loadSource('src/features/settings/DataSection.tsx', {
    react:harness.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/contexts/LanguageContext':{useLanguage:()=>({t:key=>key})},
    'lucide-react':new Proxy({},{get:()=>()=>null}),
    '@/lib/storage':{KEYS:{DRAWINGS:'drawings',PAGE_IMAGES:'images',VOICE_NOTES:'voice'},storageSet:(...args)=>writes.push(args)},
    '@/lib/supabase/db':{
      getUserStorageStats:async()=>({documents:1,voiceNotes:1,drawings:1}),getLimitUsageStats:async()=>null,
      deleteAllDrawingsForUser:async()=>{throw Error('Deletion failed');},deleteAllVoiceNotesForUser:async()=>{},exportAllUserData:async()=>({}),
    },
  });
  const render=()=>nodes(harness.render(DataSection));
  let tree=render();
  tree.find(n=>n.props?.danger&&n.props?.onClick).props.onClick();
  tree=render();
  const modal=tree.find(n=>n.type?.name==='ConfirmModal');
  await assert.doesNotReject(modal.props.onConfirm());
  tree=render();
  assert.deepEqual(writes,[]);
  assert.ok(tree.some(n=>n.props?.type==='err'&&n.props.children==='Deletion failed'));
  assert.equal(tree.find(n=>n.type?.name==='ConfirmModal').props.loading,false);
  assert.equal(tree.find(n=>n.type?.name==='ConfirmModal').props.error,'Deletion failed');
});
