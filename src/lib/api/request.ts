import { NextResponse } from 'next/server';

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** Bound actual streamed bytes, including chunked requests without Content-Length. */
export async function readBody(req: Request, limit: number): Promise<string> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > limit) throw new ApiRequestError('Request body too large', 413);
  if (!req.body) throw new ApiRequestError('Missing request body');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new ApiRequestError('Request body too large', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readJsonObject(req: Request, limit = 4096): Promise<Record<string, unknown>> {
  const raw = await readBody(req, limit);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new ApiRequestError('Invalid JSON body'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiRequestError('Expected a JSON object');
  return body as Record<string, unknown>;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export function bearerToken(req: Request): string | null {
  return /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
