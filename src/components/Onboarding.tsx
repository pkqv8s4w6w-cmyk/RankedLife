'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { RankBadge } from './RankBadge';
import { FRICTION_LABEL } from '@/lib/scoring';
import { STARTING_RP } from '@/lib/rank';
import { PLACEMENT_DAYS, SEASON_DAYS } from '@/lib/engine';

/**
 * Three screens, then you're in.
 *
 * Onboarding does real work here: it sets friction ratings (which decide what
 * everything is worth), captures if-then plans for the two things you skip most,
 * and places you on the ladder rather than at zero. Every one of those is a
 * lever that stops mattering if you ask for it later.
 */
export function Onboarding() {
  const { state, update, saveActivity } = useStore();
  const [step, setStep] = useState(0);

  const hardest = state.activities
    .filter((a) => a.polarity === 'build' && !a.archived)
    .sort((a, b) => b.friction - a.friction)
    .slice(0, 2);

  return (
    <div className="flex min-h-[80dvh] flex-col justify-center py-6">
      {step === 0 && (
        <div className="animate-rise space-y-5">
          <div className="flex justify-center">
            <RankBadge rp={STARTING_RP} size={88} />
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Ranked Life</h1>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-dim)]">
              Every day gets a score. Beat your own par and you climb. Miss it and
              you drop. Miss enough and you get demoted, same as any ranked queue.
            </p>
          </div>

          <ul className="space-y-2 text-sm">
            <Point emoji="🎯">
              Par is <strong>your own trailing median</strong>, not a number I picked.
              Farming easy wins just raises it, so it buys you nothing.
            </Point>
            <Point emoji="🔥">
              The things you dread are worth more. The things you already enjoy are
              worth less — I&rsquo;m not paying you to do what you&rsquo;d do anyway.
            </Point>
            <Point emoji="🛡">
              You get {state.profile.maxShields} emergency shields. Each one eats a
              bad day. They come back slowly, so spend them like they matter.
            </Point>
            <Point emoji="🎲">
              Entries can crit for bonus points. You can&rsquo;t predict which —
              that&rsquo;s the point, a reward you can predict stops registering.
            </Point>
          </ul>

          <Button onClick={() => setStep(1)}>Start placements</Button>
        </div>
      )}

      {step === 1 && (
        <div className="animate-rise space-y-5">
          <Header
            title="How hard is each one?"
            sub="This is the setting that matters most. It decides what everything is worth."
          />

          <ul className="space-y-2">
            {state.activities
              .filter((a) => a.polarity === 'build' && a.pinned && !a.archived)
              .map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center gap-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2.5"
                >
                  <span className="text-xl">{activity.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{activity.name}</span>
                  <select
                    value={activity.friction}
                    onChange={(e) =>
                      saveActivity({
                        ...activity,
                        friction: Number(e.target.value) as typeof activity.friction,
                      })
                    }
                    className="shrink-0 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-2 py-1.5 text-xs"
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {FRICTION_LABEL[level]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
          </ul>

          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-rise space-y-5">
          <Header
            title="When exactly?"
            sub="An if-then plan roughly doubles follow-through versus just intending to do it. Two is plenty."
          />

          <div className="space-y-3">
            {hardest.map((activity) => (
              <div key={activity.id}>
                <label
                  htmlFor={`cue-${activity.id}`}
                  className="mb-1 block text-xs text-[color:var(--color-ink-dim)]"
                >
                  {activity.emoji} {activity.name}
                </label>
                <textarea
                  id={`cue-${activity.id}`}
                  defaultValue={activity.cue ?? ''}
                  onBlur={(e) => saveActivity({ ...activity, cue: e.target.value.trim() })}
                  rows={2}
                  placeholder="If it is 7pm and I've eaten, then I start this before opening anything else."
                  className="w-full resize-none rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2.5 text-sm outline-none placeholder:text-[color:var(--color-ink-faint)]"
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-3 text-xs leading-relaxed text-[color:var(--color-ink-dim)]">
            Next {PLACEMENT_DAYS} days are placements — you can gain RP but not lose
            it. Season {state.profile.seasonId} runs {SEASON_DAYS} days, which is
            about how long a habit actually takes to stick.
          </div>

          <Button onClick={() => update((s) => ({ ...s, onboarded: true }))}>
            Let&rsquo;s go
          </Button>
        </div>
      )}
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-[color:var(--color-ink-dim)]">{sub}</p>
    </div>
  );
}

function Point({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2.5">
      <span className="shrink-0">{emoji}</span>
      <span className="text-[color:var(--color-ink-dim)]">{children}</span>
    </li>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl py-3.5 font-semibold text-black transition-transform active:scale-[0.98]"
      style={{ background: 'var(--color-accent)' }}
    >
      {children}
    </button>
  );
}
