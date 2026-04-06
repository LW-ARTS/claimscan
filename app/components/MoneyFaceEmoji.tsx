'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

interface MoneyFaceEmojiProps {
  className?: string;
  size?: number;
}

export default function MoneyFaceEmoji({ className = '', size = 64 }: MoneyFaceEmojiProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    fetch('/animations/money_mouth_face.json', { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setAnimationData(data);
      })
      .catch(() => {
        // Silently fail - emoji is decorative
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, []);

  // Only apply inline width/height when the caller hasn't sized this via
  // className (size-*, w-*, h-*) — inline styles otherwise win and break
  // the responsive Tailwind classes (e.g. mobile size-7).
  const hasSizeClass = /(?:^|\s)(?:size-|w-|h-)/.test(className);
  const inlineSize = hasSizeClass ? undefined : { width: size, height: size };

  if (!animationData) {
    return <div className={className} style={inlineSize} />;
  }

  return (
    <div className={className} style={inlineSize}>
      <Lottie
        animationData={animationData}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
