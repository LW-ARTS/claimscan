import 'server-only';
import { x402ResourceServer, HTTPFacilitatorClient, type RouteConfig } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';
const NETWORK = (process.env.X402_NETWORK ?? 'eip155:84532') as `${string}:${string}`;

// Resolve at runtime, not build time — Vercel build doesn't have env vars during page collection
const PAY_TO = process.env.X402_WALLET_ADDRESS ?? '';

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const x402Server = new x402ResourceServer(facilitator)
  .register('eip155:84532', new ExactEvmScheme())
  .register('eip155:8453', new ExactEvmScheme());

export function feeRouteConfig(price: string, description: string): RouteConfig {
  const payTo = PAY_TO || process.env.X402_WALLET_ADDRESS || '';
  // M-8: Fail closed — paid endpoints must not serve free content when wallet is missing
  if (!payTo && process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
    throw new Error('[x402] X402_WALLET_ADDRESS must be set in production — paid endpoints cannot operate without a payment recipient');
  }
  return {
    accepts: { scheme: 'exact', price, network: NETWORK, payTo },
    description,
    mimeType: 'application/json',
  };
}
