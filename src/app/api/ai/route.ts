import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { action, text, language } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    let prompt: string;

    if (action === 'summary') {
      prompt =
        'Summarize the following text in 3–5 concise bullet points. ' +
        'Return ONLY the bullet points, one per line, each starting with "• ". No headers or extra text.\n\n' +
        text.slice(0, 8000);
    } else if (action === 'translate') {
      if (!language || typeof language !== 'string') {
        return NextResponse.json({ error: 'Missing language' }, { status: 400 });
      }
      prompt =
        `Translate the following text to ${language}. ` +
        'Return ONLY the translation, no explanations or notes.\n\n' +
        text.slice(0, 2000);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = (message.content[0] as { type: string; text: string }).text ?? '';
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
