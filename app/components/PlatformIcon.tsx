import type { ComponentProps } from 'react';

type SvgProps = ComponentProps<'svg'>;

/* ─── Official brand logomarks (monochrome, currentColor) ─── */

const PumpLogo = (props: SvgProps) => (
  <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M21.8855 184.247C-2.016 162.076-3.419 124.726 18.753 100.824L94.761 18.886C116.932-5.016 154.282-6.419 178.184 15.753C202.085 37.924 203.488 75.274 181.316 99.176L105.308 181.115C83.137 205.016 45.787 206.419 21.886 184.247Z" fill="currentColor" />
    <path fillRule="evenodd" clipRule="evenodd" d="M18.753 100.824C-3.419 124.726-2.016 162.076 21.886 184.247C45.787 206.419 83.137 205.016 105.308 181.115L145.81 137.452L59.255 57.162L18.753 100.824Z" fill="currentColor" opacity="0.6" />
  </svg>
);

const BagsLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M8 6V4a4 4 0 1 1 8 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3.5 10c0-2.357 0-3.536.732-4.268C4.964 5 6.143 5 8.5 5h7c2.357 0 3.536 0 4.268.732C20.5 6.464 20.5 7.643 20.5 10v4c0 3.771 0 5.657-1.172 6.828C18.157 22 16.271 22 12.5 22h-1c-3.771 0-5.657 0-6.828-1.172C3.5 19.657 3.5 17.771 3.5 14v-4Z" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 11v3m0 0v3m0-3h3m-3 0H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ClankerLogo = (props: SvgProps) => (
  <svg viewBox="0 0 940 1000" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M0 1000V757.576H181.818V1000H0Z" fill="currentColor" />
    <path d="M378.788 1000V378.788H560.606V1000H378.788Z" fill="currentColor" />
    <path d="M939.394 1000H757.576V0H939.394V1000Z" fill="currentColor" />
  </svg>
);

const ZoraLogo = (props: SvgProps) => (
  <svg viewBox="0 0 1001 1001" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="500" cy="500" r="500" fill="currentColor" />
  </svg>
);

const BelieveLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M9.03.103C9.286-.03 9.59-.035 9.85.09c.26.124.447.363.505.646L11.942 8.71c.123.618-.59 1.059-1.095.676l-.435-.33A21 21 0 0 0 8.362 7.678L4.41 16.262a5.3 5.3 0 0 0-.507 2.31C3.904 21.636 6.408 24.122 9.496 24.122h6.35c2.347 0 4.25-1.889 4.25-4.219s-1.903-4.219-4.25-4.219h-3.444a2.06 2.06 0 0 1-1.377-.565 1.95 1.95 0 0 1-.575-1.373c0-1.07.874-1.939 1.952-1.939h3.788c.698.003 1.369-.272 1.864-.764a2.63 2.63 0 0 0 .778-1.858 2.63 2.63 0 0 0-.778-1.859 2.68 2.68 0 0 0-1.864-.763h-.344a2.06 2.06 0 0 1-1.377-.565 1.95 1.95 0 0 1-.575-1.373c0-1.071.874-1.94 1.952-1.94h.344c3.615 0 6.546 2.91 6.546 6.5 0 2.462-1.358 4.61-3.358 5.74 2.673.651 4.622 3.064 4.622 5.935C24 24.198 21.298 27 17.992 27H9.496C4.252 27 0 22.779 0 17.571c0-1.196.261-2.378.762-3.466l4.791-10.4c.352-.763 1.162-2.713 3.477-3.602Z" fill="currentColor" />
  </svg>
);

/* ─── Stylized icons for platforms without official public SVGs ─── */

const HeavenLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <ellipse cx="12" cy="5.5" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 9v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M7 20c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const BankrLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="4" y="5" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="8.5" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
    <rect x="13.5" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
    <path d="M9.5 14.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M9 21h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const RevShareLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.3 10.8l7.4-3.2M8.3 13.2l7.4 3.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const CoinbarrelLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 6v5c0 1.657 3.134 3 7 3s7-1.343 7-3V6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 11v5c0 1.657 3.134 3 7 3s7-1.343 7-3v-5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="13" r="1" fill="currentColor" />
  </svg>
);

const RaydiumLogo = (props: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2L4 7v10l8 5 8-5V7l-8-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 2v10l8-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 12v10" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 12L4 7" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/* ─── Icon registry ─── */

const iconMap: Record<string, React.FC<SvgProps>> = {
  bags: BagsLogo,
  clanker: ClankerLogo,
  pump: PumpLogo,
  zora: ZoraLogo,
  heaven: HeavenLogo,
  bankr: BankrLogo,
  believe: BelieveLogo,
  revshare: RevShareLogo,
  coinbarrel: CoinbarrelLogo,
  raydium: RaydiumLogo,
};

interface PlatformIconProps extends SvgProps {
  platform: string;
}

export function PlatformIcon({ platform, className = 'h-4 w-4', ...props }: PlatformIconProps) {
  const Icon = iconMap[platform];
  if (!Icon) return null;
  return <Icon className={className} {...props} />;
}
