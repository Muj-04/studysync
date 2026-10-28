const { loadSource } = require('./load-source.cjs');
function fixture(kind = 'room') {
  const values = {}, objects = new Set(), rows = new Map(), calls = [];
  const state = { uid: 'alice', fail: '', failReads: false, denyStorage: false, gate: null, registrationGate: null, readLimit: Infinity };
  const storage = {
    upload: async (path, blob, options) => {
      calls.push(['upload', path, options.upsert]);
      if (state.gate) await state.gate;
      if (state.fail === 'upload') return { error: { message: 'upload failed' } };
      if (objects.has(path) && !options.upsert) return { error: { message: 'already exists', statusCode: '409' } };
      objects.add(path); if (state.fail === 'lost-upload') throw Error('response lost'); return { error: null };
    },
    createSignedUrl: async path => {
      calls.push(['sign', path]);
      if (state.fail === 'sign' || !objects.has(path)) return { error: { message: 'sign failed' }, data: null };
      return { error: null, data: { signedUrl: 'https://test/storage/v1/object/sign/voice-notes/' + path + '?token=test' } };
    },
    remove: async paths => {
      calls.push(['remove', paths]);
      if (state.fail === 'remove') return { error: { message: 'remove failed' } };
      paths.forEach(path => objects.delete(path)); return { error: null };
    },
  };
  const client = { storage: { from: () => storage }, from() {
    let action = 'read', input, filters = {}, single = false;
    const result = async () => {
      if (action === 'read' && state.failReads) throw Error('read unavailable');
      if (action === 'read') { const data=[...rows.values()].filter(row => Object.entries(filters).every(([key,value]) => row[key] === value)); return {data:single ? data[0]??null : data.slice(0,state.readLimit),count:data.length,error:null}; }
      if (action === 'delete') {
        calls.push(['delete']);
        if (state.fail === 'database-delete') return { error: { message: 'delete failed' } };
        const matched = [...rows.values()].filter(row => Object.entries(filters).every(([key,value]) => row[key] === value));
        matched.forEach(row => rows.delete(row.id));
        if (state.fail === 'lost-delete') throw Error('response lost');
        return { data: matched, error: null };
      }
      calls.push(['publish', input]);
      if (state.fail === 'database') return { error: { message: 'database failed', code: '23514' } };
      if (action === 'insert' && rows.has(input.id)) return { error: { message: 'duplicate', code: '23505' } };
      rows.set(input.id, input);
      if (state.fail === 'lost-publish-read') { state.failReads=true; throw Error('response lost'); }
      if (state.fail === 'lost-publish') throw Error('response lost');
      return { error: null, data: input };
    };
    const q = { eq(k,v) { filters[k]=v; return q; }, match(v) { Object.assign(filters,v); return q; }, select() { return q; }, maybeSingle() { single=true; return result(); }, then(a,b) { return result().then(a,b); }, delete() { action='delete'; return q; }, insert(v) { action='insert'; input=v; return q; }, upsert(v) { action='upsert'; input=v; return q; } };
    return q;
  } };
  const mocks = {
    './dbShared': { sb: () => client, userId: async () => state.uid, ensureDoc: async () => { if (state.registrationGate) await state.registrationGate; } },
    '@/lib/storage': { storageGet: k => values[k] ?? null, storageSet: (k,v) => { if (state.denyStorage) return false; values[k]=JSON.parse(JSON.stringify(v)); return true; } },
  };
  const cache = new Map();
  const api = loadSource(kind === 'room' ? 'src/lib/supabase/roomAnnotations.ts' : 'src/lib/supabase/voiceNotes.ts', mocks, cache);
  const recovery = () => loadSource('src/lib/supabase/recordingRecovery.ts', mocks, cache).recoverRecordings(kind === 'room' ? 'room' : 'document', 'scope');
  const note = { id:'note', documentId:'scope', pageNumber:1, audioBlob:new Blob(['audio'], {type:'audio/webm'}), timestamp:new Date('2026-10-28T00:00:00Z'), duration:1 };
  return { state, objects, rows, values, calls, note, recovery,
    blockDocument: id => loadSource('src/lib/persistence/documentQueue.ts', mocks, cache).enqueueDocumentDeletion(id, async()=>{}),
    recoverAll: () => loadSource('src/lib/supabase/recordingRecovery.ts', mocks, cache).recoverRecordings('document'),
    removeDocumentAll: () => loadSource('src/lib/supabase/documents.ts', mocks, cache).deleteAllDataForDocument('scope'),
    removeAll: () => loadSource('src/lib/supabase/documents.ts', mocks, cache).deleteAllVoiceNotesForDocument('scope'),
    save: () => kind === 'room' ? api.saveRoomVoiceNote('scope', note) : api.saveVoiceNote(note),
    remove: () => kind === 'room' ? api.deleteRoomVoiceNote('note','scope') : api.deleteVoiceNote('note','scope'),
  };
}

module.exports={fixture};
