import { NextResponse } from 'next/server';
import { authorized, readDoc, syncConfigured, writeDoc } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Guard against a runaway document filling the backing store. */
const MAX_BYTES = 6 * 1024 * 1024;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const doc = await readDoc();
    return NextResponse.json({
      configured: syncConfigured(),
      state: doc ? JSON.parse(doc.json) : null,
    });
  } catch (err) {
    console.error('[sync] read failed', err);
    return NextResponse.json({ error: 'read failed', configured: syncConfigured() }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: 'state too large' }, { status: 413 });
  }

  let parsed: { rev?: number };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (typeof parsed.rev !== 'number') {
    return NextResponse.json({ error: 'missing rev' }, { status: 400 });
  }

  try {
    const result = await writeDoc({ rev: parsed.rev, json: raw });
    const configured = syncConfigured();
    if (result.ok) return NextResponse.json({ ok: true, configured });
    return NextResponse.json({ stale: true, configured, state: JSON.parse(result.current.json) });
  } catch (err) {
    console.error('[sync] write failed', err);
    return NextResponse.json({ error: 'write failed' }, { status: 500 });
  }
}
