import Image from 'next/image';

/* ─── Logo file map ─── */

const logoMap: Record<string, string> = {
  pump: '/logos/pump.svg',
  bags: '/logos/bags.png',
  clanker: '/logos/clanker.png',
  zora: '/logos/zora-zorb.png',
  bankr: '/logos/bankr-favicon.svg',
  believe: '/logos/believe.svg',
  coinbarrel: '/logos/coinbarrel.svg',
  raydium: '/logos/raydium.svg',
  flaunch: '/logos/flaunch.svg',
  flap: '/logos/flap.svg',
};

/* ─── RevShare fallback (generic concept, no brand logo) ─── */

const RevShareSvg = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.3 10.8l7.4-3.2M8.3 13.2l7.4 3.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/* ─── Platform name map ─── */

const nameMap: Record<string, string> = {
  pump: 'Pump.fun',
  bags: 'Bags.fm',
  clanker: 'Clanker',
  zora: 'Zora',
  bankr: 'Bankr',
  believe: 'Believe',
  revshare: 'RevShare',
  coinbarrel: 'Coinbarrel',
  raydium: 'Raydium',
  flaunch: 'Flaunch',
  flap: 'Flap',
};

interface PlatformIconProps {
  platform: string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export function PlatformIcon({ platform, className = 'h-4 w-4', ...rest }: PlatformIconProps) {
  if (platform === 'revshare') {
    return <RevShareSvg className={className} {...rest} />;
  }

  const src = logoMap[platform];
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={nameMap[platform] ?? platform}
      width={24}
      height={24}
      className={className}
      unoptimized={src.endsWith('.svg')}
      {...rest}
    />
  );
}
