'use client';

import { useState, useEffect } from 'react';

const SECTIONS = [
  { id: 'acceptance', n: '01', name: 'Acceptance of Terms' },
  { id: 'service-description', n: '02', name: 'Service Description' },
  { id: 'eligibility', n: '03', name: 'Eligibility' },
  { id: 'account-wallets', n: '04', name: 'Account & Wallets' },
  { id: 'acceptable-use', n: '05', name: 'Acceptable Use' },
  { id: 'fees-claims', n: '06', name: 'Fees & Claims' },
  { id: 'intellectual-property', n: '07', name: 'Intellectual Property' },
  { id: 'dmca', n: '08', name: 'DMCA & Copyright' },
  { id: 'disclaimers', n: '09', name: 'Disclaimers' },
  { id: 'limitation-liability', n: '10', name: 'Liability' },
  { id: 'indemnification', n: '11', name: 'Indemnification' },
  { id: 'privacy', n: '12', name: 'Privacy Policy' },
  { id: 'cookies', n: '13', name: 'Cookie Policy' },
  { id: 'termination', n: '14', name: 'Termination' },
  { id: 'governing-law', n: '15', name: 'Governing Law' },
  { id: 'modifications', n: '16', name: 'Modifications' },
  { id: 'severability', n: '17', name: 'Severability' },
  { id: 'force-majeure', n: '18', name: 'Force Majeure' },
  { id: 'entire-agreement', n: '19', name: 'Entire Agreement' },
  { id: 'contact', n: '20', name: 'Contact' },
];

const ALL_IDS = SECTIONS.map((s) => s.id);

export function TermsSidebar() {
  const [activeId, setActiveId] = useState('acceptance');

  useEffect(() => {
    const visibleSections = new Set<string>();

    const updateActive = () => {
      // If user is near bottom, highlight the last section
      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (scrolledToBottom) {
        setActiveId(ALL_IDS[ALL_IDS.length - 1]);
        return;
      }
      // Otherwise pick the LAST visible section (what user is reading)
      let lastVisible = '';
      for (const id of ALL_IDS) {
        if (visibleSections.has(id)) {
          lastVisible = id;
        }
      }
      if (lastVisible) setActiveId(lastVisible);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }
        updateActive();
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );

    for (const id of ALL_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateActive);
    };
  }, []);

  return (
    <aside className="hidden lg:block w-[240px] shrink-0 border-r border-[var(--border-subtle)]">
      <nav className="sticky top-20 py-4 pb-12 max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide pr-3">
        <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)] px-3 mb-2 block">
          Table of Contents
        </span>
        <ul>
          {SECTIONS.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`nav-item flex items-baseline gap-2.5 px-3 py-1.5 rounded-[6px] text-[13px] ${
                  activeId === item.id
                    ? 'is-active bg-[#FFFFFF14] text-white font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[#FFFFFF08] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className={`font-mono text-[10px] shrink-0 ${activeId === item.id ? 'text-white/60' : 'text-[var(--text-tertiary)]'}`}>
                  {item.n}
                </span>
                <span>{item.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
