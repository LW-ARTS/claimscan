import type { Metadata } from 'next';
import Link from 'next/link';
import { LazySection } from '../components/LazySection';

export const metadata: Metadata = {
  title: 'Terms of Service & Privacy Policy',
  description:
    'ClaimScan Terms of Service, Privacy Policy, risk disclaimers, and cookie policy. Read the legal terms governing use of the cross-chain DeFi fee tracker.',
  openGraph: {
    title: 'ClaimScan - Terms of Service',
    description:
      'Terms of Service, Privacy Policy, and legal disclaimers for ClaimScan.',
    images: [
      {
        url: 'https://claimscan.tech/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'ClaimScan - Terms of Service',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'ClaimScan - Terms of Service',
    description:
      'Terms of Service, Privacy Policy, and legal disclaimers for ClaimScan.',
    images: [
      {
        url: 'https://claimscan.tech/opengraph-image.png',
        alt: 'ClaimScan - Terms of Service',
      },
    ],
  },
  alternates: {
    canonical: 'https://claimscan.tech/terms',
  },
};

/* ── Helpers ── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/50">
      {children}
    </span>
  );
}

function SectionBlock({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold tabular-nums text-background">
          {number}
        </span>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
      </div>
      <div className="mt-4 ml-10 space-y-4 text-[14px] leading-[1.8] text-foreground/70">
        {children}
      </div>
    </section>
  );
}

/* ── Table of Contents ── */

const TOC = [
  { id: 'acceptance', n: '1', label: 'Acceptance of Terms' },
  { id: 'service-description', n: '2', label: 'Service Description' },
  { id: 'eligibility', n: '3', label: 'Eligibility' },
  { id: 'account-wallets', n: '4', label: 'Account & Wallet Connection' },
  { id: 'acceptable-use', n: '5', label: 'Acceptable Use' },
  { id: 'fees-claims', n: '6', label: 'Fees, Claims & Transactions' },
  { id: 'intellectual-property', n: '7', label: 'Intellectual Property' },
  { id: 'dmca', n: '8', label: 'DMCA & Copyright' },
  { id: 'disclaimers', n: '9', label: 'Disclaimers & Risk Disclosure' },
  { id: 'limitation-liability', n: '10', label: 'Limitation of Liability' },
  { id: 'indemnification', n: '11', label: 'Indemnification' },
  { id: 'privacy', n: '12', label: 'Privacy Policy' },
  { id: 'cookies', n: '13', label: 'Cookie Policy' },
  { id: 'termination', n: '14', label: 'Termination' },
  { id: 'governing-law', n: '15', label: 'Governing Law & Disputes' },
  { id: 'modifications', n: '16', label: 'Modifications' },
  { id: 'severability', n: '17', label: 'Severability & Waiver' },
  { id: 'force-majeure', n: '18', label: 'Force Majeure' },
  { id: 'entire-agreement', n: '19', label: 'Entire Agreement' },
  { id: 'contact', n: '20', label: 'Contact' },
];

/* ── Page ── */

export default function TermsPage() {
  const effectiveDate = 'March 22, 2026';

  return (
    <article className="mx-auto w-full max-w-[720px] px-5 pb-24">
      {/* ═══ HEADER ═══ */}
      <LazySection>
        <header className="pb-12 pt-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3.5 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/70">
              Legal
            </span>
          </div>
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-bold leading-[1.1] tracking-tight">
            Terms of Service
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Terms of Service, Privacy Policy, and legal disclaimers governing the use of ClaimScan.
          </p>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Effective Date: {effectiveDate} · Last Updated: {effectiveDate}
          </p>
          <div className="mx-auto mt-8 h-px w-12 bg-foreground/15" />
        </header>
      </LazySection>

      {/* ═══ ENTITY ═══ */}
      <LazySection rootMargin="300px 0px">
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-5 py-4 text-[13px] leading-relaxed text-foreground/60">
          ClaimScan is developed and operated by <strong className="text-foreground/80">LW ARTS</strong> (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;),
          an independent software studio. By accessing or using <strong className="text-foreground/80">claimscan.tech</strong> (the &quot;Service&quot;),
          you (&quot;User&quot;, &quot;you&quot;, &quot;your&quot;) agree to be bound by these Terms of Service and all policies incorporated
          herein by reference. For entity identification and data protection inquiries, contact{' '}
          <strong className="text-foreground/80">lwarts@claimscan.tech</strong>.
        </div>
      </LazySection>

      {/* ═══ TABLE OF CONTENTS ═══ */}
      <LazySection>
        <nav className="mt-10 rounded-xl border border-foreground/[0.06] p-5" aria-label="Table of Contents">
          <Label>Table of Contents</Label>
          <div className="mt-4 columns-1 gap-x-6 sm:columns-2">
            {TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="mb-1.5 flex items-baseline gap-2.5 break-inside-avoid text-[13px] transition-colors hover:text-foreground"
              >
                <span className="shrink-0 font-mono text-[11px] font-bold text-foreground/30">
                  {item.n.padStart(2, '0')}
                </span>
                <span className="text-foreground/60 hover:text-foreground">
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </nav>
      </LazySection>

      {/* ═══ TERMS SECTIONS ═══ */}
      <div className="mt-14 space-y-14">
        {/* 1 - Acceptance */}
        <LazySection>
          <SectionBlock id="acceptance" number="1" title="Acceptance of Terms">
            <p>
              By accessing, browsing, or using ClaimScan in any manner, you acknowledge that you have read, understood,
              and agree to be bound by these Terms of Service (&quot;Terms&quot;), our Privacy Policy, and any additional terms
              and conditions that may apply to specific features of the Service.
            </p>
            <p>
              If you do not agree to these Terms, you must immediately discontinue use of the Service. Your continued
              use of ClaimScan following the posting of any changes to these Terms constitutes acceptance of those changes.
            </p>
            <p>
              These Terms constitute a legally binding agreement between you and LW ARTS. You represent and warrant that
              you have the legal capacity to enter into this agreement.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 2 - Service Description */}
        <LazySection>
          <SectionBlock id="service-description" number="2" title="Service Description">
            <p>
              ClaimScan is a cross-chain decentralized finance (&quot;DeFi&quot;) analytics platform that aggregates and
              displays creator fee data across multiple blockchain launchpad platforms on Solana, Base, Ethereum,
              and BNB Chain. The Service provides:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'Identity resolution from social handles (Twitter/X, Farcaster, GitHub) and OWS wallet names to blockchain wallet addresses across all supported chains',
                  'Aggregated fee tracking across 10 launchpad platforms (Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, Raydium) on Solana, Base, Ethereum, and BNB Chain',
                  'Real-time USD conversion of on-chain fee data using third-party price feeds',
                  'Claim facilitation for eligible unclaimed fees through zero-custody transaction construction',
                  'Data export and analytics features for creator fee portfolios',
                  'A paid API (V2) that provides fee reports, data exports, and intelligence reports enriched with cross-chain data from Allium, accessible by developers and AI agents via the x402 payment protocol',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p>
              ClaimScan does not operate as a financial institution, money transmitter, exchange, broker-dealer,
              custodian, or investment advisor. The Service is an informational and utility tool that reads publicly
              available blockchain data and facilitates user-initiated on-chain transactions.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 3 - Eligibility */}
        <LazySection>
          <SectionBlock id="eligibility" number="3" title="Eligibility">
            <p>
              You must be at least eighteen (18) years of age, or the age of legal majority in your jurisdiction
              (whichever is greater), to use the Service. By using ClaimScan, you represent and warrant that you
              meet this age requirement.
            </p>
            <p>
              You further represent that you are not (a) located in, or a resident or national of, any country
              subject to comprehensive sanctions by the United States, European Union, or United Nations, including
              but not limited to Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions;
              (b) listed on any U.S. or international sanctions list, including the OFAC Specially Designated
              Nationals list; or (c) otherwise prohibited from accessing or using the Service under applicable law.
            </p>
            <p>
              LW ARTS reserves the right to restrict or deny access to the Service to any person or entity,
              at any time and for any reason, without notice or liability.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 4 - Account & Wallets */}
        <LazySection>
          <SectionBlock id="account-wallets" number="4" title="Account & Wallet Connection">
            <p>
              ClaimScan does not require account registration for read-only scanning features. However, certain
              features (such as claiming unclaimed fees) require you to connect a compatible blockchain wallet.
            </p>
            <p>
              When you connect a wallet to ClaimScan, you understand and agree that:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'You are the sole custodian of your wallet and private keys. ClaimScan never has access to, stores, or controls your private keys or seed phrases.',
                  'You are solely responsible for the security of your wallet, including safeguarding your private keys and approving transactions.',
                  'All transactions initiated through ClaimScan are irreversible once confirmed on the blockchain. ClaimScan cannot reverse, cancel, or modify any blockchain transaction.',
                  'ClaimScan constructs unsigned transactions server-side, simulates them for error detection, and presents them for your explicit approval and signature in your wallet application.',
                  'You bear full responsibility for verifying the details of any transaction before signing.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionBlock>
        </LazySection>

        {/* 5 - Acceptable Use */}
        <LazySection>
          <SectionBlock id="acceptable-use" number="5" title="Acceptable Use">
            <p>
              You agree to use ClaimScan only for lawful purposes and in compliance with all applicable local,
              state, national, and international laws and regulations. You shall not:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'Use the Service for any illegal purpose, including but not limited to money laundering, terrorist financing, tax evasion, or sanctions evasion',
                  'Attempt to gain unauthorized access to any part of the Service, other users\' data, or any systems or networks connected to the Service',
                  'Use automated tools, bots, scrapers, or similar mechanisms to access the Service at a rate exceeding the published rate limits or in a manner that degrades service quality',
                  'Interfere with, disrupt, or attempt to compromise the integrity, security, or availability of the Service or its infrastructure',
                  'Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of the Service',
                  'Circumvent, disable, or otherwise interfere with security-related features of the Service, including rate limiting, request signing, or access controls',
                  'Impersonate any person or entity, or falsely represent your affiliation with any person or entity',
                  'Use the Service to transmit malware, viruses, or other harmful code',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p>
              Violation of these provisions may result in immediate termination of your access to the Service,
              and may expose you to civil and criminal liability.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 6 - Fees, Claims & Transactions */}
        <LazySection>
          <SectionBlock id="fees-claims" number="6" title="Fees, Claims & Transactions">
            <p>
              <strong className="text-foreground/90">Scanning and Viewing.</strong> ClaimScan is free to use for scanning,
              viewing, and analyzing creator fee data. No wallet connection is required for these features.
            </p>
            <p>
              <strong className="text-foreground/90">Claim Service Fee.</strong> When you use ClaimScan to claim unclaimed fees,
              a service fee of 0.85% of the claimed amount is collected. This fee is:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'Calculated server-side based on the unclaimed fee amount at the time of claim',
                  'Collected as a separate blockchain transaction that you must approve in your wallet',
                  'Non-blocking: if you decline the fee transaction, your claim transaction will still proceed',
                  'Subject to a minimum threshold: claims where the calculated fee would be below approximately 0.001 SOL are not charged',
                  'Displayed in the Claim Dialog with exact amounts in both native tokens and USD before you initiate the claim',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p>
              <strong className="text-foreground/90">V2 API Pricing.</strong> ClaimScan V2 API endpoints are paid per request
              via the x402 protocol. When you or your agent queries a paid endpoint, a USDC payment on Base is required
              before data is returned. Current prices are $0.01 per fee report, $0.02 per intelligence report, and $0.05
              per data export. Payment is settled on-chain and verified before the response is delivered. The
              /api/v2/resolve endpoint is free.
            </p>
            <p>
              <strong className="text-foreground/90">Fee Changes.</strong> We reserve the right to modify the fee rate
              for both claim service fees and V2 API pricing with reasonable advance notice. Claim fee changes will be
              reflected in the Claim Dialog before you approve a transaction. API pricing changes will be reflected in the
              HTTP 402 response returned by the x402 protocol.
            </p>
            <p>
              <strong className="text-foreground/90">Blockchain Transaction Fees.</strong> All blockchain transactions initiated
              through ClaimScan (including claim transactions) are subject to network transaction fees (commonly known as
              &quot;gas fees&quot; on EVM chains or &quot;priority fees&quot; on Solana). These fees are paid directly to the
              respective blockchain network validators and are not collected by ClaimScan.
            </p>
            <p>
              <strong className="text-foreground/90">Claim Accuracy.</strong> While ClaimScan endeavors to display accurate fee data,
              the information presented is derived from on-chain data and third-party platform APIs. Fee amounts, claim statuses,
              and USD valuations may be subject to inaccuracies, delays, or discrepancies. You acknowledge that ClaimScan provides
              this data on an &quot;as-is&quot; basis and does not guarantee the accuracy, completeness, or timeliness of any information displayed.
            </p>
            <p>
              <strong className="text-foreground/90">Third-Party Platforms.</strong> Claim functionality depends on the smart contracts
              and APIs of third-party launchpad platforms. ClaimScan has no control over these platforms, their smart contracts,
              or their operational status. Platform downtime, smart contract upgrades, or API changes may affect claim availability.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 7 - Intellectual Property */}
        <LazySection>
          <SectionBlock id="intellectual-property" number="7" title="Intellectual Property">
            <p>
              All content, features, and functionality of the Service, including but not limited to the ClaimScan name,
              logo, design, user interface, graphics, animations, source code, algorithms, and documentation, are the
              exclusive property of LW ARTS and are protected by international copyright, trademark, patent, trade secret,
              and other intellectual property laws.
            </p>
            <p>
              You are granted a limited, non-exclusive, non-transferable, revocable license to access and use the Service
              for personal, non-commercial purposes in accordance with these Terms. This license does not include any right
              to: (a) modify, copy, or create derivative works of the Service; (b) use any data mining, scraping, or similar
              data-gathering methods; or (c) use the Service for any commercial purpose without prior written consent from LW ARTS.
            </p>
            <p>
              All trademarks, service marks, and trade names displayed on the Service are the property of their respective owners.
              The display of third-party platform names and logos (e.g., Pump.fun, Bags.fm, Clanker, Zora) is for informational
              purposes only and does not imply endorsement, affiliation, or sponsorship.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 8 - DMCA */}
        <LazySection>
          <SectionBlock id="dmca" number="8" title="DMCA & Copyright">
            <p>
              LW ARTS respects the intellectual property rights of others. If you believe that any content on ClaimScan
              infringes upon your copyright, you may submit a notice pursuant to the Digital Millennium Copyright Act
              (17 U.S.C. § 512) to our designated copyright agent.
            </p>
            <p>
              Your DMCA notice must include:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'A physical or electronic signature of the copyright owner or a person authorized to act on their behalf',
                  'Identification of the copyrighted work claimed to have been infringed',
                  'Identification of the material that is claimed to be infringing and its location on the Service',
                  'Your contact information (address, telephone number, and email address)',
                  'A statement that you have a good faith belief that use of the material is not authorized by the copyright owner, its agent, or the law',
                  'A statement, under penalty of perjury, that the information in the notification is accurate and that you are authorized to act on behalf of the copyright owner',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p>
              DMCA notices should be directed to: <strong className="text-foreground/80">lwarts@claimscan.tech</strong>.
              We reserve the right to remove content alleged to be infringing without prior notice and at our sole discretion.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 9 - Disclaimers & Risk */}
        <LazySection>
          <div className="rounded-2xl bg-foreground p-6 sm:p-8">
            <section id="disclaimers" className="scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-background/20 bg-background/10 text-[11px] font-bold tabular-nums text-background">
                  9
                </span>
                <h2 className="text-lg font-bold tracking-tight text-background sm:text-xl">
                  Disclaimers & Risk Disclosure
                </h2>
              </div>
              <div className="mt-5 space-y-4 text-[14px] leading-[1.8] text-background/55">
                <p>
                  <strong className="text-background/80">NO FINANCIAL ADVICE.</strong> Nothing on ClaimScan constitutes financial,
                  investment, tax, or legal advice. The Service displays publicly available blockchain data and does not make
                  any recommendation regarding any digital asset, token, or transaction. You should consult qualified
                  professionals before making any financial decisions.
                </p>
                <p>
                  <strong className="text-background/80">CRYPTOCURRENCY RISK.</strong> Interacting with blockchain networks and
                  decentralized protocols involves substantial risk, including but not limited to: total loss of funds, smart
                  contract vulnerabilities, protocol exploits, network congestion, validator failures, bridge failures,
                  regulatory changes, market volatility, liquidity risk, and private key compromise. You acknowledge that
                  the value of digital assets can fluctuate dramatically and may become worthless.
                </p>
                <p>
                  <strong className="text-background/80">CROSS-CHAIN RISK.</strong> ClaimScan operates across multiple blockchain
                  networks (Solana, Base, Ethereum). Cross-chain operations are inherently complex and carry additional risks
                  including network-specific failures, inconsistent data across chains, and potential discrepancies in fee calculations
                  due to differences in blockchain architecture and token decimal precision.
                </p>
                <p>
                  <strong className="text-background/80">THIRD-PARTY DEPENDENCIES.</strong> The Service relies on third-party
                  infrastructure including blockchain RPC providers, price feed APIs (DexScreener, Jupiter, CoinGecko),
                  launchpad platform APIs, and cloud hosting services. We do not guarantee the availability, accuracy, or
                  reliability of any third-party service.
                </p>
                <p>
                  <strong className="text-background/80">&quot;AS IS&quot; BASIS.</strong> THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND
                  &quot;AS AVAILABLE&quot; BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE.
                  LW ARTS EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING, WITHOUT LIMITATION, IMPLIED WARRANTIES OF
                  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
                  THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
                </p>
              </div>
            </section>
          </div>
        </LazySection>

        {/* 10 - Limitation of Liability */}
        <LazySection>
          <SectionBlock id="limitation-liability" number="10" title="Limitation of Liability">
            <p className="text-foreground/80">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LW ARTS, ITS DIRECTORS, OFFICERS,
              EMPLOYEES, AGENTS, AFFILIATES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
              EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, GOODWILL, USE,
              OR OTHER INTANGIBLE LOSSES, REGARDLESS OF THE THEORY OF LIABILITY, ARISING OUT OF OR IN CONNECTION WITH:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'Your access to, use of, or inability to access or use the Service',
                  'Any conduct or content of any third party on the Service, including other users, launchpad platforms, or blockchain networks',
                  'Any loss of digital assets, including but not limited to losses resulting from failed or erroneous blockchain transactions',
                  'Unauthorized access, use, or alteration of your wallet, transmissions, or data',
                  'Inaccurate, delayed, or incomplete fee data, price data, or claim status information',
                  'Any bugs, viruses, or other harmful code transmitted through the Service',
                  'Smart contract failures, exploits, or vulnerabilities in any third-party protocol',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p>
              IN NO EVENT SHALL OUR AGGREGATE LIABILITY EXCEED ONE HUNDRED U.S. DOLLARS (USD $100.00) OR THE AMOUNT
              YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, WHICHEVER IS GREATER.
            </p>
            <p>
              SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IN SUCH JURISDICTIONS,
              OUR LIABILITY SHALL BE LIMITED TO THE MAXIMUM EXTENT PERMITTED BY LAW.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 11 - Indemnification */}
        <LazySection>
          <SectionBlock id="indemnification" number="11" title="Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless LW ARTS and its officers, directors, employees, agents,
              and affiliates from and against any and all claims, damages, obligations, losses, liabilities, costs,
              and expenses (including reasonable attorneys&apos; fees) arising from: (a) your use of the Service; (b) your
              violation of these Terms; (c) your violation of any third-party right, including any intellectual property,
              privacy, or proprietary right; (d) any claim that your use of the Service caused damage to a third party;
              or (e) your violation of any applicable law or regulation.
            </p>
            <p>
              This indemnification obligation shall survive the termination of these Terms and your use of the Service.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 12 - Privacy Policy */}
        <LazySection>
          <SectionBlock id="privacy" number="12" title="Privacy Policy">
            <p>
              <strong className="text-foreground/90">Data Controller.</strong> LW ARTS is the data controller for all personal
              data processed through the Service. For data protection inquiries, contact our Data Protection Contact at{' '}
              <strong className="text-foreground/80">lwarts@claimscan.tech</strong>.
            </p>

            <p>
              <strong className="text-foreground/90">Data Collection.</strong> ClaimScan is designed with a privacy-first
              architecture. We collect minimal data necessary to operate the Service:
            </p>
            <div className="overflow-hidden rounded-xl border border-foreground/[0.06]">
              {[
                ['Search Queries', 'Anonymized and hashed before storage. Raw search inputs are never persisted in readable form.', 'Legitimate interest (service operation)'],
                ['Wallet Addresses', 'Processed transiently during scans. While blockchain addresses are pseudonymous and publicly available, they may constitute personal data under certain privacy regulations (e.g., GDPR) when linkable to an identified individual.', 'Contract performance (service delivery)'],
                ['V2 API Requests', 'Wallet addresses queried via the paid API are processed transiently and not stored beyond caching. Payment data (x402 transactions) is settled on-chain and publicly verifiable.', 'Contract performance (service delivery)'],
                ['Usage Analytics', 'Anonymized performance and usage metrics collected via Vercel Analytics. No tracking cookies or cross-site tracking.', 'Legitimate interest (service improvement)'],
                ['Error Logs', 'Application error data collected via Sentry for debugging purposes. Logs are stripped of PII before transmission.', 'Legitimate interest (service reliability)'],
                ['IP Addresses', 'Processed transiently for rate limiting and abuse prevention. Not stored in persistent logs.', 'Legitimate interest (security)'],
              ].map(([cat, desc, basis], i) => (
                <div
                  key={cat}
                  className={`flex flex-col gap-1 px-4 py-3 ${
                    i % 2 === 0 ? 'bg-foreground/[0.03]' : ''
                  } ${i > 0 ? 'border-t border-foreground/[0.04]' : ''}`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                    <span className="w-32 shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground/40">
                      {cat}
                    </span>
                    <span className="text-[12px] text-foreground/60">{desc}</span>
                  </div>
                  <div className="mt-1 sm:ml-36">
                    <span className="rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-2 py-0.5 text-[11px] font-medium text-foreground/40">
                      Lawful basis: {basis}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p>
              <strong className="text-foreground/90">Lawful Basis for Processing (GDPR Art. 6).</strong> We process personal
              data under the following lawful bases: (a) <em>Contract performance</em>, processing necessary to deliver the
              Service you requested; (b) <em>Legitimate interest</em>, processing necessary for our legitimate interests
              (security, fraud prevention, service improvement), balanced against your rights and freedoms; (c) <em>Legal
              obligation</em>, processing required by applicable law. We do not rely on consent as the primary lawful basis,
              as the Service does not collect data that requires opt-in consent under GDPR.
            </p>

            <p>
              <strong className="text-foreground/90">Data We Do Not Collect.</strong> ClaimScan does not collect or store:
              private keys, seed phrases, passwords, email addresses (unless voluntarily provided for contact purposes),
              government-issued identification, financial account information, or any other sensitive personal data as
              defined under GDPR Art. 9 (special categories of data).
            </p>

            <p>
              <strong className="text-foreground/90">Third-Party Services (Sub-Processors).</strong> The Service integrates
              with third-party sub-processors that process data under contractual obligations consistent with these Terms:
            </p>
            <div className="overflow-hidden rounded-xl border border-foreground/[0.06]">
              {[
                ['Vercel', 'Hosting and analytics', 'United States'],
                ['Sentry', 'Error monitoring', 'United States'],
                ['Cloudflare', 'Security and performance', 'Global (edge network)'],
                ['Supabase', 'Database', 'United States'],
                ['Upstash', 'Caching (Redis)', 'United States'],
                ['Helius', 'Solana RPC and blockchain data', 'United States'],
                ['Jupiter', 'Token price data (Solana)', 'United States'],
                ['DexScreener', 'Token price data (multi-chain)', 'United States'],
                ['CoinGecko', 'Native token price data', 'Singapore'],
                ['Allium', 'Cross-chain wallet data enrichment (V2 API)', 'United States'],
                ['Unavatar', 'Social media avatar proxy', 'Global (CDN)'],
              ].map(([name, purpose, location], i) => (
                <div
                  key={name}
                  className={`flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 ${
                    i % 2 === 0 ? 'bg-foreground/[0.03]' : ''
                  } ${i > 0 ? 'border-t border-foreground/[0.04]' : ''}`}
                >
                  <span className="w-24 shrink-0 text-[11px] font-bold text-foreground/50">{name}</span>
                  <span className="flex-1 text-[11px] text-foreground/50">{purpose}</span>
                  <span className="text-[11px] text-foreground/30">{location}</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-foreground/50">
              We encourage you to review the privacy policies and DPAs of these providers. A current list of sub-processors
              is available upon request at <strong className="text-foreground/70">lwarts@claimscan.tech</strong>.
            </p>

            <p>
              <strong className="text-foreground/90">Telegram Bot.</strong> ClaimScan operates an optional Telegram bot
              that provides fee scanning functionality within Telegram groups. When you interact with the bot, your
              Telegram username and any handles or contract addresses you submit are processed transiently to perform
              scans. The bot shares the same data infrastructure as the web application. Bot usage data (command logs,
              group watch configurations) is stored in the same database under the same retention and security policies
              described above.
            </p>

            <p>
              <strong className="text-foreground/90">Data Retention.</strong> Anonymized search logs are retained for a maximum
              of ninety (90) days for analytics purposes. Cached fee data is retained for the duration of the cache TTL
              (typically 40 minutes to 2 hours) and is automatically purged thereafter. Claim event data is retained
              indefinitely as part of the immutable on-chain transaction record. We review retention periods annually.
            </p>

            <p>
              <strong className="text-foreground/90">Your Data Rights.</strong> Depending on your jurisdiction, you may have
              the following rights regarding your personal data:
            </p>
            <div className="overflow-hidden rounded-xl border border-foreground/[0.06]">
              {[
                ['Right of Access', 'Obtain confirmation of whether we process your data and request a copy (GDPR Art. 15)'],
                ['Right to Rectification', 'Request correction of inaccurate personal data (GDPR Art. 16)'],
                ['Right to Erasure', 'Request deletion of your personal data, subject to legal retention obligations (GDPR Art. 17). Note: data recorded on public blockchains cannot be deleted by any party'],
                ['Right to Restriction', 'Request restriction of processing under certain circumstances (GDPR Art. 18)'],
                ['Right to Portability', 'Receive your data in a structured, machine-readable format (GDPR Art. 20)'],
                ['Right to Object', 'Object to processing based on legitimate interest (GDPR Art. 21)'],
                ['Right to Withdraw Consent', 'Where processing is based on consent, withdraw at any time without affecting prior processing (GDPR Art. 7)'],
                ['Right to Lodge Complaint', 'File a complaint with your local data protection supervisory authority'],
              ].map(([right, desc], i) => (
                <div
                  key={right}
                  className={`flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4 ${
                    i % 2 === 0 ? 'bg-foreground/[0.03]' : ''
                  } ${i > 0 ? 'border-t border-foreground/[0.04]' : ''}`}
                >
                  <span className="w-36 shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground/40">
                    {right}
                  </span>
                  <span className="text-[12px] text-foreground/60">{desc}</span>
                </div>
              ))}
            </div>
            <p>
              To exercise any of these rights, contact us at <strong className="text-foreground/80">lwarts@claimscan.tech</strong>.
              We will respond to all verifiable requests within thirty (30) days. If we need additional time, we will inform
              you of the reason and extension period (up to an additional sixty (60) days).
            </p>

            <p>
              <strong className="text-foreground/90">CCPA/CPRA Disclosure (California Residents).</strong> If you are a
              California resident, you have the right to: (a) know what personal information we collect and how it is used;
              (b) request deletion of your personal information; (c) opt-out of the sale or sharing of your personal information.
              ClaimScan does <strong className="text-foreground/80">not sell or share</strong> personal information as defined
              under the CCPA/CPRA. To submit a request, contact <strong className="text-foreground/80">lwarts@claimscan.tech</strong>.
            </p>

            <p>
              <strong className="text-foreground/90">International Transfers.</strong> The Service is hosted on infrastructure
              in the United States and processes data through globally distributed edge networks. For transfers of personal data
              from the European Economic Area (EEA), United Kingdom, or Switzerland to jurisdictions without an adequacy decision,
              we rely on Standard Contractual Clauses (SCCs) as approved by the European Commission (June 2021 version) and
              supplementary technical measures (encryption in transit and at rest). You may request a copy of our SCCs at{' '}
              <strong className="text-foreground/80">lwarts@claimscan.tech</strong>.
            </p>

            <p>
              <strong className="text-foreground/90">Automated Decision-Making.</strong> ClaimScan does not engage in automated
              decision-making or profiling that produces legal effects or similarly significantly affects you (GDPR Art. 22).
              Rate limiting and anti-abuse mechanisms are applied uniformly to all users and do not constitute individual profiling.
            </p>

            <p>
              <strong className="text-foreground/90">Children&apos;s Privacy.</strong> The Service is not directed at individuals
              under the age of eighteen (18). We do not knowingly collect personal data from minors. If we become aware that
              we have collected data from a minor, we will take steps to delete it promptly.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 13 - Cookie Policy */}
        <LazySection>
          <SectionBlock id="cookies" number="13" title="Cookie Policy">
            <p>
              ClaimScan uses minimal cookies and local storage mechanisms strictly necessary for the operation of the Service.
            </p>
            <div className="overflow-hidden rounded-xl border border-foreground/[0.06]">
              {[
                ['Strictly Necessary', 'Required for security features (Cloudflare Turnstile verification, CSRF protection). Cannot be disabled. No consent required under ePrivacy Directive Art. 5(3).'],
                ['Functional Storage', 'Local storage for wallet connection state, user preferences (theme), and UI state. Cleared when you disconnect your wallet. Classified as strictly necessary for service delivery.'],
              ].map(([cat, desc], i) => (
                <div
                  key={cat}
                  className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 ${
                    i % 2 === 0 ? 'bg-foreground/[0.03]' : ''
                  } ${i > 0 ? 'border-t border-foreground/[0.04]' : ''}`}
                >
                  <span className="w-32 shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground/40">
                    {cat}
                  </span>
                  <span className="text-[12px] text-foreground/60">{desc}</span>
                </div>
              ))}
            </div>
            <p>
              <strong className="text-foreground/90">Analytics.</strong> ClaimScan uses Vercel Web Analytics, which collects
              anonymized, aggregate page view and performance data. Vercel Web Analytics is designed to be privacy-compliant:
              it does not use cookies, does not track individual users across sessions, and does not collect or store personally
              identifiable information. Because this analytics solution does not set cookies or use device fingerprinting,
              it is not subject to cookie consent requirements under the ePrivacy Directive. No individual-level profiling
              or cross-site tracking occurs.
            </p>
            <p>
              <strong className="text-foreground/90">Consent & ePrivacy.</strong> Under the EU ePrivacy Directive (2002/58/EC),
              cookies and similar technologies that are &quot;strictly necessary&quot; for the operation of a service do not require
              user consent. All cookies and local storage mechanisms used by ClaimScan fall within this exemption. Our analytics
              solution (Vercel Web Analytics) does not use cookies and therefore falls outside the scope of the ePrivacy Directive
              cookie consent requirement entirely.
            </p>
            <p>
              ClaimScan does not use advertising cookies, tracking pixels, or any third-party marketing trackers.
              We do not sell, share, or transfer your data to advertisers or data brokers. If we introduce non-essential
              cookies in the future, we will implement a compliant consent mechanism (opt-in for EU/UK users, opt-out
              for US users) before doing so.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 14 - Termination */}
        <LazySection>
          <SectionBlock id="termination" number="14" title="Termination">
            <p>
              We may terminate or suspend your access to the Service immediately, without prior notice or liability,
              for any reason, including but not limited to a breach of these Terms, suspected fraudulent activity,
              or legal or regulatory requirements.
            </p>
            <p>
              Upon termination, your right to use the Service will immediately cease. All provisions of these Terms
              which by their nature should survive termination shall survive, including but not limited to: intellectual
              property provisions, disclaimers, limitation of liability, indemnification, and governing law.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 15 - Governing Law */}
        <LazySection>
          <SectionBlock id="governing-law" number="15" title="Governing Law & Disputes">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware,
              United States, without regard to its conflict of law principles. This choice of law does not deprive
              you of any mandatory consumer protection rights afforded by the laws of your country of residence.
            </p>
            <p>
              <strong className="text-foreground/90">Arbitration.</strong> Any dispute, controversy, or claim arising out
              of or relating to these Terms, or the breach, termination, or invalidity thereof, shall be settled by
              binding arbitration administered by the International Centre for Dispute Resolution (ICDR) in accordance
              with its International Arbitration Rules. The arbitration shall be conducted in English by a single arbitrator.
              The seat of arbitration shall be Wilmington, Delaware, United States. Judgment on the award rendered by
              the arbitrator may be entered in any court having jurisdiction thereof.
            </p>
            <p>
              <strong className="text-foreground/90">Class Action Waiver.</strong> TO THE MAXIMUM EXTENT PERMITTED BY
              APPLICABLE LAW, YOU AGREE THAT ANY DISPUTE RESOLUTION PROCEEDINGS WILL BE CONDUCTED ONLY ON AN INDIVIDUAL
              BASIS AND NOT IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION. You waive any right to participate in a
              class action lawsuit or class-wide arbitration against LW ARTS. If this waiver is found to be unenforceable
              in your jurisdiction, the entirety of this arbitration provision shall be deemed void.
            </p>
            <p>
              <strong className="text-foreground/90">Injunctive Relief.</strong> Notwithstanding the foregoing, LW ARTS
              may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual
              or threatened infringement, misappropriation, or violation of its intellectual property rights or data security.
            </p>
            <p>
              <strong className="text-foreground/90">Statute of Limitations.</strong> You agree that any claim arising out of
              or related to these Terms or the Service must be filed within one (1) year after such claim arose, or be
              permanently barred. This limitation applies to the fullest extent permitted by applicable law.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 16 - Modifications */}
        <LazySection>
          <SectionBlock id="modifications" number="16" title="Modifications">
            <p>
              LW ARTS reserves the right to modify these Terms at any time. Material changes will be communicated by
              updating the &quot;Last Updated&quot; date at the top of this page and, where practicable, by posting a notice
              on the Service.
            </p>
            <p>
              Your continued use of ClaimScan after any modifications to these Terms constitutes your acceptance of the
              revised Terms. If you do not agree to the modified Terms, you must discontinue use of the Service.
            </p>
            <p>
              We recommend reviewing these Terms periodically for any changes. Changes are effective immediately upon
              posting to this page.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 17 - Severability & Waiver */}
        <LazySection>
          <SectionBlock id="severability" number="17" title="Severability & Waiver">
            <p>
              If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent
              jurisdiction, such invalidity, illegality, or unenforceability shall not affect any other provision of these
              Terms, which shall remain in full force and effect. The invalid provision shall be modified to the minimum
              extent necessary to make it valid, legal, and enforceable while preserving its original intent.
            </p>
            <p>
              The failure of LW ARTS to exercise or enforce any right or provision of these Terms shall not constitute
              a waiver of such right or provision. Any waiver of any provision of these Terms will be effective only if
              in writing and signed by LW ARTS. No single or partial exercise of any right or remedy shall preclude the
              further exercise of that or any other right or remedy.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 18 - Force Majeure */}
        <LazySection>
          <SectionBlock id="force-majeure" number="18" title="Force Majeure">
            <p>
              LW ARTS shall not be liable for any failure or delay in performing its obligations under these Terms where
              such failure or delay results from circumstances beyond our reasonable control, including but not limited to:
            </p>
            <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="space-y-2">
                {[
                  'Blockchain network congestion, forks, consensus failures, or protocol-level changes beyond our control',
                  'Smart contract vulnerabilities, exploits, or failures in third-party protocols (including launchpad platforms)',
                  'Third-party API outages, rate limiting, or deprecation by providers (RPC nodes, price feeds, launchpad APIs)',
                  'DDoS attacks, cyber attacks, or other malicious interference with our infrastructure',
                  'Changes in law, regulation, or government action, including sanctions designations or enforcement actions',
                  'Natural disasters, pandemics, acts of war, terrorism, civil unrest, or other acts of God',
                  'Cloud infrastructure outages affecting our hosting, database, or caching providers',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px]">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p>
              During any force majeure event, our obligations under these Terms shall be suspended for the duration of the
              event. We will use reasonable efforts to mitigate the impact and resume normal operations as soon as practicable.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 19 - Entire Agreement */}
        <LazySection>
          <SectionBlock id="entire-agreement" number="19" title="Entire Agreement">
            <p>
              These Terms, together with our Privacy Policy (Section 12), Cookie Policy (Section 13), and any other policies
              expressly incorporated by reference, constitute the entire agreement between you and LW ARTS regarding your use
              of the Service. These Terms supersede all prior and contemporaneous agreements, proposals, representations,
              warranties, and understandings, whether written or oral, between you and LW ARTS concerning the subject matter hereof.
            </p>
            <p>
              <strong className="text-foreground/90">Assignment.</strong> You may not assign or transfer your rights or obligations
              under these Terms without the prior written consent of LW ARTS. LW ARTS may assign its rights and obligations under
              these Terms without restriction. Any attempted assignment in violation of this provision shall be void.
            </p>
            <p>
              <strong className="text-foreground/90">Third-Party Beneficiaries.</strong> These Terms do not create any third-party
              beneficiary rights. No person or entity other than you and LW ARTS shall have any right to enforce any provision
              of these Terms.
            </p>
          </SectionBlock>
        </LazySection>

        {/* 20 - Contact */}
        <LazySection>
          <SectionBlock id="contact" number="20" title="Contact">
            <p>
              For questions, concerns, or requests regarding these Terms, Privacy Policy, or any other legal matter,
              please contact us through the following channels:
            </p>
            <div className="rounded-xl border border-foreground/[0.06] p-5">
              <div className="space-y-3">
                {[
                  { label: 'Email', value: 'lwarts@claimscan.tech' },
                  { label: 'Telegram', value: 't.me/lwarts' },
                  { label: 'X (Twitter)', value: '@lwartss' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-4">
                    <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground/40">
                      {item.label}
                    </span>
                    <span className="font-mono text-[12px] text-foreground/70">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionBlock>
        </LazySection>
      </div>

      {/* ═══ CTA ═══ */}
      <LazySection>
        <section className="mt-20 rounded-2xl bg-foreground py-14 text-center">
          <h2 className="text-xl font-bold tracking-tight text-background sm:text-2xl">
            Ready to find your money?
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-background/50">
            Enter your handle. See what you&apos;re owed. 30 seconds. Free to scan.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-background px-6 py-3 text-sm font-bold text-foreground transition-all duration-200 hover:opacity-90 hover:shadow-[0_4px_20px_-4px_rgba(255,255,255,0.15)]"
          >
            Scan Now <span aria-hidden="true">&rarr;</span>
          </Link>
        </section>
      </LazySection>
    </article>
  );
}
