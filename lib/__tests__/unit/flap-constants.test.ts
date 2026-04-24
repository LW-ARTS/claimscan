import { describe, it, expect } from 'vitest';
import {
  FLAP_PORTAL,
  FLAP_VAULT_PORTAL,
  FLAP_PORTAL_DEPLOY_BLOCK,
} from '@/lib/constants-evm';

describe('FP-01: Flap BSC constants', () => {
  it('FLAP_PORTAL resolves to the verified proxy address', () => {
    expect(FLAP_PORTAL.toLowerCase()).toBe(
      '0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0',
    );
  });

  it('FLAP_VAULT_PORTAL resolves to the verified proxy address', () => {
    expect(FLAP_VAULT_PORTAL.toLowerCase()).toBe(
      '0x90497450f2a706f1951b5bdda52b4e5d16f34c06',
    );
  });

  it('FLAP_PORTAL_DEPLOY_BLOCK is 39_980_228n (not placeholder 0n)', () => {
    expect(FLAP_PORTAL_DEPLOY_BLOCK).toBe(39_980_228n);
    expect(FLAP_PORTAL_DEPLOY_BLOCK).not.toBe(0n);
  });
});
