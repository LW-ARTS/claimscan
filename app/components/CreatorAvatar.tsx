'use client';

import { useState } from 'react';

interface CreatorAvatarProps {
  handle: string;
  handleType: 'twitter' | 'github' | 'tiktok' | string | null | undefined;
  className?: string;
}

/**
 * Renders a creator's profile picture via unavatar.io, falling back to an
 * initials chip when the upstream provider has no image. `?fallback=false`
 * forces unavatar to 404 instead of returning its generic placeholder face,
 * so the onError handler actually fires and we render initials instead of
 * a sea of identical default avatars on the leaderboard.
 *
 * GitHub creators always get the initials chip — GitHub avatars in this
 * context are usually generic identicons that add no signal.
 */
export function CreatorAvatar({ handle, handleType, className }: CreatorAvatarProps) {
  const [error, setError] = useState(false);
  const provider = handleType === 'twitter' ? 'x' : handleType === 'tiktok' ? 'tiktok' : null;

  const sizeClasses = className ?? 'h-7 w-7';

  if (!provider || error) {
    return (
      <span
        className={`avatar-ring inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-bold uppercase text-[var(--text-secondary)] ${sizeClasses}`}
      >
        {handle[0]?.toUpperCase()}
      </span>
    );
  }

  // Route through /api/avatar so the server can detect unavatar's placeholder
  // (constant 2137-byte JPEG with stable ETag) and 404 instead of streaming the
  // generic face. The frontend onError below then renders initials.
  const proxyParam = provider === 'tiktok' ? '&provider=tiktok' : '';
  return (
    <img
      src={`/api/avatar?handle=${encodeURIComponent(handle)}${proxyParam}`}
      alt=""
      className={`avatar-ring shrink-0 rounded-full object-cover ${sizeClasses}`}
      onError={() => setError(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
