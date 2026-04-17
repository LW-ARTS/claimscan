import { TelegramBootstrap } from '../components/TelegramBootstrap';

// Layout wraps every render path of app/[handle]/page.tsx (ephemeral, empty,
// full profile). Hosts the Telegram WebApp bootstrap so the profile is
// usable as a Mini App via t.me/ClaimScanBOT/app?startapp=@handle or the
// /app command inline button.
export default function HandleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TelegramBootstrap />
      {children}
    </>
  );
}
