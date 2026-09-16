/**
 * Natural-language day entry.
 *
 * "went to the gym for 45, wrote two pages of the paper, blew $40 on food"
 * becomes a list of proposed entries. The user always confirms before anything
 * is logged - the model proposes, it never scores. That keeps the points honest
 * and stops a hallucinated entry from quietly moving your rank.
 *
 * Two providers. Anthropic is the default and uses the official SDK. Anything
 * OpenAI-compatible (DeepSeek, a local model, whatever) works via the second
 * path, since you mentioned already having DeepSeek credits.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import type { Activity, ParsedItem } from '@/lib/types';
import { authorized } from '@/lib/server/storage';
import { catalogueFor, SYSTEM_PROMPT, TOOL_SCHEMA } from '@/lib/server/parse-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOOL_NAME = 'record_activities';
const MAX_INPUT_CHARS = 4000;

type RawItem = {
  activity_id?: string | null;
  suggested_name?: string | null;
  suggested_polarity?: string | null;
  amount?: number;
  note?: string | null;
  confidence?: number;
};

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { text?: string; activities?: Activity[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  const activities = Array.isArray(body.activities) ? body.activities : [];

  if (!text) return NextResponse.json({ items: [] });
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: 'message too long' }, { status: 413 });
  }
  if (activities.length === 0) {
    return NextResponse.json({ error: 'no activities to match against' }, { status: 400 });
  }

  const provider = (process.env.RL_AI_PROVIDER ?? 'anthropic').toLowerCase();
  const userContent = `Catalogue:\n${catalogueFor(activities)}\n\nWhat they said:\n"""${text}"""`;

  try {
    const raw =
      provider === 'openai' || provider === 'deepseek'
        ? await viaOpenAICompatible(userContent)
        : await viaAnthropic(userContent);

    return NextResponse.json({ items: normalise(raw, activities), provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[parse] failed', message);
    // Surface the reason rather than an empty list - a silent no-op here reads
    // as "the AI decided I did nothing today", which is a terrible message.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function viaAnthropic(userContent: string): Promise<RawItem[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const client = new Anthropic();

  const response = await client.messages.create({
    // Haiku 4.5: this is a short extraction job, and it runs every time you
    // log a day. Paying Opus rates for it would be silly.
    model: process.env.RL_AI_MODEL ?? 'claude-haiku-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: TOOL_NAME,
        description: 'Record the activities described in the message.',
        input_schema: TOOL_SCHEMA,
        strict: true,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to process that message.');
  }

  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME) {
      const input = block.input as { items?: RawItem[] };
      return input.items ?? [];
    }
  }
  return [];
}

async function viaOpenAICompatible(userContent: string): Promise<RawItem[]> {
  const base = process.env.RL_AI_BASE_URL ?? 'https://api.deepseek.com/v1';
  const key = process.env.RL_AI_API_KEY;
  if (!key) throw new Error('RL_AI_API_KEY is not set');

  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.RL_AI_MODEL ?? 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\n\nRespond with JSON matching this schema:\n${JSON.stringify(TOOL_SCHEMA)}`,
        },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) throw new Error(`provider returned ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content) as { items?: RawItem[] };
  return parsed.items ?? [];
}

/**
 * Trust nothing the model returned. Ids are checked against the real catalogue,
 * amounts are clamped, and anything that doesn't resolve is dropped rather than
 * guessed at.
 */
function normalise(raw: RawItem[], activities: Activity[]): ParsedItem[] {
  const valid = new Set(activities.filter((a) => !a.archived).map((a) => a.id));

  return raw
    .map((item): ParsedItem | null => {
      const id = typeof item.activity_id === 'string' && valid.has(item.activity_id)
        ? item.activity_id
        : null;

      const amount = Number.isFinite(item.amount) ? Math.max(0, Number(item.amount)) : 1;
      if (amount > 100_000) return null;

      const name = typeof item.suggested_name === 'string' ? item.suggested_name.slice(0, 40) : undefined;
      if (!id && !name) return null;

      const polarity = item.suggested_polarity === 'burn' ? 'burn' : 'build';

      return {
        activityId: id,
        suggestedName: id ? undefined : name,
        suggestedPolarity: id ? undefined : polarity,
        amount: amount || 1,
        note: typeof item.note === 'string' && item.note.trim() ? item.note.slice(0, 120) : undefined,
        confidence: clamp01(item.confidence),
      };
    })
    .filter((x): x is ParsedItem => x !== null)
    .slice(0, 20);
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
  return Math.max(0, Math.min(1, v));
}
