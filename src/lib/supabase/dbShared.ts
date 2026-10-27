import { createClient } from './client';
import { ensureDocument } from './ensureDocument';

/** Resolve the existing browser singleton; domains must not construct their own clients. */
export function sb() { return createClient(); }

export async function userId(): Promise<string | null> {
  const { data: { user } } = await sb().auth.getUser();
  return user?.id ?? null;
}

// Keep successful registrations shared across domains and isolated by account.
const registeredDocs = new Map<string, Set<string>>();

export function markDocumentRegistered(uid: string, docId: string): void {
  const owners = registeredDocs.get(docId) ?? new Set<string>();
  owners.add(uid);
  registeredDocs.set(docId, owners);
}

export function forgetDocumentRegistration(docId: string): void {
  registeredDocs.delete(docId);
}

/** Failed parent writes must reject before any dependent write and remain retryable. */
export async function ensureDoc(uid: string, docId: string): Promise<void> {
  if (registeredDocs.get(docId)?.has(uid)) return;
  await ensureDocument(sb(), uid, docId);
  markDocumentRegistered(uid, docId);
}
