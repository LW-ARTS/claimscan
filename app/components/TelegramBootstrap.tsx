'use client';

import Script from 'next/script';
import { useEffect } from 'react';

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  isExpanded: boolean;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; username?: string };
    start_param?: string;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * Loads telegram-web-app.js and initializes the Mini App context when the
 * page is opened inside a Telegram WebView. No-op outside Telegram.
 *
 * CSP: script-src includes https://telegram.org (see proxy.ts buildCspHeader).
 * frame-ancestors allows https://web.telegram.org for desktop/web Telegram.
 */
export function TelegramBootstrap() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
    } catch (err) {
      console.warn('[telegram] init failed:', err);
    }
  }, []);

  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
    />
  );
}
