'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { RankHeader } from '@/components/RankHeader';
import { ScoreRing } from '@/components/ScoreRing';
import { QuickGrid } from '@/components/QuickGrid';
import { BrainDump } from '@/components/BrainDump';
import { QuestList } from '@/components/QuestList';
import { LogList } from '@/components/LogList';
import { PenaltyBanner, GateBanner, FreshStartBanner } from '@/components/Banners';
import { Onboarding } from '@/components/Onboarding';
import { bestLeverFor, entriesForDay, parForDay, questsForDay } from '@/lib/engine';
import { rpForDay, shortfallAdvice } from '@/lib/par';
import { totalPoints } from '@/lib/scoring';

export default function TodayPage() {
  const { state, ready, today } = useStore();

  const view = useMemo(() => {
    const entries = entriesForDay(state, today);
    const score = totalPoints(entries);
    const par = parForDay(state, today);
    return {
      entries,
      score,
      par,
      quests: questsForDay(state, today),
      projectedRp: rpForDay(score, par),
      pinned: state.activities.filter((a) => a.pinned && !a.archived),
    };
  }, [state, today]);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="num text-sm text-[color:var(--color-ink-faint)]">loading…</div>
      </div>
    );
  }

  if (!state.onboarded) return <Onboarding />;

  const gap = view.par - view.score;
  const lever = gap > 0 ? bestLeverFor(state.activities, gap) : undefined;

  return (
    <div className="space-y-5">
      <RankHeader />

      <FreshStartBanner dateKey={today} />
      <PenaltyBanner />

      <div className="flex flex-col items-center pt-1">
        <ScoreRing score={view.score} par={view.par} />

        {/*
          A projected RP delta, always on screen. The whole problem with a
          long-term goal is that the payoff sits too far away to feel like
          anything today - this drags it into the present, which is the only
          reason a number on a screen moves behaviour at all.
        */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[color:var(--color-ink-faint)]">
            {view.entries.length === 0 ? 'Nothing logged yet' : 'If the day ended now'}
          </span>
          <span
            className="num rounded-lg px-2 py-0.5 text-sm font-bold"
            style={{
              color: view.projectedRp >= 0 ? 'var(--color-gain)' : 'var(--color-burn)',
              background:
                view.projectedRp >= 0 ? 'rgba(46,232,107,.1)' : 'rgba(255,61,110,.1)',
            }}
          >
            {view.projectedRp >= 0 ? '+' : ''}
            {view.projectedRp} RP
          </span>
        </div>

        {gap > 0 && view.entries.length > 0 && (
          // Never show a shortfall without the specific thing that fixes it.
          <p className="mt-2 px-6 text-center text-xs text-[color:var(--color-ink-dim)]">
            {shortfallAdvice(view.score, view.par, lever)}
          </p>
        )}
      </div>

      <GateBanner score={view.score} />
      <BrainDump />
      <QuickGrid activities={view.pinned} />
      <QuestList quests={view.quests} />
      <LogList entries={view.entries} />
    </div>
  );
}
