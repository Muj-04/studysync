import type { createClient } from './client';
import { requireDocumentGeneration } from './documentProtocol';

/** Annotation writes validate an existing parent; only explicit registration creates one. */
export async function ensureDocument(_client: ReturnType<typeof createClient>, userId: string, documentId: string) {
  return requireDocumentGeneration(userId, documentId);
}
