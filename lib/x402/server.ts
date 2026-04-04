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
