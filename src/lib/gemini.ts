export async function callAI(action: 'summary', text: string): Promise<string>;
export async function callAI(action: 'translate', text: string, language: string): Promise<string>;
export async function callAI(action: string, text: string, language?: string): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text, language }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `AI request failed (${res.status})`);
  return data.result as string;
}
