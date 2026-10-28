const { loadSource } = require('./load-source.cjs');
/** Provider fixture; the actual domain adapters, durable outbox and queues run unchanged. */
exports.documentDomainFixture = function () {
  let owner='alice';let failure=null;let gate=null;const calls=[];const deleted=new Set();const storage=new Map();const revisions=new Map();const snapshots=new Map();const cache=new Map();
  const scope=(doc,collection,page='')=>JSON.stringify([owner,doc,collection,page]);
  const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},from:table=>({select:()=>({match:async()=>({data:[],count:0,error:null})}),delete:()=>({match:async filters=>{calls.push({kind:'delete',table});if(table==='documents')deleted.add(filters.id);return{error:null};}})}),rpc:async(name,args)=>{
    if(name==='read_document_collection_v2') {if(failure)return{error:{message:failure}};return{data:{rows:snapshots.get(scope(args.p_document_id,args.p_collection))??[],revisions:{}},error:null};}
    calls.push({kind:'write',name,args,owner});if(gate)await gate;if(failure)return{error:{message:failure}};if(deleted.has(args.p_document_id))return{error:{message:'DOCUMENT_DELETED',code:'PDD01'}};
    const k=scope(args.p_document_id,args.p_collection,args.p_page_key??'');const revision=(revisions.get(k)??0)+1;revisions.set(k,revision);return{data:revision,error:null};
  }};
  const mocks={'./client':{createClient:()=>client},'./documentProtocol':{
    knownDocumentGeneration:()=> 'gen',requireDocumentGeneration:async(uid,doc)=>{if(uid!==owner)throw Error('account changed');if(deleted.has(doc))throw Error('Document deleted');return'gen';},
    assertDocumentOwner:async uid=>{if(uid!==owner)throw Error('account changed');},registerDocument:async(uid,doc)=>{if(deleted.has(doc.id))throw Error('Document deleted');return'gen';},
    DocumentConflictError:class extends Error{code='DOCUMENT_CONFLICT';}},
    '@/lib/storage':{storageKeys:prefix=>[...storage.keys()].filter(key=>key.startsWith(prefix)),storageRemove:key=>storage.delete(key),storageGet:k=>storage.has(k)?JSON.parse(storage.get(k)):null,storageSet:(k,v)=>{storage.set(k,JSON.stringify(v));return true;}},
    '@/lib/documentLocalData':{deleteLocalDocument:async()=>{}},
  };
  const api=loadSource('src/lib/supabase/db.ts',mocks,cache);const collections=loadSource('src/lib/supabase/documentCollections.ts',mocks,cache);
  return{api,calls,storage,mocks,cache,collections,setOwner:v=>owner=v,setFailure:v=>failure=v,setGate:v=>gate=v,
    prepare:async(doc,collection,rows=[])=>{snapshots.set(scope(doc,collection),rows);return collections.readDocumentCollection(collection,doc);}};
};
