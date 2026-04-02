import 'server-only';
import { x402ResourceServer, HTTPFacilitatorClient, type RouteConfig } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';
const PAY_TO = process.env.X402_WALLET_ADDRESS ?? '';
const NETWORK = (process.env.X402_NETWORK ?? 'eip155:84532') as `${string}:${string}`;

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const x402Server = new x402ResourceServer(facilitator)
  .register('eip155:84532', new ExactEvmScheme())
  .register('eip155:8453', new ExactEvmScheme());

export function feeRouteConfig(price: string, description: string): RouteConfig {
  return {
    accepts: { scheme: 'exact', price, network: NETWORK, payTo: PAY_TO },
    description,
    mimeType: 'application/json',
  };
}
