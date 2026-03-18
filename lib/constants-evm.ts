import { getAddress, type Address } from 'viem';

// Base (EVM) Contract Addresses — getAddress() enforces EIP-55 checksum at import time
// and types them as Address, eliminating all downstream `as Address` casts.
export const CLANKER_FACTORY: Address = getAddress('0xE85A59c628F7d27878ACeB4bf3b35733630083a9');
export const CLANKER_FEE_LOCKER: Address = getAddress('0xF3622742b1E446D92e45E22923Ef11C2fcD55D68');
export const CLANKER_LP_LOCKER: Address = getAddress('0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0');
export const ZORA_PROTOCOL_REWARDS: Address = getAddress('0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B');
