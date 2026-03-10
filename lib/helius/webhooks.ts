import 'server-only';
import { heliusRestApi, isHeliusAvailable } from './client';

// ═══════════════════════════════════════════════
// Helius Webhook Management
// Create/delete enhanced webhooks for real-time vault monitoring.
// ═══════════════════════════════════════════════

interface WebhookCreatePayload {
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: 'enhanced' | 'raw';
}

interface WebhookResponse {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
}

/** In-memory registry of active webhook IDs for cleanup */
const activeWebhooks = new Map<string, string>(); // walletAddress → webhookID

/**
 * Create a Helius webhook to monitor specific accounts for transfers.
 * No credit cost for creation; 1 credit per event delivery.
 */
export async function createWalletWebhook(
  walletAddress: string,
  vaultAddresses: string[],
  webhookBaseUrl: string
): Promise<string | null> {
  if (!isHeliusAvailable()) return null;
  if (vaultAddresses.length === 0) return null;

  // Check if webhook already exists for this wallet
  const existing = activeWebhooks.get(walletAddress);
  if (existing) return existing;

  const payload: WebhookCreatePayload = {
    webhookURL: `${webhookBaseUrl}/api/webhooks/helius`,
    transactionTypes: ['TRANSFER'],
    accountAddresses: vaultAddresses,
    webhookType: 'enhanced',
  };

  const result = await heliusRestApi<WebhookResponse>(
    '/v0/webhooks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'create-webhook'
  );

  if (result?.webhookID) {
    activeWebhooks.set(walletAddress, result.webhookID);
    return result.webhookID;
  }

  return null;
}

/**
 * Delete a Helius webhook when monitoring is no longer needed.
 */
export async function deleteWalletWebhook(
  walletAddress: string
): Promise<boolean> {
  const webhookId = activeWebhooks.get(walletAddress);
  if (!webhookId || !isHeliusAvailable()) return false;

  const result = await heliusRestApi(
    `/v0/webhooks/${webhookId}`,
    { method: 'DELETE' },
    'delete-webhook'
  );

  activeWebhooks.delete(walletAddress);
  return result !== null;
}

/**
 * List all active webhooks (admin/debug).
 */
export async function listWebhooks(): Promise<WebhookResponse[]> {
  if (!isHeliusAvailable()) return [];
  return (await heliusRestApi<WebhookResponse[]>(
    '/v0/webhooks',
    { method: 'GET' },
    'list-webhooks'
  )) ?? [];
}

/**
 * Check if a webhook exists for a wallet.
 */
export function hasActiveWebhook(walletAddress: string): boolean {
  return activeWebhooks.has(walletAddress);
}
