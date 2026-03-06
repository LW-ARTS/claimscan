'use client';

import { OrbitingCircles } from "@/components/ui/orbiting-circles";

/* ─── Official brand logomarks (monochrome) ─── */

const PumpIcon = () => (
    <svg viewBox="0 0 200 200" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21.8855 184.247C-2.01603 162.076 -3.41853 124.726 18.753 100.824L94.7609 18.8855C116.932 -5.01605 154.282 -6.41855 178.184 15.7529C202.085 37.9244 203.488 75.274 181.316 99.1756L105.308 181.115C83.1367 205.016 45.7871 206.419 21.8855 184.247Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M18.753 100.824C-3.41853 124.726 -2.01603 162.076 21.8855 184.247C45.7871 206.419 83.1367 205.016 105.308 181.115L145.81 137.452L59.2549 57.1621L18.753 100.824Z" fill="currentColor" opacity="0.6" />
    </svg>
);

const SolanaIcon = () => (
    <svg viewBox="0 0 397 311" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="currentColor" />
        <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="currentColor" />
        <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="currentColor" />
    </svg>
);

const BaseIcon = () => (
    <svg viewBox="0 0 200 200" className="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M100 200C155.228 200 200 155.228 200 100C200 44.7715 155.228 0 100 0C44.7715 0 0 44.7715 0 100C0 155.228 44.7715 200 100 200ZM100 146.5C125.681 146.5 146.5 125.681 146.5 100C146.5 74.3188 125.681 53.5 100 53.5C76.4716 53.5 56.6661 70.9238 52.6139 93.5H97C100.59 93.5 103.5 96.4101 103.5 100C103.5 103.59 100.59 106.5 97 106.5H52.6139C56.6661 129.076 76.4716 146.5 100 146.5Z" fill="currentColor" />
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

/* ─── Wrapper bubble ─── */
const IconBubble = ({ children }: { children: React.ReactNode }) => (
    <div className="flex size-10 items-center justify-center rounded-full border border-border bg-background shadow-sm">
        {children}
    </div>
);

export function OrbitingLogos() {
    return (
        <div className="relative h-full w-full overflow-hidden pointer-events-none">
            <OrbitingCircles iconSize={40}>
                <IconBubble><PumpIcon /></IconBubble>
                <IconBubble><BaseIcon /></IconBubble>
                <IconBubble><BagsIcon /></IconBubble>
            </OrbitingCircles>
            <OrbitingCircles radius={100} reverse iconSize={40}>
                <IconBubble><ClankerIcon /></IconBubble>
                <IconBubble><SolanaIcon /></IconBubble>
                <IconBubble><ZoraIcon /></IconBubble>
                <IconBubble><BelieveIcon /></IconBubble>
            </OrbitingCircles>
        </div>
    );
}
