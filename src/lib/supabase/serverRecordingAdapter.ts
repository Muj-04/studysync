import { sb, userId } from './dbShared';
import { knownDocumentGeneration } from './documentProtocol';
import type { VoiceNote } from '@/types';

type Scope = 'document' | 'room';
type Intent = Readonly<{ owner: string; scope: Scope; scopeId: string; generation: string | null; note: VoiceNote }>;
type Operation = { id: string; note_id: string; owner_id: string; scope: Scope; scope_id: string; document_generation: string | null; state: string; object_path: string | null; audio_url: string };
export function serverRecordingRecoveryEnabled() { return process.env.NEXT_PUBLIC_SERVER_RECORDING_RECOVERY === 'true'; }

/** Capture the known lifetime before queuing; a retry must never discover a replacement parent. */
export function captureServerRecording(owner: string, scope: Scope, scopeId: string, note: VoiceNote): Intent {
  const generation = scope === 'document' ? knownDocumentGeneration(owner, scopeId) : null;
  if (scope === 'document' && !generation) throw new Error('Document generation is unknown. Keep or export this recording before retrying.');
  return Object.freeze({ owner, scope, scopeId, generation, note: { ...note } });
}
async function assertOwner(owner: string) {
  if (await userId() !== owner) throw new Error('The account changed before recording synchronization finished.');
}
function validate(op: Operation | null, intent: Pick<Intent, 'owner' | 'scope' | 'scopeId'>, noteId: string): asserts op is Operation {
  if (!op || op.owner_id !== intent.owner || op.scope !== intent.scope || op.scope_id !== intent.scopeId || op.note_id !== noteId) {
    throw new Error('The recording operation identity could not be confirmed. Keep the local audio.');
  }
}
export async function saveServerRecording(intent: Intent): Promise<string> {
  const { owner, scope, scopeId, generation, note } = intent;
  await assertOwner(owner);
  const mime = note.audioBlob.type.split(';')[0] || 'audio/webm';
  const { data, error } = await sb().rpc('begin_recording_operation', {
    p_expected_owner: owner, p_note_id: note.id, p_scope: scope, p_scope_id: scopeId, p_generation: generation,
    p_page: String(note.pageNumber), p_duration: note.duration, p_mime: mime,
    p_size: note.audioBlob.size, p_title: note.title ?? null,
    p_recorded_at: note.timestamp instanceof Date ? note.timestamp.toISOString() : String(note.timestamp),
  });
  if (error) throw new Error(error.message);
  const op = data as Operation | null;
  validate(op, intent, note.id);
  if (op.document_generation !== generation) throw new Error('The recording document generation changed. Keep the local audio.');
  await assertOwner(owner);
  if (op.state === 'published') return op.audio_url;
  if (op.state !== 'awaiting_upload' || !op.object_path) throw new Error('This recording cannot be published. Keep or export the local audio.');
  const uploaded = await sb().storage.from('voice-notes').upload(op.object_path, note.audioBlob, { upsert: false, contentType: mime });
  if (uploaded.error) {
    const status = String(uploaded.error.statusCode);
    if (!(status === '409' || (status === '400' && /^(?:The resource already exists|Asset Already Exists)$/i.test(uploaded.error.message)))) throw new Error(uploaded.error.message);
  }
  await assertOwner(owner);
  const confirmed = await sb().rpc('confirm_recording_upload', { p_id: op.id });
  if (confirmed.error) throw new Error(confirmed.error.message);
  const saved = confirmed.data as Operation | null;
  validate(saved, intent, note.id);
  await assertOwner(owner);
  if (saved.state !== 'published' || !saved.audio_url) throw new Error('Recording publication is pending or was revoked. Keep or export the local audio.');
  return saved.audio_url;
}
export async function deleteServerRecording(owner: string, scope: Scope, scopeId: string, noteId: string): Promise<void> {
  await assertOwner(owner);
  const generation = scope === 'document' ? knownDocumentGeneration(owner, scopeId) : null;
  if (scope === 'document' && !generation) throw new Error('Document generation is unknown. Keep the local recording until deletion can be confirmed.');
  const result = await sb().rpc('delete_recording_identity', {
    p_expected_owner: owner, p_note_id: noteId, p_scope: scope, p_scope_id: scopeId, p_generation: generation,
  });
  if (result.error) throw new Error(result.error.message);
  await assertOwner(owner);
  const deleted = result.data as Operation | null;
  validate(deleted, { owner, scope, scopeId }, noteId);
  // A quarantined legacy path remains available for operator reconciliation, but
  // the metadata deletion is durable and must not be undone by a client retry.
  if (!['deleting', 'deleted', 'blocked'].includes(deleted.state)) throw new Error('Recording deletion was not acknowledged.');
}

export async function renameServerRecording(owner: string, noteId: string, title: string | undefined): Promise<void> {
  await assertOwner(owner);
  const { data, error } = await sb().rpc('rename_recording', { p_note_id: noteId, p_title: title ?? null });
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== owner || data.note_id !== noteId || !['awaiting_upload', 'published'].includes(data.state)) throw new Error('Recording title was not acknowledged.');
  await assertOwner(owner);
}
