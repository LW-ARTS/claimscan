# ClaimScan — API Reference

> Base URL: `https://claimscan.tech`
> All amounts are BigInt strings (never floats). Decimals: Solana=9, EVM=18.

---

## Authentication

| Endpoint | Auth Method |
|----------|------------|
| Public endpoints | None (rate-limited) |
| `/api/search` | Cloudflare Turnstile token (optional) |
| `/api/fees/stream` | Request signature (`X-Request-Sig` header) |
| `/api/claim/confirm` | HMAC confirmToken (returned by `/api/claim/bags`) |
| `/api/cron/*` | Bearer token (`Authorization: Bearer {CRON_SECRET}`) |

### Request Signing

Optional HMAC-SHA256 signature for anti-scraping. Header: `X-Request-Sig`.
Computed as: `HMAC(API_SIGN_KEY, path + timestamp)`.
Disabled if `NEXT_PUBLIC_API_SIGN_KEY` is not configured.

### Rate Limits

| Scope | Limit |
|-------|-------|
| General API | 30 req/min per IP |
| Search | 10 req/min per IP |
| Handle enumeration | 20 unique handles / 5min / IP |
| Active claims | 30 per wallet |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## Endpoints

### POST /api/search

Resolve a creator identity and return aggregated fee data.

**Request:**
```json
{
  "query": "vitalikbuterin",
  "cfTurnstileToken": "optional_captcha_token"
}
```

- `query` (string, required): Twitter handle, wallet address, GitHub handle, Farcaster handle, or URL. 2-256 chars.
- `cfTurnstileToken` (string, optional): Cloudflare Turnstile verification token.

**Response `200`:**
```json
{
  "creator": {
    "id": "uuid",
    "twitter_handle": "vitalikbuterin",
    "github_handle": null,
    "farcaster_handle": null,
    "display_name": "Vitalik",
    "avatar_url": "https://..."
  },
  "wallets": [
    {
      "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "chain": "eth",
      "sourcePlatform": "zora"
    }
  ],
  "fees": [
    {
      "id": "uuid",
      "platform": "zora",
      "chain": "base",
      "token_address": "0x...",
      "token_symbol": "TOKEN",
      "total_earned": "1000000000000000000",
      "total_claimed": "0",
      "total_unclaimed": "1000000000000000000",
      "total_earned_usd": 1500.50,
      "claim_status": "unclaimed",
      "royalty_bps": 500,
      "last_synced_at": "2026-03-19T12:00:00Z"
    }
  ],
  "cached": false,
  "refreshing": false
}
```

**Errors:**
- `400` — Invalid query (empty, too short, too long)
- `403` — Turnstile verification failed
- `429` — Rate limited
- `500` — Internal error

---

### POST /api/resolve

Low-level identity→wallets resolution without fee data.

**Request:**
```json
{
  "query": "vitalikbuterin"
}
```

**Response `200`:**
```json
{
  "query": "vitalikbuterin",
  "provider": "twitter",
  "wallets": [
    {
      "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "chain": "eth",
      "sourcePlatform": "zora"
    }
  ]
}
```

**Provider Detection:**
- Solana address (base58, 32-44 chars) → `wallet`
- EVM address (0x, 42 chars) → `wallet`
- `twitter.com/...` or `x.com/...` → `twitter`
- `github.com/...` → `github`
- `warpcast.com/...` or `.eth` suffix → `farcaster`
- Default → `twitter`

---

### GET /api/fees/aggregate

Fetch cached fee records for a creator.

**Query Parameters:**
- `creator_id` (UUID, required)

**Response `200`:**
```json
{
  "fees": [
    {
      "id": "uuid",
      "platform": "bags",
      "chain": "sol",
      "token_address": "So11111111111111111111111111111111111111112",
      "token_symbol": "SOL",
      "total_earned": "5000000000",
      "total_claimed": "2000000000",
      "total_unclaimed": "3000000000",
      "total_earned_usd": 625.00,
      "claim_status": "partially_claimed",
      "last_synced_at": "2026-03-19T10:00:00Z"
    }
  ],
  "summary": {
    "totalEarnedUsd": 1250.50,
    "totalRecords": 42,
    "claimedCount": 15,
    "unclaimedCount": 20,
    "partiallyClaimedCount": 7,
    "truncated": false
  }
}
```

Returns max 500 records. If exceeded, `truncated: true`.

---

### POST /api/fees/live

Query live unclaimed fees directly on-chain.

**Request:**
```json
{
  "wallets": [
    {
      "address": "EPjFWaLb3odccccccccccccccccccccccccPEGgJ",
      "chain": "sol",
      "sourcePlatform": "pump"
    }
  ]
}
```

- Max 10 wallets per request.
- `maxDuration`: 60s.

**Response `200`:**
```json
{
  "fees": [
    {
      "tokenAddress": "...",
      "tokenSymbol": "PUMP",
      "chain": "sol",
      "platform": "pump",
      "totalEarned": "1000000000",
      "totalClaimed": "0",
      "totalUnclaimed": "1000000000",
      "totalEarnedUsd": 150.25,
      "royaltyBps": 500
    }
  ],
  "timestamp": "2026-03-19T12:00:00Z"
}
```

---

### GET /api/fees/stream

SSE stream of live fee updates.

**Query Parameters:**
- `wallets` (JSON string, required): Array of wallet objects
- `sig` (string, required): Request signature

**Headers:**
- `X-Request-Sig`: HMAC signature

**Response:** Server-Sent Events
```
: connected

data: {"platform":"pump","wallet":"...","unclaimed":"1000000000"}

: heartbeat
```

- Max 10 wallets per connection.
- 30s heartbeat interval.
- Auto-cleanup on disconnect.

---

### GET /api/prices

