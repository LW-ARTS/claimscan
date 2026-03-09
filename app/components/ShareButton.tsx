'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { formatUsd, copyToClipboard } from '@/lib/utils';

interface ShareButtonProps {
  handle: string;
  totalEarnedUsd: number;
  platformCount: number;
}

function saveButtonStyle({ saveFailed, saved, saving }: { saveFailed: boolean; saved: boolean; saving: boolean }) {
  if (saveFailed) return 'border-red-500/30 bg-red-500/10 text-red-400';
  if (saved) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  if (saving) return 'border-border bg-muted/60 text-muted-foreground/50 cursor-wait';
  return 'border-border bg-muted/40 text-muted-foreground cursor-pointer hover:bg-muted hover:border-foreground/20 hover:text-foreground';
}

export function ShareButton({ handle, totalEarnedUsd, platformCount }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const profileUrl = `https://claimscan.tech/${encodeURIComponent(handle)}`;
  const ogUrl = `/${encodeURIComponent(handle)}/opengraph-image`;

  const tweetText = [
    `I had ${formatUsd(totalEarnedUsd)} in unclaimed creator fees across ${platformCount} platform${platformCount !== 1 ? 's' : ''}`,
    '',
    `How much are you leaving on the table?`,
    '',
    'via claimscan.tech | @lwartss',
  ].join('\n');

  const tweetIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(profileUrl)}`;

  const handleCopyLink = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ok = await copyToClipboard(profileUrl);
    if (ok) {
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [profileUrl]);

  const handleSaveImage = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(ogUrl);
      if (!res.ok) throw new Error('Failed to fetch OG image');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claimscan-${handle}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.warn('[ShareButton] Image save failed:', err instanceof Error ? err.message : err);
      setSaveFailed(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaveFailed(false), 2500);
    } finally {
      setSaving(false);
    }
  }, [handle, saving, ogUrl]);

  return (
    <div className="space-y-2">
      {/* Primary: Share on X */}
      <a
        href={tweetIntentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all cursor-pointer hover:opacity-90"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </a>

      {/* Secondary: Save Image + Copy Link */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveImage}
          disabled={saving}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.97] ${saveButtonStyle({ saveFailed, saved, saving })}`}
        >
          {saveFailed ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Failed
            </>
          ) : saved ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Saved!
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {saving ? 'Saving...' : 'Save Image'}
            </>
          )}
        </button>
        <button
          onClick={handleCopyLink}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.97] ${
            copied
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-border bg-muted/40 text-muted-foreground cursor-pointer hover:bg-muted hover:border-foreground/20 hover:text-foreground'
          }`}
        >
          {copied ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
