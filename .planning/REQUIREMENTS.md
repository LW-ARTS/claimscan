# ClaimScan Launchpad Expansion - v1.1 Requirements

## v1.1 Requirements

### Shared Foundation

- [x] **SF-01**: Migration `032_add_flap_flaunch.sql` estende enum `platform_type` com `'flaunch'` e `'flap'` seguindo ritual literal de `015_remove_heaven.sql` (drop view, rename old enum, recast 5 colunas, recreate view com `security_invoker = on`).
- [x] **SF-02**: Union `Platform` em `lib/supabase/types.ts` estendido com `'flaunch' | 'flap'`. `npx tsc --noEmit` passa após mudança, todo `switch(platform)` em Client Components mantém exhaustiveness.
- [x] **SF-03**: Branded types `BaseAddress` e `BscAddress` em `lib/chains/types.ts` com helpers `asBaseAddress` e `asBscAddress` que aplicam `getAddress()` (checksum EIP-55).
- [x] **SF-04**: `app/components/TokenFeeTable.tsx` ganha branch display-only: quando `platform === 'flaunch' || 'flap'`, esconde `ClaimButton` e renderiza link externo (View on flaunch.gg / flap.sh).
- [x] **SF-05**: `app/components/PlatformIcon.tsx` ganha assets e brand colors pra Flaunch e Flap.

### Flaunch.gg Adapter (Phase 1)

- [x] **FL-01**: Endereços Flaunch Base mainnet adicionados a `lib/constants-evm.ts` com `getAddress()` checksum: `RevenueManager (0xc8d4B2Ca8eD6868eE768beAb1f932d7eecCc1b50)`, `FlaunchPositionManager`, `Flaunch/FairLaunch NFT`, `StakingManager`, `BuyBackManager`, `FeeEscrow`, `FLETH`. Todos verificados em Basescan (source-verification requirement).
- [x] **FL-02**: HTTP client em `lib/flaunch/client.ts` (`server-only`) com Zod validation, throttle de 150ms entre requests, retry exponencial, 429 com `retry-after`, AbortSignal forwarding, discriminated union de erros. Default base URL `https://dev-api.flayerlabs.xyz`, sem API key.
- [x] **FL-03**: Funções `fetchCoinsByCreator(owner)` (GET `/v1/base/tokens?ownerAddress=...`) e `fetchCoinDetail(coin)` (GET `/v1/base/tokens/:address`) retornam tipos schema-validated ou `FlaunchApiError` discriminado.
- [x] **FL-04**: Helper `lib/chains/flaunch-reads.ts` expõe `readFlaunchBalances(recipient: BaseAddress): Promise<bigint>` via viem, lendo `RevenueManager.balances(address) view returns (uint256)`.
- [x] **FL-05**: Adapter `lib/platforms/flaunch.ts` implementa `PlatformAdapter` com `platform: 'flaunch'`, `chain: 'base'`, `supportsLiveFees: true`, `historicalCoversLive: true`. `getCreatorTokens` retorna lista real de coins. `getHistoricalFees` emite UM synthetic TokenFee com `tokenAddress: 'BASE:flaunch-revenue'`, `tokenSymbol: 'ETH'`, `totalUnclaimed = RevenueManager.balances(wallet)` em string.
- [x] **FL-06**: Registro em `lib/platforms/index.ts` (`flaunchAdapter` no record). Cron `index-fees` processa Flaunch automaticamente sem mudanças.
- [x] **FL-07**: Integration test em `lib/__tests__/integration/flaunch.test.ts` com wallet fixture pública Base (holder de Memestream NFT com `balances > 0`). Assert 1 row com synthetic ID; sanity check contra `baseClient.readContract` direto do mesmo wallet.
- [x] **FL-08**: `.env.example` atualizado com `FLAUNCH_API_BASE=https://dev-api.flayerlabs.xyz` (opcional, default embutido). Zero API key.
- [x] **FL-09**: `CLAUDE.md` bumped: "10 launchpads" (após Phase 1), menção ao synthetic ID `BASE:flaunch-revenue` na seção de Pump synthetic IDs.

### Flap.sh Adapter (Phase 2)

