/**
 * Starter loadout.
 *
 * Every field here is editable in the app - this is a first draft, not a
 * prescription. The friction ratings are the ones that matter most: they are
 * what makes a math assignment worth more than an hour on the project you'd
 * happily do anyway.
 */

import type { Activity, AppState, Settings } from './types';
import { freshProfile } from './engine';
import { todayKey } from './dates';

let seq = 0;
function act(a: Omit<Activity, 'createdAt' | 'archived'> & { archived?: boolean }): Activity {
  return { ...a, archived: a.archived ?? false, createdAt: Date.now() + seq++ };
}

export const DEFAULT_ACTIVITIES: Activity[] = [
  act({
    id: 'gym',
    name: 'Gym',
    emoji: '🏋️',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 9,
    friction: 3,
    softCap: 20,
    presets: [30, 45, 60, 90],
    pinned: true,
    cue: 'If it is after my last class, I go straight to the gym without going home first.',
  }),
  act({
    id: 'assignment',
    name: 'Assignment',
    emoji: '📐',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 10,
    friction: 5,
    softCap: 30,
    presets: [25, 50, 75],
    pinned: true,
    cue: 'If I sit down at my desk after dinner, I open the assignment before anything else.',
  }),
  act({
    id: 'study',
    name: 'Study',
    emoji: '📚',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 8,
    friction: 4,
    softCap: 24,
    presets: [25, 50, 90],
    pinned: true,
  }),
  act({
    id: 'research',
    name: 'Research paper',
    emoji: '🔬',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 8,
    friction: 2,
    softCap: 20,
    presets: [30, 60, 90],
    pinned: true,
  }),
  act({
    id: 'video',
    name: 'Video work',
    emoji: '🎬',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 9,
    friction: 4,
    softCap: 24,
    presets: [30, 60, 120],
    pinned: true,
    cue: 'If it is Saturday morning, I film or edit before I open anything else.',
  }),
  act({
    id: 'sideproject',
    name: 'Side project',
    emoji: '⚙️',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 7,
    friction: 1,
    softCap: 18,
    presets: [30, 60, 120],
    pinned: true,
  }),
  act({
    id: 'portfolio',
    name: 'Portfolio site',
    emoji: '🧩',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 8,
    friction: 3,
    softCap: 16,
    presets: [30, 60],
    pinned: false,
  }),
  act({
    id: 'video-published',
    name: 'Published a video',
    emoji: '🚀',
    polarity: 'build',
    kind: 'check',
    points: 40,
    friction: 5,
    softCap: 40,
    pinned: false,
  }),
  act({
    id: 'sleep',
    name: 'In bed on time',
    emoji: '🌙',
    polarity: 'build',
    kind: 'check',
    points: 8,
    friction: 4,
    softCap: 8,
    pinned: true,
    cue: 'If it is 11:30pm, my phone goes on the charger across the room.',
  }),
  act({
    id: 'read',
    name: 'Read',
    emoji: '📖',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 5,
    friction: 2,
    softCap: 10,
    presets: [15, 30],
    pinned: false,
  }),

  // ---- Burns -------------------------------------------------------------
  act({
    id: 'spend',
    name: 'Money spent',
    emoji: '💸',
    polarity: 'burn',
    kind: 'money',
    unit: '$',
    points: 4, // -4 points per $10 of discretionary spend
    friction: 3,
    softCap: 999,
    presets: [10, 25, 50],
    pinned: true,
  }),
  act({
    id: 'porn',
    name: 'Porn',
    emoji: '🚫',
    polarity: 'burn',
    kind: 'check',
    points: 25,
    friction: 3,
    softCap: 999,
    pinned: true,
  }),
  act({
    id: 'broke-promise',
    name: 'Said I would, didn’t',
    emoji: '🪫',
    polarity: 'burn',
    kind: 'check',
    points: 15,
    friction: 3,
    softCap: 999,
    pinned: true,
  }),
  act({
    id: 'doomscroll',
    name: 'Doomscroll',
    emoji: '📱',
    polarity: 'burn',
    kind: 'duration',
    unit: 'min',
    points: 4,
    friction: 3,
    softCap: 999,
    presets: [30, 60, 120],
    pinned: false,
  }),
];

export const DEFAULT_SETTINGS: Settings = {
  dayRolloverHour: 4, // logging at 1am still counts toward the night before
  baselinePar: 45,
  autoShield: true,
  penaltyBoxEnabled: true,
  collapseRatio: 0.35,
  gate: {
    enabled: false,
    threshold: 30,
    sites: ['youtube.com', 'x.com', 'twitter.com', 'reddit.com', 'instagram.com', 'tiktok.com'],
    openBeforeHour: 12,
  },
};

export const STATE_VERSION = 1;

export function freshState(): AppState {
  const start = todayKey(DEFAULT_SETTINGS.dayRolloverHour);
  return {
    version: STATE_VERSION,
    rev: 1,
    updatedAt: Date.now(),
    profile: freshProfile(start),
    activities: DEFAULT_ACTIVITIES,
    entries: [],
    days: {},
    quests: {},
    wagers: [],
    settings: DEFAULT_SETTINGS,
    onboarded: false,
  };
}
