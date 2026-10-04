import { createClient } from '@/lib/supabase/client';
import { getAllStoredDocIds, getStoredPdf, savePdfBlob } from '@/lib/pdfStore';

export async function fingerprintPdf(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** File bytes determine identity; a filename alone must never replace a document. */
export async function identifyPdf(file: File, explicitId?: string) {
  const fingerprint = await fingerprintPdf(file);
  if (explicitId) return { id: explicitId, fingerprint };
  for (const id of await getAllStoredDocIds()) {
    const stored = await getStoredPdf(id);
    if (!stored) continue;
    const existingFingerprint = stored.fingerprint ?? await fingerprintPdf(stored.blob);
    if (!stored.fingerprint) await savePdfBlob(id, stored.blob, { filename: stored.filename, fingerprint: existingFingerprint });
    if (existingFingerprint === fingerprint) return { id, fingerprint };
  }
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error('Sign in to open a document');
  // Stable per account across devices, without uploading any PDF bytes.
  const identity = await fingerprintPdf(new Blob([`${user.id}:${fingerprint}`]));
  const id = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-8${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
  return { id, fingerprint };
}