- [x] **FP-01**: Endereços Flap BSC mainnet confirmados em docs.flap.sh e adicionados a `lib/constants-evm.ts`: `FLAP_PORTAL`, `FLAP_VAULT_PORTAL`, `FLAP_PORTAL_DEPLOY_BLOCK`. Runtime check `if (FLAP_PORTAL_DEPLOY_BLOCK === 0n) throw` no indexer impede deploy com placeholder.
- [x] **FP-02**: Migration `033_add_flap_tokens.sql` cria tabelas `flap_tokens` (PK token_address, creator indexed, vault_type CHECK, RLS com policy read anônimo) e `flap_indexer_state` (PK contract_address, last_scanned_block). Writes via service role bypass.
- [x] **FP-03**: Helper `lib/chains/flap-reads.ts` com ABIs decoded, `scanTokenCreated({portal, fromBlock, toBlock})` filtrando `log.address === FLAP_PORTAL` (event spoof protection), `batchVaultClaimable(pairs)` via `bscClient.multicall` com `allowFailure: true`.
- [x] **FP-04**: Vault handler registry em `lib/platforms/flap-vaults/`: 4 arquivos (`index.ts` registry, `base-v1.ts`, `base-v2.ts`, `unknown.ts` fallback). `resolveVaultHandler` probe por ABI (`vaultUISchema()` só v2 responde), cacheia `vault_type` em `flap_tokens`.
- [x] **FP-05**: Cron `app/api/cron/index-flap/route.ts`: bearer `CRON_SECRET` via `timingSafeEqual`, `maxDuration = 60`, wallclock guard 55s, janelas seriadas de 250K blocos, upsert idempotente em `flap_tokens` com `ON CONFLICT ignoreDuplicates`, avança `flap_indexer_state`. Schedule em `vercel.json` (ou `vercel.ts` se migrado) a cada 10 min.
- [x] **FP-06**: Adapter `lib/platforms/flap.ts` implementa `PlatformAdapter` com `platform: 'flap'`, `chain: 'bsc'`, lendo `flap_tokens` via service client e dispatchando pro vault handler correto. TokenFee per token (não synthetic) porque Flap vaults são per-token.
- [x] **FP-07**: Registro em `lib/platforms/index.ts`. Fixture wallet BSC + integration test em `lib/__tests__/integration/flap.test.ts`.
- [x] **FP-08**: `CLAUDE.md` bumped: "11 launchpads", documenta cron `index-flap` no rol de convenções.

## v2 Requirements (Deferred)

- Flaunch per-coin revenue breakdown (exige event scan em `RevenueManager.TotalFeesReceived`)
- Flaunch Groups (staking rewards pra ERC20 stakers do Memestream)
- Flap vaults custom (além de VaultBase e VaultBaseV2)
- Claim button em-app pros 2 adapters (bloqueado pela migração Reown AppKit)
- Historical claim events scan em BSC (limitado por scan window, esperar suporte a archive RPC ou migrar pra persisted indexer)
- Hybrid Bitquery backfill one-shot usando 10K pontos do signup bonus (tópico pendente pra revisitar antes de executar Phase 2)

## Out of Scope (v1.1)

- Claims EVM signing in-app -- requer Reown AppKit migration (3-5 dias POC separados)
- Bitquery paid tier -- modelo de pontos opaco, custo imprevisível
- Scan de eventos para claim history -- BSC 250K block window insuficiente, confiar em `claim_events` indo pra frente
- Stress testing dos novos endpoints REST -- quota concern, evitar derrubar a API externa
- Override do `maxDuration=60s` do Vercel Hobby -- respeitar limite, paginar se necessário

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SF-01 | Phase 11: Flaunch Adapter (shared pre-work) | Complete |
| SF-02 | Phase 11: Flaunch Adapter (shared pre-work) | Complete |
| SF-03 | Phase 11: Flaunch Adapter (shared pre-work) | Complete |
| SF-04 | Phase 11: Flaunch Adapter (shared pre-work) | Complete |
| SF-05 | Phase 11: Flaunch Adapter (shared pre-work) | Complete |
| FL-01 | Phase 11: Flaunch Adapter | Complete |
| FL-02 | Phase 11: Flaunch Adapter | Complete |
| FL-03 | Phase 11: Flaunch Adapter | Complete |
| FL-04 | Phase 11: Flaunch Adapter | Complete |
| FL-05 | Phase 11: Flaunch Adapter | Complete |
| FL-06 | Phase 11: Flaunch Adapter | Complete |
| FL-07 | Phase 11: Flaunch Adapter | Complete |
| FL-08 | Phase 11: Flaunch Adapter | Complete |
| FL-09 | Phase 11: Flaunch Adapter | Complete |
| FP-01 | Phase 12: Flap Adapter | Complete |
| FP-02 | Phase 12: Flap Adapter | Complete |
| FP-03 | Phase 12: Flap Adapter | Complete |
| FP-04 | Phase 12: Flap Adapter | Complete |
| FP-05 | Phase 12: Flap Adapter | Complete |
| FP-06 | Phase 12: Flap Adapter | Complete |
| FP-07 | Phase 12: Flap Adapter | Complete |
| FP-08 | Phase 12: Flap Adapter | Complete |
