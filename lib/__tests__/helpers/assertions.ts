import { expect } from 'vitest';
import type { TokenFee } from '@/lib/platforms/types';

/**
 * Assert that a TokenFee object conforms to the expected shape contract.
 *
 * Checks:
 * 1. tokenAddress is a non-empty string
 * 2. chain is a non-null string
 * 3. platform is a non-null string
 * 4. totalEarned, totalClaimed, totalUnclaimed are BigInt-safe strings
 * 5. totalEarned >= totalClaimed numerically
 *
 * @param fee     - The TokenFee to validate.
 * @param context - Optional label (e.g. "bags[0]") threaded into failure messages.
 */
export function assertTokenFeeShape(fee: TokenFee, context?: string): void {
  const label = context ? `${context}: ` : '';

  // 1. tokenAddress is a non-empty string
  expect(fee.tokenAddress, `${label}tokenAddress must be a non-empty string`).toBeTypeOf('string');
  expect(fee.tokenAddress.length > 0, `${label}tokenAddress must not be empty`).toBe(true);

  // 2. chain is a non-null string
  expect(fee.chain, `${label}chain must be non-null`).not.toBeNull();
  expect(fee.chain, `${label}chain must be a string`).toBeTypeOf('string');

  // 3. platform is a non-null string
  expect(fee.platform, `${label}platform must be non-null`).not.toBeNull();
  expect(fee.platform, `${label}platform must be a string`).toBeTypeOf('string');

  // 4. Amount fields are BigInt-safe strings
  expect(
    () => BigInt(fee.totalEarned),
    `${label}totalEarned must be a BigInt-safe string (got: ${fee.totalEarned})`
  ).not.toThrow();

  expect(
    () => BigInt(fee.totalClaimed),
    `${label}totalClaimed must be a BigInt-safe string (got: ${fee.totalClaimed})`
  ).not.toThrow();

  expect(
    () => BigInt(fee.totalUnclaimed),
    `${label}totalUnclaimed must be a BigInt-safe string (got: ${fee.totalUnclaimed})`
  ).not.toThrow();

  // 5. totalEarned >= totalClaimed numerically
  expect(
    BigInt(fee.totalEarned) >= BigInt(fee.totalClaimed),
    `${label}totalEarned (${fee.totalEarned}) must be >= totalClaimed (${fee.totalClaimed})`
  ).toBe(true);
}