Token prices with 5-minute ISR cache.

**Query Parameters:**
- `chain` (string, optional): `sol` | `base` | `eth` | `bsc`
- `token` (string, optional): Token address

**Response (native prices):**
```json
{
  "sol": 125.50,
  "eth": 3500.75,
  "bnb": 605.20,
  "stale": false
}
```

**Response (single token):**
```json
{
  "chain": "sol",
  "token": "EPjFWaLb3odccccccccccccccccccccccccPEGgJ",
  "priceUsd": 0.00125
}
```

---

### POST /api/claim/bags

Generate batch claim transactions for Bags.fm tokens.

**Request:**
```json
{
  "wallet": "11111111111111111111111111111112",
  "tokenMints": ["mint1", "mint2", "mint3"]
}
```

- `wallet`: Valid Solana address (required)
- `tokenMints`: 1-10 valid Solana token mint addresses (required)

**Response `200`:**
```json
{
  "transactions": [
    {
      "tokenMint": "mint1",
      "claimAttemptId": "uuid",
      "confirmToken": "1710849600.a1b2c3d4e5f6...",
      "txs": [
        {
          "tx": "base64_versioned_transaction",
          "blockhash": {
            "blockhash": "...",
            "lastValidBlockHeight": 123456789
          }
        }
      ]
    }
  ],
  "feeLamports": "5000000",
  "failedMints": [
    {
      "tokenMint": "mint_failed",
      "error": "Claim already in progress"
    }
  ]
}
```

**Fee Calculation:**
- `(total_unclaimed × 85) / 10000`
- Minimum: 0.001 SOL (1,000,000 lamports)

**Errors:**
- `400` — Invalid wallet/mints, empty array, >10 mints
- `429` — Max 30 active claims per wallet
- `500` — TX generation failure

---

### POST /api/claim/confirm

Update claim attempt status or log fee transaction.

**Request (status update):**
```json
{
  "claimAttemptId": "uuid",
  "wallet": "11111111111111111111111111111112",
  "confirmToken": "1710849600.a1b2c3d4e5f6...",
  "status": "confirmed",
  "txSignature": "base58_signature",
  "errorReason": "optional"
}
```

**Request (fee TX logging):**
```json
{
  "feeTx": true,
  "txSignature": "base58_fee_sig",
  "wallet": "11111111111111111111111111111112",
  "feeLamports": "5000000",
  "confirmToken": "1710849600.a1b2c3d4e5f6...",
  "claimAttemptId": "uuid"
}
```

**Response `200`:**
```json
{
  "ok": true,
  "status": "confirmed"
}
```

**Valid Status Transitions:**
```
pending → signing → submitted → confirmed → finalized
                        ↓
                    failed/expired → submitted (recovery within 15min)
```

**Errors:**
- `400` — Missing fields, invalid token format
- `401` — HMAC token expired or invalid
- `403` — Wallet mismatch
- `404` — Claim attempt not found
- `422` — Invalid status transition
- `409` — Optimistic lock conflict (status changed)

---

### GET /api/flex

Download a creator's flex card as a PNG image.

**Query Parameters:**
- `handle` (string, required): Creator handle (2-256 chars)
- `download` (string, optional): Set `false` for inline display. Default: attachment download.

**Response `200`:** PNG image binary with `Content-Disposition: attachment`.

**Headers:**
```
Content-Type: image/png
Content-Disposition: attachment; filename="claimscan-handle.png"
Cache-Control: public, max-age=300, s-maxage=600
```

**Errors:**
- `400` — Missing or invalid handle
- `502` — OG image generation failed
- `500` — Internal error

---

### GET /api/avatar

Proxy avatar images from unavatar.io (Twitter profile pictures).

**Query Parameters:**
- `handle` (string, required): Twitter handle (alphanumeric + underscore, 1-50 chars)

**Response `200`:** Image binary (JPEG, PNG, GIF, or WebP).

**Headers:**
```
Content-Type: image/jpeg
Cache-Control: public, s-maxage=86400, stale-while-revalidate=43200
```

**Errors:**
- `400` — Invalid handle format
- `404` — Avatar not found
- `502` — Upstream error or oversized response (>2MB)

---

## Cron Endpoints

All require `Authorization: Bearer {CRON_SECRET}`.

### GET /api/cron/cleanup

Prune expired data. Optional `?also=prices` to refresh prices in same invocation.

**Response:**
```json
{
  "ok": true,
  "logsDeleted": 1234,
  "creatorsDeleted": 5,
  "pricesDeleted": 45,
  "claimsPending": 2,
  "claimsExpired": 10,
  "claimsTerminalDeleted": 50,
  "tokensUpdated": 5,
  "durationMs": 3500
}
```

### GET /api/cron/index-fees

Sync fees from all platforms. Optional `?also=tokens` for GPA discovery.

### GET /api/cron/index-tokens

Standalone GPA-based token discovery.

### GET /api/cron/refresh-prices

Batch price updates for top tokens from fee_records.

---

## Common Types

```typescript
type Chain = 'sol' | 'base' | 'eth' | 'bsc';

type Platform = 'bags' | 'pump' | 'clanker' | 'zora' | 'bankr'
  | 'believe' | 'revshare' | 'coinbarrel' | 'raydium';

type ClaimStatus = 'claimed' | 'unclaimed' | 'partially_claimed' | 'auto_distributed';

type AttemptStatus = 'pending' | 'signing' | 'submitted'
  | 'confirmed' | 'finalized' | 'failed' | 'expired';

type IdentityProvider = 'twitter' | 'github' | 'farcaster' | 'wallet';
```

---

## Error Format

All errors return:
```json
{
  "error": "Human-readable error message"
}
```

With appropriate HTTP status codes (400, 401, 403, 404, 422, 429, 500).
