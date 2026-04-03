import 'server-only';
import { x402ResourceServer, HTTPFacilitatorClient, type RouteConfig } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';
const NETWORK = (process.env.X402_NETWORK ?? 'eip155:84532') as `${string}:${string}`;

function getPayTo(): string {
  const addr = process.env.X402_WALLET_ADDRESS;
  if (!addr) throw new Error('[x402] X402_WALLET_ADDRESS is not set — paid endpoints will not work.');
  return addr;
}

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const x402Server = new x402ResourceServer(facilitator)
  .register('eip155:84532', new ExactEvmScheme())
  .register('eip155:8453', new ExactEvmScheme());

export function feeRouteConfig(price: string, description: string): RouteConfig {
  return {
    accepts: { scheme: 'exact', price, network: NETWORK, payTo: getPayTo() },
    description,
    mimeType: 'application/json',
  };
}
