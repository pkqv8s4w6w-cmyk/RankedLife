'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Today', icon: TodayIcon },
  { href: '/season', label: 'Season', icon: SeasonIcon },
  { href: '/loadout', label: 'Loadout', icon: LoadoutIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--color-line)] bg-[color:var(--color-void)]/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-lg">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors"
              style={{ color: active ? 'var(--color-accent)' : 'var(--color-ink-faint)' }}
            >
              <Icon active={active} />
              <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { active: boolean };

function TodayIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M4 15 L10 8 L14 12 L20 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20 h16" strokeLinecap="round" opacity={0.45} />
    </svg>
  );
}

function SeasonIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10 h17M8 3.5 v3M16 3.5 v3" strokeLinecap="round" />
    </svg>
  );
}

function LoadoutIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <rect x="3.5" y="4.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="4.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="14.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="14.5" width="7" height="5" rx="2" />
    </svg>
  );
}

function SettingsIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3" strokeLinecap="round" />
    </svg>
  );
}
