<div align="center">
  <img src="assets/icon.png" alt="ClaimScan" width="80" />
  <h1>ClaimScan</h1>
  <p><strong>Cross-chain creator fee scanner and claimer for DeFi launchpads on Solana and Base</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Solana-Mainnet-9945FF?logo=solana&logoColor=white" alt="Solana" />
    <img src="https://img.shields.io/badge/Base-Mainnet-0052FF?logo=coinbase&logoColor=white" alt="Base" />
    <img src="https://img.shields.io/website?url=https%3A%2F%2Fclaimscan.tech&label=claimscan.tech" alt="Website" />
  </p>

  <p>
    <a href="https://claimscan.tech">Live App</a> · <a href="https://claimscan.tech/docs">Docs</a> · <a href="https://claimscan.tech/ClaimScan-Whitepaper-V1.pdf">Whitepaper V1.5</a>
  </p>
</div>

---

## What is ClaimScan?

ClaimScan is a free tool that scans and claims unclaimed creator fees across 9 DeFi launchpads on Solana and Base.

~40% of creator fees go unclaimed. Creators launch tokens, generate volume, earn fees, and never claim them. ClaimScan finds that money and lets you claim it.

**Paste any @handle or wallet. Get a full breakdown in under 30 seconds.**

<div align="center">
  <img src="assets/screenshot-home.png" alt="ClaimScan Homepage" width="700" />
</div>

## How It Works

1. Paste a Twitter handle, GitHub username, Farcaster name, or wallet address
2. ClaimScan scans 9 launchpads across Solana + Base simultaneously
3. Full breakdown: earned, claimed, unclaimed in USD with live pricing
4. Connect your wallet and claim uncollected fees directly from ClaimScan

No signup. Read-only scanning. Zero-custody claiming. Always free.

<div align="center">
  <img src="assets/screenshot-scan.png" alt="ClaimScan Scan Result" width="700" />
</div>

## Supported Platforms

### Solana
| Platform | Features |
|----------|----------|
| Bags.fm | Identity resolution, live polling, **direct claim with Turnstile + priority fees** |
| Pump.fun | Historical + live fee tracking |
| Believe | Creator fee tracking |
| RevShare | Revenue share scanning |
| Coinbarrel | Fee discovery |
| Raydium | LP fee tracking |

### Base
| Platform | Features |
|----------|----------|
| Clanker | Farcaster identity + fee tracking |
| Zora | Creator protocol rewards |
| Bankr | Fee recipient tracking |

## Features

### Scanning
- **Cross-chain**: Solana + Base in a single scan
- **Identity resolution**: Supports multiple handle types and wallet addresses
- **Real-time streaming**: Scan progress updates as each platform completes
- **Live polling**: Unclaimed balances auto-update in real time
- **Dynamic dust filter**: Filters noise using live token prices
- **Shareable receipts**: OG image cards for social sharing
- **Privacy-first**: Searches anonymized before logging

### Claiming (V1.5) ✦ Bags.fm Live
V1.5 is the update where ClaimScan went from read-only scanner to full claimer. Bags.fm is the first platform with direct on-chain claiming built in. No third-party custody, no approvals, no token permissions. Connect your wallet, review the simulation, sign, done.

**How the claim flow works:**
1. ClaimScan detects unclaimed fees on Bags.fm for your wallet
2. A claim transaction is built server-side with optimized compute units
3. The transaction is simulated before it ever reaches your wallet
4. You review and sign in your own wallet (Phantom, Backpack, Ledger, or any Wallet Standard compatible wallet)
5. ClaimScan tracks the transaction from submission through on-chain finalization
6. Claim status updates in real time: `pending → signing → submitted → confirmed → finalized`

**Claim architecture:**
- **Zero-custody**: Your keys never leave your wallet. Transactions are constructed server-side but signed exclusively client-side
- **Pre-sign simulation**: Every transaction is simulated on-chain before the wallet prompt appears, so failed claims are caught before you spend gas
- **Priority fees**: Dynamic compute unit pricing calibrated per transaction for reliable confirmation, even during network congestion
- **Turnstile-gated**: Every claim request is verified through Cloudflare Turnstile to prevent bot abuse and replay attacks
- **Finalization tracking**: Claims are tracked end-to-end with immutable state transitions. Once finalized, a claim cannot be reverted or replayed
- **Cryptographic verification**: Claim requests are signed and verified at every step, from client to server to chain
- **Hardware wallet support**: Full compatibility with Ledger and other hardware signers
- **Auto-discovery**: Wallet detection via Wallet Standard protocol. No manual wallet imports needed

> More platforms coming in V2. Bags.fm is just the start.

### Security
- **Defense in depth**: Multiple layers of abuse prevention across all endpoints
- **Bot protection**: Turnstile verification on sensitive operations
- **Request signing**: All client-server communication cryptographically signed
- **Zero-custody claiming**: Transactions signed exclusively in user wallets
- **Tamper-proof claims**: Claim states are immutable once finalized
- **On-chain verifiable**: Every fee record independently verifiable on-chain
- **Anti-enumeration**: Rate-limited identity resolution prevents scraping

### Performance
- **Fast scans**: All routes optimized for parallel execution
- **Smart caching**: Multi-layer caching (Redis + DB) keeps data fresh without hammering the chain
- **Background indexing**: Automated token discovery via Helius DAS webhooks
- **Graceful degradation**: Partial results instead of timeouts
- **SSE streaming**: Real-time scan progress and live fee updates via Server-Sent Events

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js + React + TypeScript |
| Styling | Tailwind CSS + Radix UI + Motion |
| Blockchain | Solana (web3.js) + EVM (Viem) |
| Database | PostgreSQL with row-level security |
| Cache | Redis (Upstash) with in-memory fallback |
| Identity | Cross-platform resolution (Twitter, GitHub, Farcaster, wallets) |
| Pricing | Multi-source aggregation (DexScreener, Jupiter, CoinGecko) |
| Monitoring | Sentry + structured logging |
| Security | Turnstile + HMAC signing + rate limiting + honeypots |
| Deploy | Vercel (Edge + Serverless) |

## Stats

- 9 launchpads supported
- 2 chains (Solana + Base)
- <30 second scan time
- $0 always free

## Roadmap

| Version | Status | Highlights |
|---------|--------|------------|
| **V1.5** | **Live** | 9 platforms, **first on-chain claim flow (Bags.fm)**, Turnstile + priority fees, defense-in-depth security, Helius DAS indexing |
| V2 | Coming Soon | Token Fee Scanner (paste any CA), multi-platform claim |
| V3 | 2026+ | Automated claim scheduling, creator analytics, portfolio dashboard |

## Built By

**[LW ARTS](https://lwdesigns.art)** · [@lwartss](https://x.com/lwartss) · [t.me/lwarts](https://t.me/lwarts)

Fullstack Web3 studio. 408+ crypto projects delivered. $1.6B+ in market cap generated.

## License

Proprietary — All Rights Reserved. See [LICENSE](LICENSE) for full terms. View-only for personal reference. No use, copy, deploy, or derivative works without written permission from LW ARTS.
