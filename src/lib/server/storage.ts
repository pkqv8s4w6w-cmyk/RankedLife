/**
 * Sync storage.
 *
 * Three backends, picked by whatever environment variables exist:
 *   - DATABASE_URL           -> Postgres (Neon, Supabase, anything)
 *   - UPSTASH_REDIS_REST_URL -> Upstash REST (no driver needed, just fetch)
 *   - neither                -> a JSON file under .data/, for local dev
 *
 * The app is local-first, so all of this is optional. With nothing configured
 * the routes report "off" and the client just keeps using localStorage.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface StoredDoc {
  rev: number;
  json: string;
}

const SLOT = 'default';

export function syncConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.UPSTASH_REDIS_REST_URL);
}

/**
 * Check the caller's key. When RANKEDLIFE_KEY is unset the endpoint is open,
 * which is fine for a laptop-only setup but means a deployed instance must set
 * it. The README says so in as many words.
 */
export function authorized(req: Request): boolean {
  const expected = process.env.RANKEDLIFE_KEY;
  if (!expected) return true;
  const provided =
    req.headers.get('x-rl-key') ?? new URL(req.url).searchParams.get('key') ?? '';
  return timingSafeEqual(provided, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Postgres --------------------------------------------------------------

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

let poolPromise: Promise<PgPool> | null = null;

async function getPool(): Promise<PgPool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('localhost')
          ? undefined
          : { rejectUnauthorized: false },
        max: 3,
      });
      await pool.query(
        `create table if not exists rankedlife_state (
           slot text primary key,
           rev integer not null,
           json text not null,
           updated_at timestamptz not null default now()
         )`,
      );
      return pool as unknown as PgPool;
    })();
  }
  return poolPromise;
}

// ---- Upstash REST ----------------------------------------------------------

async function upstash(command: unknown[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const body = (await res.json()) as { result?: unknown };
  return body.result;
}

// ---- File (dev) ------------------------------------------------------------

const FILE = path.join(process.cwd(), '.data', 'state.json');

async function readFileDoc(): Promise<StoredDoc | null> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    return JSON.parse(raw) as StoredDoc;
  } catch {
    return null;
  }
}

async function writeFileDoc(doc: StoredDoc): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // Write-then-rename so a crash mid-write can't leave a truncated document.
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc), 'utf8');
  await fs.rename(tmp, FILE);
}

// ---- Public API ------------------------------------------------------------

export async function readDoc(): Promise<StoredDoc | null> {
  if (process.env.DATABASE_URL) {
    const pool = await getPool();
    const { rows } = await pool.query(
      'select rev, json from rankedlife_state where slot = $1',
      [SLOT],
    );
    if (rows.length === 0) return null;
    return { rev: Number(rows[0].rev), json: String(rows[0].json) };
  }

  if (process.env.UPSTASH_REDIS_REST_URL) {
    const raw = await upstash(['GET', `rankedlife:${SLOT}`]);
    if (typeof raw !== 'string') return null;
    return JSON.parse(raw) as StoredDoc;
  }

  return readFileDoc();
}

/**
 * Write only if the incoming revision is at least as new as what's stored.
 * Returns the stored doc when the write was rejected so the caller can hand
 * the client the newer copy instead of silently losing a device's edits.
 */
export async function writeDoc(doc: StoredDoc): Promise<{ ok: true } | { ok: false; current: StoredDoc }> {
  if (process.env.DATABASE_URL) {
    const pool = await getPool();
    const { rows } = await pool.query(
      `insert into rankedlife_state (slot, rev, json, updated_at)
       values ($1, $2, $3, now())
       on conflict (slot) do update
         set rev = excluded.rev, json = excluded.json, updated_at = now()
         where rankedlife_state.rev <= excluded.rev
       returning rev`,
      [SLOT, doc.rev, doc.json],
    );
    if (rows.length > 0) return { ok: true };
    const current = await readDoc();
    return current ? { ok: false, current } : { ok: true };
  }

  // Redis and the dev file have no conditional write, so read-compare-write.
  // Single user, so the race window here is not worth a lock.
  const current = await readDoc();
  if (current && current.rev > doc.rev) return { ok: false, current };

  if (process.env.UPSTASH_REDIS_REST_URL) {
    await upstash(['SET', `rankedlife:${SLOT}`, JSON.stringify(doc)]);
    return { ok: true };
  }

  await writeFileDoc(doc);
  return { ok: true };
}
