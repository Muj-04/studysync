import { sb, userId } from './dbShared';

// ── Direct messages (1:1 friend chat) ────────────────────────────────────────
//
// The `direct_messages` table is RLS-protected at the database level:
//   * INSERT requires sender_id = auth.uid() AND an accepted friendship row
//     between sender and recipient (in either direction) — non-friends can't
//     message each other even via direct client calls.
//   * SELECT is limited to rows where the caller is sender or recipient.
//   * UPDATE is limited to the recipient, and a BEFORE UPDATE trigger pins
//     every column except `read` so the recipient can only mark-as-read,
//     not rewrite content.
// The helpers below are convenience wrappers; the security boundary lives
// in Postgres, not here.

export interface DirectMessage {
  id:          string;
  senderId:    string;
  recipientId: string;
  content:     string;
  read:        boolean;
  createdAt:   string;
}

type DirectMessageRow = {
  id:           string;
  sender_id:    string;
  recipient_id: string;
  content:      string;
  read:         boolean;
  created_at:   string;
};

function mapDirectMessage(r: DirectMessageRow): DirectMessage {
  return {
    id:          r.id,
    senderId:    r.sender_id,
    recipientId: r.recipient_id,
    content:     r.content,
    read:        r.read,
    createdAt:   r.created_at,
  };
}

export async function sendDirectMessage(
  recipientId: string,
  content:     string,
): Promise<DirectMessage | null> {
  const uid = await userId(); if (!uid) return null;
  const { sanitizeText } = await import('@/lib/sanitize');
  const safe = sanitizeText(content).slice(0, 4000);
  if (!safe) return null;
  const { data, error } = await sb()
    .from('direct_messages')
    .insert({ sender_id: uid, recipient_id: recipientId, content: safe })
    .select('id, sender_id, recipient_id, content, read, created_at')
    .single();
  if (error || !data) { console.error('[DB] sendDirectMessage error:', error?.message); return null; }

  // The recipient's direct_message notification is produced by the
  // direct_messages_create_notification AFTER INSERT trigger — sender_id,
  // recipient_id, and a snippet of NEW.content are read straight from the
  // row that direct_messages's friendship-gated RLS just validated, so the
  // notification is automatically trustworthy. Recipient-side bell
  // suppression (when their ChatPanel is open) still works because
  // useNotifications subscribes to postgres_changes regardless of whether
  // the row was inserted by a trigger or a client.

  return mapDirectMessage(data as DirectMessageRow);
}


export async function getUnreadMessageCounts(): Promise<Record<string, number>> {
  const uid = await userId(); if (!uid) return {};
  const { data, error } = await sb()
    .from('direct_messages')
    .select('sender_id')
    .eq('recipient_id', uid)
    .eq('read', false);
  if (error) { console.error('[DB] getUnreadMessageCounts error:', error.message); return {}; }
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ sender_id: string }>) {
    counts[r.sender_id] = (counts[r.sender_id] ?? 0) + 1;
  }
  return counts;
}

