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
- **Identity resolution**: Supports multiple handle types and wallet addresses
- **Real-time streaming**: Scan progress updates as each platform completes
- **Live polling**: Unclaimed balances auto-update in real time
- **Dynamic dust filter**: Filters noise using live token prices
- **Shareable receipts**: OG image cards for social sharing
- **Privacy-first**: Searches anonymized before logging

### Claiming (V1.5)
- **Zero-custody**: Transactions built server-side, signed exclusively in your wallet
- **Pre-sign simulation**: Every transaction simulated before wallet prompt
- **Verified requests**: Claims cryptographically verified end-to-end
- **Hardware wallet support**: Works with Ledger and other hardware wallets
- **Auto-discovery**: Detects any Wallet Standard compatible wallet

### Security
- **Defense in depth**: Multiple layers of abuse prevention across all endpoints
- **Zero-custody claiming**: Transactions signed exclusively in user wallets
- **Tamper-proof claims**: Claim states are immutable once finalized
- **On-chain verifiable**: Every fee record independently verifiable on-chain

### Performance
- **Fast scans**: All routes optimized for parallel execution
- **Smart caching**: Multi-layer caching keeps data fresh without hammering the chain
- **Background indexing**: Automated token discovery keeps scans fast
- **Graceful degradation**: Partial results instead of timeouts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Tailwind CSS |
| Blockchain | Solana + EVM (Base) |
| Database | SQL database with access controls |
| Identity | Social identity resolution across platforms |
| Pricing | Multi-source price aggregation |

## Stats

- 9 launchpads supported
- 2 chains (Solana + Base)
- <30 second scan time
- $0 always free

## Roadmap

| Version | Status | Highlights |
|---------|--------|------------|
| **V1.5** | **Live** | 9 platforms, claim system (Bags.fm), multi-layer security |
| V2 | Coming Soon | Token Fee Scanner (paste any CA), multi-platform claim |
| V3 | 2026+ | Automated claim scheduling, creator analytics, portfolio dashboard |

## Built By

**[LW ARTS](https://lwdesigns.art)** · [@lwartss](https://x.com/lwartss) · [t.me/lwarts](https://t.me/lwarts)

Fullstack Web3 studio. 408+ crypto projects delivered. $1.6B+ in market cap generated.

## License

All Rights Reserved. This repository is for reference and demonstration purposes only. The source code is proprietary and not included.
