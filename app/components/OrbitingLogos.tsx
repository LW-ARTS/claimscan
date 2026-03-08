'use client';

import { OrbitingCircles } from "@/components/ui/orbiting-circles";

/* ─── Official brand logomarks (monochrome) ─── */

const PumpIcon = () => (
    <svg viewBox="0 0 200 200" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21.8855 184.247C-2.01603 162.076 -3.41853 124.726 18.753 100.824L94.7609 18.8855C116.932 -5.01605 154.282 -6.41855 178.184 15.7529C202.085 37.9244 203.488 75.274 181.316 99.1756L105.308 181.115C83.1367 205.016 45.7871 206.419 21.8855 184.247Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M18.753 100.824C-3.41853 124.726 -2.01603 162.076 21.8855 184.247C45.7871 206.419 83.1367 205.016 105.308 181.115L145.81 137.452L59.2549 57.1621L18.753 100.824Z" fill="currentColor" opacity="0.6" />
    </svg>
);

const HeavenIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="12" cy="5.5" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 9v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7 20c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
);

const BankrIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="5" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="8.5" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
        <rect x="13.5" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
        <path d="M9.5 14.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 21h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
);

const RevShareIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.3 10.8l7.4-3.2M8.3 13.2l7.4 3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
);

const ClankerIcon = () => (
    <svg viewBox="0 0 940 1000" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 1000V757.576H181.818V1000H0Z" fill="currentColor" />
        <path d="M378.788 1000V378.788H560.606V1000H378.788Z" fill="currentColor" />
        <path d="M939.394 1000H757.576V0H939.394V1000Z" fill="currentColor" />
    </svg>
);

const BagsIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 6V4a4 4 0 1 1 8 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3.5 10c0-2.357 0-3.536.732-4.268C4.964 5 6.143 5 8.5 5h7c2.357 0 3.536 0 4.268.732C20.5 6.464 20.5 7.643 20.5 10v4c0 3.771 0 5.657-1.172 6.828C18.157 22 16.271 22 12.5 22h-1c-3.771 0-5.657 0-6.828-1.172C3.5 19.657 3.5 17.771 3.5 14v-4Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 11v3m0 0v3m0-3h3m-3 0H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

const ZoraIcon = () => (
    <svg viewBox="0 0 1001 1001" className="size-5" xmlns="http://www.w3.org/2000/svg">
        <circle cx="500" cy="500" r="500" fill="currentColor" />
    </svg>
);

const BelieveIcon = () => (
    <svg viewBox="0 0 24 28" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.03 0.103C9.286-0.03 9.59-0.035 9.85 0.09C10.11 0.214 10.297 0.453 10.355 0.736L11.942 8.711C12.065 9.329 11.352 9.77 10.847 9.387L10.412 9.057C9.756 8.559 9.071 8.098 8.362 7.678L4.411 16.262C4.077 16.986 3.904 17.774 3.904 18.571C3.904 21.637 6.408 24.123 9.496 24.123H15.846C18.193 24.123 20.096 22.234 20.096 19.904C20.096 17.574 18.193 15.685 15.846 15.685H12.402C11.886 15.687 11.391 15.484 11.025 15.12C10.659 14.757 10.452 14.263 10.45 13.747C10.45 12.677 11.324 11.808 12.402 11.808H16.19C16.888 11.811 17.559 11.536 18.054 11.044C18.55 10.552 18.829 9.884 18.832 9.186C18.83 8.488 18.55 7.819 18.054 7.327C17.559 6.835 16.888 6.56 16.19 6.563H15.846C15.33 6.565 14.835 6.362 14.469 5.998C14.103 5.635 13.896 5.141 13.894 4.625C13.894 3.554 14.768 2.686 15.846 2.686H16.19C19.805 2.686 22.736 5.596 22.736 9.186C22.736 11.648 21.378 13.796 19.378 14.925C22.051 15.577 24 17.99 24 20.861C24 24.198 21.298 27 17.992 27H9.496C4.252 27 0 22.779 0 17.571C0 16.375 0.261 15.193 0.762 14.105L5.553 3.706C5.905 2.942 6.715 0.992 9.03 0.103Z" fill="currentColor" />
    </svg>
);

const CoinbarrelIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 6v5c0 1.657 3.134 3 7 3s7-1.343 7-3V6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 11v5c0 1.657 3.134 3 7 3s7-1.343 7-3v-5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="13" r="1" fill="currentColor" />
    </svg>
);

const RaydiumIcon = () => (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 7v10l8 5 8-5V7l-8-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 2v10l8-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 12v10" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 12L4 7" stroke="currentColor" strokeWidth="1.6" />
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
                <IconBubble><HeavenIcon /></IconBubble>
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
