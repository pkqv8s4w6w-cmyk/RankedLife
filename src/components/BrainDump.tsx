'use client';

import { useCallback, useRef, useState } from 'react';
import type { ParsedItem } from '@/lib/types';
import { useStore, getSyncKey } from '@/lib/store';
import { rawPointsFor } from '@/lib/scoring';

/**
 * Dump your whole day in one box.
 *
 * "gym 45, wrote two pages of the paper, blew $40 on lunch" - the model turns
 * that into a list you confirm. It proposes, you approve. Nothing is logged
 * from a model output without a tap, which keeps the score something you can
 * still trust when it costs you a rank.
 */
export function BrainDump() {
  const { state, log, pushToast } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const parse = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const key = getSyncKey();
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { 'x-rl-key': key } : {}) },
        body: JSON.stringify({ text: trimmed, activities: state.activities }),
      });
      const body = (await res.json()) as { items?: ParsedItem[]; error?: string };
      if (!res.ok) {
        pushToast({ title: 'Parse failed', detail: body.error ?? 'Try the tiles instead.', tone: 'bad' });
        return;
      }
      if (!body.items?.length) {
        pushToast({ title: 'Nothing matched', detail: 'Reword it, or use the tiles.', tone: 'info' });
        return;
      }
      setItems(body.items);
    } catch {
      pushToast({ title: 'Offline', detail: 'The tiles still work without a connection.', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }, [text, busy, state.activities, pushToast]);

  /** Browser dictation where it exists. On iOS the keyboard mic covers this. */
  const toggleVoice = useCallback(() => {
    const Ctor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;

    if (!Ctor) {
      pushToast({
        title: 'No dictation here',
        detail: 'Use the mic on your phone keyboard instead.',
        tone: 'info',
      });
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        chunk += event.results[i][0].transcript;
      }
      setText((prev) => (prev ? `${prev} ${chunk}` : chunk).trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }, [listening, pushToast]);

  function commit(list: ParsedItem[]) {
    let logged = 0;
    for (const item of list) {
      if (!item.activityId) continue;
      log({ activityId: item.activityId, amount: item.amount, note: item.note, source: 'ai' });
      logged++;
    }
    setItems(null);
    setText('');
    if (logged === 0) {
      pushToast({ title: 'Nothing logged', detail: 'Those need activities first.', tone: 'info' });
    }
  }

  return (
    <div className="card p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void parse();
          }}
          rows={2}
          placeholder="What did you do? &quot;gym 45, 2 pages, $40 lunch&quot;"
          className="min-h-[3.25rem] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[color:var(--color-ink-faint)]"
        />
        <button
          onClick={toggleVoice}
          aria-label={listening ? 'Stop dictation' : 'Start dictation'}
          className="shrink-0 rounded-xl border border-[color:var(--color-line)] p-2.5 transition-colors"
          style={{
            color: listening ? 'var(--color-burn)' : 'var(--color-ink-dim)',
            borderColor: listening ? 'var(--color-burn)' : 'var(--color-line)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={() => void parse()}
          disabled={!text.trim() || busy}
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-black transition-opacity disabled:opacity-30"
          style={{ background: 'var(--color-accent)' }}
        >
          {busy ? '…' : 'Read'}
        </button>
      </div>

      {items && <ConfirmList items={items} onCancel={() => setItems(null)} onCommit={commit} />}
    </div>
  );
}

function ConfirmList({
  items,
  onCancel,
  onCommit,
}: {
  items: ParsedItem[];
  onCancel: () => void;
  onCommit: (items: ParsedItem[]) => void;
}) {
  const { state, saveActivity } = useStore();
  const [draft, setDraft] = useState(items);

  const total = draft.reduce((sum, item) => {
    const activity = state.activities.find((a) => a.id === item.activityId);
    if (!activity) return sum;
    const points = rawPointsFor(activity, item.amount);
    return sum + (activity.polarity === 'burn' ? -points : points);
  }, 0);

  return (
    <div className="animate-rise mt-3 border-t border-[color:var(--color-line)] pt-3">
      <ul className="space-y-1.5">
        {draft.map((item, index) => {
          const activity = state.activities.find((a) => a.id === item.activityId);
          return (
            <li key={index} className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Remove"
                className="shrink-0 text-[color:var(--color-ink-faint)] transition-colors hover:text-[color:var(--color-burn)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>

              {activity ? (
                <>
                  <span>{activity.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {activity.name}
                    {activity.kind !== 'check' && (
                      <span className="num text-[color:var(--color-ink-dim)]">
                        {' '}
                        {activity.kind === 'money' ? '$' : ''}
                        {item.amount}
                        {activity.kind !== 'money' && activity.unit ? ` ${activity.unit}` : ''}
                      </span>
                    )}
                  </span>
                  {item.confidence < 0.5 && (
                    <span className="shrink-0 text-[10px] text-[color:var(--color-crit)]">guess</span>
                  )}
                  <span
                    className="num shrink-0 text-xs font-semibold"
                    style={{
                      color: activity.polarity === 'burn' ? 'var(--color-burn)' : 'var(--color-gain)',
                    }}
                  >
                    {activity.polarity === 'burn' ? '−' : '+'}
                    {Math.round(rawPointsFor(activity, item.amount) * 10) / 10}
                  </span>
                </>
              ) : (
                // Unmatched: offer to create it rather than dropping it silently.
                <>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-ink-dim)]">
                    {item.suggestedName}
                  </span>
                  <button
                    onClick={() => {
                      const id = `custom-${Date.now().toString(36)}`;
                      const polarity = item.suggestedPolarity ?? 'build';
                      saveActivity({
                        id,
                        name: item.suggestedName ?? 'New activity',
                        emoji: polarity === 'burn' ? '🚫' : '✨',
                        polarity,
                        kind: item.amount > 1 ? 'count' : 'check',
                        points: 6,
                        friction: 3,
                        softCap: 12,
                        pinned: false,
                        archived: false,
                        createdAt: Date.now(),
                      });
                      setDraft((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, activityId: id } : x)),
                      );
                    }}
                    className="shrink-0 rounded-lg border border-[color:var(--color-line)] px-2 py-0.5 text-[11px] text-[color:var(--color-accent)]"
                  >
                    + create
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl border border-[color:var(--color-line)] px-4 py-2 text-sm text-[color:var(--color-ink-dim)]"
        >
          Cancel
        </button>
        <button
          onClick={() => onCommit(draft)}
          disabled={draft.length === 0}
          className="num flex-1 rounded-xl py-2 text-sm font-semibold text-black disabled:opacity-30"
          style={{ background: total >= 0 ? 'var(--color-gain)' : 'var(--color-burn)' }}
        >
          Log {draft.length} · {total >= 0 ? '+' : ''}
          {Math.round(total * 10) / 10}
        </button>
      </div>
    </div>
  );
}

// --- Minimal Web Speech typings. The DOM lib doesn't ship these. -----------
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
