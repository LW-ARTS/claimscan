# Security

## Reporting Vulnerabilities

If you discover a security vulnerability in ClaimScan, please report it responsibly.

**Do not open a public issue.**

Contact us directly:

- **Telegram:** [@lwarts](https://t.me/lwarts)
- **Twitter/X:** [@lwartss](https://x.com/lwartss)

We will acknowledge receipt within 24 hours and provide a timeline for resolution.

## Security Model

ClaimScan handles wallet connections, transaction signing, and cross-chain fee claims. Our security model includes:

- **Turnstile verification** on sensitive operations (claims, high-frequency searches)
- **HMAC request signing** for all client-server communication
- **Rate limiting** with anti-enumeration on identity resolution
- **Zero-custody claiming** — transactions built server-side, signed exclusively in user wallets
- **Honeypot endpoints** to detect and deflect automated scraping
- **Immutable claim states** — finalized claims cannot be replayed or tampered with

## Scope

Reports related to the following are in scope:

- Authentication or authorization bypass
- Transaction manipulation or replay attacks
- HMAC/request signing bypass
- Turnstile verification bypass
- Data exposure (wallet addresses, fee data, identity resolution)
- Rate limiting or anti-enumeration bypass
- Cross-site scripting (XSS) or injection vulnerabilities
- Claim state manipulation

## Out of Scope

- Social engineering attacks
- Denial of service (DoS)
- Issues in third-party services or infrastructure providers
- Honeypot endpoint behavior (intentionally returns fake data)
