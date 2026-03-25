interface ChainIconProps {
  chain: string;
  className?: string;
}

export function ChainIcon({ chain, className = 'h-5 w-5' }: ChainIconProps) {
  if (chain === 'sol') {
    return (
      <svg className={className} viewBox="0 0 128 128" fill="none" aria-hidden="true">
        <circle cx="64" cy="64" r="64" fill="url(#sol-grad)" />
        <path
          d="M36 82.5h42.3c.7 0 1.4-.3 1.9-.8l11.4-11.2c.8-.8.2-2.1-.9-2.1H48.4c-.7 0-1.4.3-1.9.8L35.1 80.4c-.8.8-.2 2.1.9 2.1Zm0-37h42.3c.7 0 1.4.3 1.9.8l11.4 11.2c.8.8.2 2.1-.9 2.1H48.4c-.7 0-1.4-.3-1.9-.8L35.1 47.6c-.8-.8-.2-2.1.9-2.1Zm55.6 12.6H49.3c-.7 0-1.4-.3-1.9-.8L36 46.1c-.8-.8-.2-2.1.9-2.1h42.3c.7 0 1.4.3 1.9.8l11.4 11.2c.8.8.2 2.1-.9 2.1Z"
          fill="#fff"
        />
        <defs>
          <linearGradient id="sol-grad" x1="0" y1="128" x2="128" y2="0">
            <stop stopColor="#9945FF" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (chain === 'base') {
    return (
      <svg className={className} viewBox="0 0 128 128" fill="none" aria-hidden="true">
        <circle cx="64" cy="64" r="64" fill="#0052FF" />
        <path
          d="M63.7 110c25.4 0 46-20.6 46-46S89 18 63.7 18C39.6 18 19.8 36.7 18 60.2h60.4v7.7H18C19.8 91.3 39.6 110 63.7 110Z"
          fill="#fff"
        />
      </svg>
    );
  }

  if (chain === 'eth') {
    return (
      <svg className={className} viewBox="0 0 128 128" fill="none" aria-hidden="true">
        <circle cx="64" cy="64" r="64" fill="#627EEA" />
        <path d="M64 16v35.4l29.9 13.4L64 16Z" fill="#fff" fillOpacity=".6" />
        <path d="M64 16 34 64.8l30-13.4V16Z" fill="#fff" />
        <path d="M64 87.7v24.3l30-41.5L64 87.7Z" fill="#fff" fillOpacity=".6" />
        <path d="M64 112V87.7l-30-17.2L64 112Z" fill="#fff" />
        <path d="m64 82.3 30-17.5L64 51.5v30.8Z" fill="#fff" fillOpacity=".2" />
        <path d="m34 64.8 30 17.5V51.5L34 64.8Z" fill="#fff" fillOpacity=".6" />
      </svg>
    );
  }

  if (chain === 'bsc') {
    return (
      <svg className={className} viewBox="0 0 128 128" fill="none" aria-hidden="true">
        <circle cx="64" cy="64" r="64" fill="#F3BA2F" />
        <path
          d="M64 36l9.5 9.5-9.5 9.5-9.5-9.5L64 36Zm-20 20l9.5 9.5-9.5 9.5-9.5-9.5L44 56Zm40 0l9.5 9.5-9.5 9.5-9.5-9.5L84 56ZM64 76l9.5 9.5-9.5 9.5-9.5-9.5L64 76Z"
          fill="#fff"
        />
      </svg>
    );
  }

  return null;
}
