'use client';

import Image from "next/image";
import { OrbitingCircles } from "@/components/ui/orbiting-circles";

/* ─── Official brand logos (real colors) ─── */

const PumpIcon = () => (
    <Image src="/logos/pump.svg" alt="Pump.fun" width={20} height={20} className="size-5" />
);

const BagsIcon = () => (
    <Image src="/logos/bags.png" alt="Bags.fm" width={20} height={20} className="size-5 rounded-sm" />
);

const RaydiumIcon = () => (
    <Image src="/logos/raydium.svg" alt="Raydium" width={20} height={20} className="size-5" />
);

const BankrIcon = () => (
    <Image src="/logos/bankr-favicon.svg" alt="Bankr" width={20} height={20} className="size-5 rounded-sm" />
);

const ClankerIcon = () => (
    <Image src="/logos/clanker.png" alt="Clanker" width={20} height={20} className="size-5 rounded-sm" />
);

const ZoraIcon = () => (
    <Image src="/logos/zora-zorb.png" alt="Zora" width={20} height={20} className="size-5 rounded-full" />
);

const BelieveIcon = () => (
    <Image src="/logos/believe.svg" alt="Believe" width={20} height={20} className="size-5" />
);

const CoinbarrelIcon = () => (
    <Image src="/logos/coinbarrel.svg" alt="Coinbarrel" width={20} height={20} className="size-5 rounded-sm" />
);

const RevShareIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.3 10.8l7.4-3.2M8.3 13.2l7.4 3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
);

/* ─── Wrapper bubble ─── */
const IconBubble = ({ children }: { children: React.ReactNode }) => (
    <div className="flex size-10 items-center justify-center rounded-full border border-border bg-background shadow-sm">
        {children}
    </div>
);

export function OrbitingLogos() {
    return (
        <div className="relative h-full w-full overflow-hidden pointer-events-none" aria-hidden="true">
            <OrbitingCircles iconSize={40}>
                <IconBubble><PumpIcon /></IconBubble>
                <IconBubble><BagsIcon /></IconBubble>
                <IconBubble><RaydiumIcon /></IconBubble>
                <IconBubble><BankrIcon /></IconBubble>
            </OrbitingCircles>
            <OrbitingCircles radius={100} reverse iconSize={40}>
                <IconBubble><ClankerIcon /></IconBubble>
                <IconBubble><ZoraIcon /></IconBubble>
                <IconBubble><BelieveIcon /></IconBubble>
                <IconBubble><CoinbarrelIcon /></IconBubble>
                <IconBubble><RevShareIcon /></IconBubble>
            </OrbitingCircles>
        </div>
    );
}
