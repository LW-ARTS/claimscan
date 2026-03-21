<div align="center">
  <img src="assets/icon.png" alt="ClaimScan" width="80" />
  <h1>ClaimScan</h1>
  <p><strong>Cross-chain creator fee scanner and claimer for DeFi launchpads on Solana and Base</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-16.2-black?logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Solana-Mainnet-9945FF?logo=solana&logoColor=white" alt="Solana" />
    <img src="https://img.shields.io/badge/Base-Mainnet-0052FF?logo=coinbase&logoColor=white" alt="Base" />
    <img src="https://img.shields.io/website?url=https%3A%2F%2Fclaimscan.tech&label=claimscan.tech" alt="Website" />
  </p>

  <p>
    <a href="https://claimscan.tech">Live App</a> · <a href="https://claimscan.tech/docs">API Docs</a> · <a href="https://claimscan.tech/ClaimScan-Whitepaper-V1.pdf">Whitepaper V1.5</a>
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
| Bags.fm | Identity resolution, live polling, **direct claim** |
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
- **Identity resolution**: Twitter, GitHub, Farcaster, wallet addresses
- **Real-time streaming**: Scan progress updates as each platform completes
- **Live polling**: Unclaimed balances auto-update in real time
- **Dynamic dust filter**: Filters noise using live token prices
- **Shareable receipts**: OG image cards for social sharing
- **Privacy-first**: Search queries hashed before storage

### Claiming (V1.5)
- **Zero-custody**: Transactions built server-side, signed exclusively in your wallet
- **Pre-sign simulation**: Every transaction simulated before wallet prompt
- **Cryptographic verification**: Claims cryptographically signed and verified
- **Duplicate protection**: Prevents double-claiming per wallet and token
- **Hardware wallet support**: Works with Ledger and other hardware wallets
- **Auto-discovery**: Detects Phantom, Solflare, Backpack, and any Wallet Standard wallet

### Security
- **Multi-layer defense**: Rate limiting, bot detection, request validation, and abuse prevention
- **Full security headers**: CSP, HSTS, X-Frame-Options, Permissions-Policy
- **Anti-bot protection**: Invisible CAPTCHA on search
- **Persistent rate limiting**: Cross-instance enforcement
- **Cryptographic request signing**: All API calls verified
- **Zero-custody claiming**: Transactions signed exclusively in user wallets

### Performance
- **Serverless-optimized**: All routes tuned for edge deployment
- **Multi-key API rotation**: High-throughput platform scanning
- **Batched concurrency**: Parallel API requests with controlled throughput
- **Multi-layer caching**: In-memory + database + CDN caching strategy
- **Background indexing**: Automated token discovery keeps data warm
- **Graceful degradation**: Partial results instead of timeouts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL with row-level security |
| Deployment | Vercel Edge Network |
| Solana | @solana/web3.js, Wallet Adapter |
| EVM | Viem (Base) |
| Identity | Farcaster, Twitter, GitHub resolution |
| Pricing | Multi-source price aggregation |

## Architecture

```
User Query
  |
  v
Identity Resolution (Twitter / GitHub / Farcaster / Wallet)
  |
  v
Parallel Platform Scan (9 adapters, real-time streaming)
  |
  v
Fee Aggregation + USD Pricing
  |
  v
Cached Creator Profile Page
  |
  v (optional)
Zero-custody Claim Flow (sign in your wallet)
```

## Stats

- 9 launchpads supported
- 2 chains (Solana + Base)
- <30 second scan time
- 17 security layers
- $0 always free

## Roadmap

| Version | Status | Highlights |
|---------|--------|------------|
| **V1.5** | **Live** | 9 platforms, claim system (Bags.fm), 17 security layers |
| V2 | Coming Soon | Token Fee Scanner (paste any CA), multi-platform claim, public API |
| V3 | 2026+ | Automated claim scheduling, creator analytics, portfolio dashboard |

## Built By

**[LW ARTS](https://lwdesigns.art)** · [@lwartss](https://x.com/lwartss) · [t.me/lwarts](https://t.me/lwarts)

Fullstack Web3 studio. 408+ crypto projects delivered. $1.6B+ in market cap generated.

## License

All Rights Reserved. This repository is for reference and demonstration purposes only. The source code is proprietary and not included.
