import 'server-only';
import { x402ResourceServer, HTTPFacilitatorClient, type RouteConfig } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { createLogger } from '@/lib/logger';

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';
const NETWORK = (process.env.X402_NETWORK ?? 'eip155:84532') as `${string}:${string}`;

// Resolve at runtime, not build time — Vercel build doesn't have env vars during page collection
const PAY_TO = process.env.X402_WALLET_ADDRESS ?? '';

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const log = createLogger('x402');

// Warn if mainnet network is used with the default testnet-only facilitator
const MAINNET_NETWORKS = ['eip155:8453', 'eip155:4326', 'eip155:143', 'eip155:43114'];
const DEFAULT_FACILITATOR = 'https://x402.org/facilitator';

// ─────────────────────────────────────────────────────────────────────────────
// FACILITATOR NOTES
//
// Production currently uses Bitrefill's x402 facilitator
// (https://api.bitrefill.com/x402). Bitrefill maintains a fork of the x402
// protocol and runs its own facilitator infrastructure for paid API customers.
//
// Trust model: the facilitator validates and settles USDC payments on Base
// mainnet on behalf of ClaimScan. If the facilitator is compromised or goes
// down, ALL paid API revenue is affected. The address that receives payments
// (X402_WALLET_ADDRESS) is independent — funds settle directly to that wallet.
//
// Fallback strategy (recommended): Coinbase Developer Platform also operates a
// fee-free x402 facilitator on Base mainnet. Consider documenting an alternate
// facilitator URL and a runtime switch in case Bitrefill becomes unavailable.
// ─────────────────────────────────────────────────────────────────────────────

// M-01: Fail closed in production if X402_NETWORK is still the testnet default.
// Defense-in-depth — production env should explicitly set eip155:8453 (Base mainnet).
// NEXT_PHASE is set during build; skip the check then so the build doesn't fail.
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
  if (NETWORK === 'eip155:84532') {
    throw new Error(
      '[x402] X402_NETWORK is set to Sepolia testnet (eip155:84532) in production. ' +
      'Set X402_NETWORK=eip155:8453 (Base mainnet) before deploying paid endpoints.'
    );
  }
  if (FACILITATOR_URL === DEFAULT_FACILITATOR && MAINNET_NETWORKS.includes(NETWORK)) {
    throw new Error(
      `[x402] Default facilitator ${DEFAULT_FACILITATOR} is testnet-only and cannot serve mainnet network ${NETWORK}. ` +
      'Set X402_FACILITATOR_URL to a mainnet-compatible facilitator (e.g. Bitrefill or Coinbase Developer Platform).'
    );
  }
}

if (MAINNET_NETWORKS.includes(NETWORK) && FACILITATOR_URL === DEFAULT_FACILITATOR) {
  console.warn(
    `[x402] Network ${NETWORK} is mainnet but facilitator is the default testnet-only (${DEFAULT_FACILITATOR}). ` +
    'Set X402_FACILITATOR_URL to a mainnet-compatible facilitator.',
  );
}

export const x402Server = new x402ResourceServer(facilitator)
  .register('eip155:84532', new ExactEvmScheme())
  .register('eip155:8453', new ExactEvmScheme())
  .onAfterVerify(async (context) => {
    log.info('payment verified', {
      payer: context.result.payer,
      network: context.requirements.network,
      amount: context.requirements.amount,
    });
  })
  .onAfterSettle(async (context) => {
    log.info('payment settled', {
      payer: context.result.payer,
      transaction: context.result.transaction,
      network: context.requirements.network,
      amount: context.requirements.amount,
    });
  })
  .onSettleFailure(async (context) => {
    log.error('settlement failed', {
      error: context.error?.message,
      network: context.requirements?.network,
    });
  });

export function feeRouteConfig(
  price: string,
  description: string,
  extensions?: Record<string, unknown>,
): RouteConfig {
  const payTo = PAY_TO || process.env.X402_WALLET_ADDRESS || '';
  // M-8: Fail closed — paid endpoints must not serve free content when wallet is missing
  if (!payTo && process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
    throw new Error('[x402] X402_WALLET_ADDRESS must be set in production — paid endpoints cannot operate without a payment recipient');
  }
  if (!payTo && process.env.NODE_ENV !== 'production') {
    console.warn('[x402] X402_WALLET_ADDRESS not set — x402 endpoints may behave unexpectedly');
  }
  return {
    accepts: [{ scheme: 'exact', price, network: NETWORK, payTo }],
    description,
    mimeType: 'application/json',
    ...(extensions && { extensions }),
  };
}
