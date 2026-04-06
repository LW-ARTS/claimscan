'use client';

import { useState, useEffect } from 'react';

interface SidebarGroup {
  label: string;
  items: { id: string; name: string }[];
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'introduction', name: 'Introduction' },
      { id: 'platforms', name: 'Supported Platforms' },
      { id: 'how-it-works', name: 'How It Works' },
      { id: 'claim-flow', name: 'Claim Flow' },
    ],
  },
  {
    label: 'API Reference',
    items: [
      { id: 'authentication', name: 'Authentication' },
      { id: 'rate-limits', name: 'Rate Limits' },
      { id: 'search', name: 'Search by Handle' },
      { id: 'fees', name: 'Get Fees (V2)' },
      { id: 'export', name: 'Export Data (V2)' },
      { id: 'leaderboard-api', name: 'Leaderboard' },
    ],
  },
  {
    label: 'More',
    items: [
      { id: 'security', name: 'Security' },
      { id: 'architecture', name: 'Architecture' },
      { id: 'faq', name: 'FAQ' },
      { id: 'pricing', name: 'Pricing' },
      { id: 'roadmap', name: 'Roadmap' },
    ],
  },
];

const ALL_IDS = SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export function DocsSidebar() {
  const [activeId, setActiveId] = useState('introduction');

  useEffect(() => {
    // Track which sections are currently visible
    const visibleSections = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }
        // Pick the LAST visible section (the one furthest down = what user is reading)
        let lastVisible = '';
        for (const id of ALL_IDS) {
          if (visibleSections.has(id)) {
            lastVisible = id;
          }
        }
        if (lastVisible) setActiveId(lastVisible);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );

    for (const id of ALL_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <aside className="hidden lg:block w-[220px] shrink-0 border-r border-[var(--border-subtle)]">
      <nav className="sticky top-20 py-4 max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide pr-3">
        {SIDEBAR_GROUPS.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-4' : ''}>
            <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)] px-3 mb-1 block">
              {group.label}
            </span>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={`nav-item block px-3 py-1.5 rounded-[6px] text-[13px] ${
                      activeId === item.id
                        ? 'is-active bg-[#FFFFFF14] text-white font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[#FFFFFF08] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
