import { createClient } from '@/lib/supabase/client';

export async function callAI(action: 'summary', text: string): Promise<string>;
export async function callAI(action: 'translate', text: string, language: string): Promise<string>;
export async function callAI(action: 'explain', text: string): Promise<string>;
export async function callAI(action: 'flashcards', text: string): Promise<string>;
export async function callAI(action: string, text: string, language?: string): Promise<string> {
  const { data: { session } } = await createClient().auth.getSession();
  const token = session?.access_token;

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, text, language }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `AI request failed (${res.status})`);
  return data.result as string;
}

export async function callAIChat(pageText: string, message: string): Promise<string> {
  const { data: { session } } = await createClient().auth.getSession();
  const token = session?.access_token;

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: 'chat', text: pageText, message }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `AI request failed (${res.status})`);
  return data.result as string;
}
