/**
 * The gate.
 *
 * Returns whether you have earned your distractions yet today. The browser
 * extension in extension/ polls this and blocks the configured sites while it
 * reads locked; an iOS Shortcut can hit the same endpoint for Screen Time
 * automation. This is the one consequence that reaches outside the app, which
 * is exactly why it lives behind a plain JSON endpoint rather than being
 * buried in the UI.
 */

import { NextResponse } from 'next/server';
import { authorized, readDoc } from '@/lib/server/storage';
import type { AppState } from '@/lib/types';
import { dayKeyFor } from '@/lib/dates';
import { totalPoints } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPEN_HEADERS = { 'cache-control': 'no-store' };

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: OPEN_HEADERS });
  }

  let state: AppState | null = null;
  try {
    const doc = await readDoc();
    state = doc ? (JSON.parse(doc.json) as AppState) : null;
  } catch (err) {
    console.error('[gate] read failed', err);
  }

  // Fail open. A gate that jams shut because a database blinked would get the
  // extension uninstalled within a day.
  if (!state?.settings?.gate?.enabled) {
    return NextResponse.json(
      { locked: false, enabled: false, sites: [], reason: 'gate disabled' },
      { headers: OPEN_HEADERS },
    );
  }

  const gate = state.settings.gate;
  const now = new Date();
  const dateKey = dayKeyFor(now, state.settings.dayRolloverHour ?? 0);
  const score = totalPoints((state.entries ?? []).filter((e) => e.dateKey === dateKey));

  const beforeOpenHour = now.getHours() < gate.openBeforeHour;
  const earned = score >= gate.threshold;
  const locked = !earned && !beforeOpenHour;

  return NextResponse.json(
    {
      locked,
      enabled: true,
      score,
      threshold: gate.threshold,
      remaining: Math.max(0, Math.round((gate.threshold - score) * 10) / 10),
      sites: gate.sites,
      openBeforeHour: gate.openBeforeHour,
      reason: beforeOpenHour ? 'morning grace' : earned ? 'threshold met' : 'threshold not met',
    },
    { headers: OPEN_HEADERS },
  );
}
