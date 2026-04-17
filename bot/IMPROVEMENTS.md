# ClaimScan Bot — Improvements Plan

Planejamento pós-V2.5 (Apr 2026) das 6 melhorias candidatas levantadas no diagnóstico de Apr 17. Cada bloco é auto-contido: objetivo, arquivos, tasks verificáveis, validação, esforço.

## Sequenciamento recomendado

**Wave 1 (1 dia, wins rápidos):** #6 limpar warnings, #4 `/watch @handle`
**Wave 2 (2-3 dias, features médias):** #2 inline mode, #1 mini app deep link, #3 daily recap
**Wave 3 (deferir):** #5 webhook mode (não justifica no volume atual)

Rationale: Wave 1 é quase zero risco e entrega valor imediato. Wave 2 traz crescimento viral (inline + mini app) e retenção (daily recap). Wave 3 é otimização de infra que não resolve problema real hoje.

---

## #1 Mini App deep link (Wave 2)

### Goal
Abrir perfil ClaimScan direto no Telegram via `t.me/ClaimScanBOT/app?startapp=@handle`, sem sair do app.

### Skill context
telegram-mini-app: mobile-first, tg.expand() + tg.ready() obrigatórios, respeitar themeParams, validar initData server-side.

### Files
- `app/layout.tsx` (ou novo `app/(telegram)/layout.tsx`): injetar `<script src="https://telegram.org/js/telegram-web-app.js">` condicional a user-agent Telegram
- `app/[handle]/page.tsx`: detectar `window.Telegram.WebApp` e chamar `ready()` + `expand()`
- `bot/src/handlers/app.ts` (novo): `/app` command que envia inline_keyboard com `web_app: { url: 'https://claimscan.tech/{handle}' }`
- BotFather config: setar menu_button (`/setmenubutton`) + short_name `app`

### Tasks
- [ ] Validar que `/[handle]` renderiza decentemente em mobile Telegram webview (320-390px) → abrir no @BotFather test env
- [ ] Criar `useTelegramWebApp()` hook client-side em `app/components/useTelegramWebApp.ts` → verify: `console.log(tg.initDataUnsafe.user)` aparece
- [ ] Script loader condicional no layout (só se UA inclui "TelegramWebApp") → verify: view-source em browser normal não puxa o script
- [ ] Implementar `bot/src/handlers/app.ts`: parse `/app [@handle]`, resolver handle (fallback `claimscan.tech`), enviar inline button web_app → verify: click abre dentro do Telegram
- [ ] Parse `startapp` param no `[handle]/page.tsx` (vem em `tg.initDataUnsafe.start_param`) → verify: link `t.me/ClaimScanBOT/app?startapp=elon` leva pra `/elon`
- [ ] `/setmenubutton` no BotFather: "🔎 Search" apontando pra mini app → verify: botão aparece no menu ao lado do chat input
- [ ] Registrar `/app` em `setMyCommands` + docs em `help.ts`

### Done when
Usuário roda `/app elonmusk` no bot, botão abre webview com perfil, tg theme matches, back button do Telegram funciona. Deep link `t.me/ClaimScanBOT/app?startapp=lwartss` abre perfil LW no mobile Telegram.

### Effort: M (1-2 dias)

### Risks
- CSP do proxy.ts pode bloquear o script do Telegram (`style-src` já tem `'unsafe-inline'` por conta do wallet-adapter; `script-src` precisa liberar `telegram.org`)
- Wallet-adapter provavelmente não funciona no webview Telegram (sem extensões de browser): desabilitar connect button quando `window.Telegram.WebApp` presente, ou usar TON Connect se migrar fase EVM

---

## #2 Inline mode (Wave 2)

### Goal
Digitar `@ClaimScanBOT 5Qn...` em QUALQUER chat e receber card do token pra enviar, sem adicionar o bot.

### Skill context
telegram-bot-builder inline_query: answer em ≤10s, até 50 results, resultados cacheáveis via `cache_time`.

### Files
- `bot/src/handlers/inline.ts` (novo)
- `bot/src/index.ts`: `bot.on('inline_query', handleInline)` (fora do requireChannel middleware: inline não tem chat context)
- BotFather: `/setinline` com placeholder "CA ou @handle"

### Tasks
- [ ] `/setinline` no BotFather, placeholder "Paste CA or @handle" → verify: digitar `@ClaimScanBOT ` em outro chat mostra placeholder
- [ ] Criar `handleInline` que faz regex do query pra CA (reuse regexes de ca-detect) ou handle (reuse validação de scan) → verify: logs mostram parse correto
- [ ] Se for CA: chamar `lookupToken`, retornar 1 `InlineQueryResultArticle` com `title`, `description`, `input_message_content.message_text` formatado → verify: aparece card no inline bar
- [ ] Se for handle: chamar endpoint leve (resolve + agg cached do Supabase, SEM live fees pro 10s deadline) → verify: retorna sem timeout
- [ ] Implementar `cache_time: 60` + `is_personal: false` pra hit rate do Telegram cache → verify: 2ª busca do mesmo CA é instantânea
- [ ] Rate limit por user_id in-memory (Map com TTL 5s) pra evitar spam de digitação → verify: requests em rajada são droppadas
- [ ] Fallback pra "no results" article com link pra `claimscan.tech/search?q={query}` → verify: query inválida mostra card de busca

### Done when
`@ClaimScanBOT Bp7HP...SOL_MINT` em um chat qualquer (nem precisa ser admin) retorna card que quando tapado envia a mensagem formatada.

### Effort: M (1 dia)

### Risks
- Live fee lookup é lento (10-15s observado em logs): SÓ usar cache DB, nunca adapter live dentro do inline handler
- Inline queries não tem `ctx.chat`, então `requireChannel` precisa ser explicitamente skippado (não está no path porque é event handler, mas validar)

---

## #3 Daily recap em grupos (Wave 2)

### Goal
Resumo diário automatico em grupos opt-in: "Hoje: 5 claims detectados, $47K total claimed, top @elonmusk $18K".

### Files
- `supabase/migrations/024_group_settings.sql` (novo): tabela `group_settings (group_id PK, digest_enabled bool, digest_hour_utc int default 12, created_at)`
- `bot/src/handlers/digest.ts` (novo): `/digest on [HH]`, `/digest off`, `/digest status`
- `bot/src/workers/digest.ts` (novo) OU extensão de `poll.ts`: hourly check
- `bot/src/state/db.ts`: `upsertGroupSettings`, `getGroupsForDigestHour(hour)`, `getDigestStats(groupId, sinceMs)`

### Tasks
- [ ] Migration: `group_settings` table com RLS service-only → verify: `supabase db push` + query no dashboard
- [ ] Handler `/digest on [HH]`: validar hora 0-23 UTC, default 12 → verify: `/digest on 15` responde "digest daily at 15:00 UTC"
- [ ] Worker: adicionar contador hourly no `poll.ts` (já tem ciclo de 5min, usar `alertCycleCounter` pattern) → verify: a cada 60min chama `checkDigests(currentUtcHour)`
- [ ] Query de stats: agregação em `notification_log` WHERE `sent_at > NOW() - 24h AND notification_type = 'claim_detected'` por `group_id` → verify: retorna count + top claimer via join com watched_tokens + creators
- [ ] Format digest msg: reuse `fmtUsd` de format.ts, inline_keyboard com link pro leaderboard → verify: preview no BotFather
- [ ] Send com `sendWithRetry` existente (já handles 429) → verify: log "[digest] Sent N digests"
- [ ] Cleanup: se chat retorna 403 no send, `digest_enabled=false` auto → verify: bot kickado do grupo não tenta de novo

### Done when
Grupo roda `/digest on 14`, no dia seguinte 14:00 UTC o bot posta resumo dos últimos 24h. `/digest off` silencia. Bot não spamma grupos opt-out.

### Effort: M (1-2 dias)

### Risks
- Timezone: hoje só UTC (simples). Suporte a TZ adicional fica pra depois
- Grupo sem claims em 24h: mostrar "0 claims today, tracking N tokens" pra engajamento, não skip silencioso

---

## #4 `/watch @handle` (Wave 1)

### Goal
Notificar o grupo quando creator específico claimar, sem depender de threshold. Complementa `/alert @handle $X`.

### Skill context
telegram-bot-builder: reaproveitar poll worker existente, não criar novo processo.

### Files
- `supabase/migrations/025_watch_rules.sql` (novo): `watch_rules (id, chat_id, user_id, creator_id, last_notified_at, active, created_at, UNIQUE(chat_id, creator_id))`
- `bot/src/handlers/watch.ts` (novo): `/watch @handle`, `/watch list`, `/watch remove @handle` (espelho do `alert.ts`)
- `bot/src/state/db.ts`: CRUD análogo a alert_rules
- `bot/src/workers/poll.ts`: estender `notifyGroups` pra também notificar grupos que têm `watch_rules` ativa pro creator_id do token que claimou

### Tasks
- [ ] Migration: copiar schema de `alert_rules` sem `threshold_usd` → verify: DB dashboard
- [ ] Handler `/watch @handle`: resolver handle → creator_id (copiar lookup de alert.ts linha 107-113) → upsert → verify: "Watching @handle. Notifying on every claim."
- [ ] `/watch list`: listar creators sendo watched no chat → verify: mostra 3 creators cadastrados
- [ ] `/watch remove @handle`: soft delete (active=false) → verify: `/watch list` não mostra
- [ ] Integrar no `notifyGroups` de poll.ts: após `getGroupsForToken`, UNION com grupos de `watch_rules WHERE creator_id = token.creator_id AND active` → verify: claim notifica ambos (tokens paste em grupo E watches de creator)
- [ ] Dedupe por `(chat_id, token_id, claim_tx)` pra não duplicar se grupo tem tanto watch quanto group_watch → verify: claim único = 1 msg no grupo
- [ ] Registrar `/watch` em setMyCommands + help

### Done when
Grupo roda `/watch @elonmusk`, dias depois quando Elon claimar em qualquer token (pump/bags/clanker/etc), grupo recebe notificação mesmo sem ter colado o CA.

### Effort: S (meio-dia)

### Risks
- Conflito com `/alert` (threshold): pode ter watch + alert no mesmo creator. Aceitável, são tipos diferentes
- Spam se creator claima muitos tokens em sequência: considerar cooldown 5min por `(chat_id, creator_id)`

---

## #5 Webhook mode (Wave 3, deferido)

### Goal
Trocar long polling por webhook pra reduzir latência e sobreviver melhor a restarts.

### Análise custo-benefício
**Contra:** volume atual é baixo (poll cycle processa 2 tokens). Long polling resolve. Latência de resposta do grammY long polling já é <1s.
**Requer:** domínio HTTPS apontando pra VPS, reverse proxy (Caddy/Nginx), SSL cert auto (Let's Encrypt ou Cloudflare), `bot.api.setWebhook`, server HTTP em `bot/src/server.ts` (grammY tem `webhookCallback` pronto pra Express/Hono).
**Ganha:** <200ms latência, fault tolerance (se bot cai por 30s, Telegram re-entrega), escalabilidade pra cluster real.

### Recomendação
Deferir até o bot ter >100 grupos ativos ou >10 msg/s. Hoje é overengineering.

### Se executar (future):
- [ ] Apontar subdomínio `bot.claimscan.tech` pra VPS via Cloudflare
- [ ] Caddy reverse proxy com Let's Encrypt auto-cert em `/webhook`
- [ ] Refactor `bot/src/index.ts`: Express mini-server + `webhookCallback(bot, 'express')`
- [ ] `bot.api.setWebhook({ url: 'https://bot.claimscan.tech/webhook', secret_token: process.env.WEBHOOK_SECRET })`
- [ ] Validar `X-Telegram-Bot-Api-Secret-Token` header em cada POST
- [ ] Rollout: manter polling + webhook em shadow por 24h, comparar logs, cortar polling

### Effort: L (2-3 dias + infra)

---

## #6 Limpar warnings Zora/Bankr (Wave 1)

### Goal
Logs menos ruidosos. Warnings esperados (404 quando creator não tem conta Zora/Bankr) rebaixados pra debug. Timeouts reduzidos.

### Skill context
systematic-debugging: warnings atuais são "no root cause" — são respostas legítimas 404 pra creators sem fees nessas plataformas. Log level errado.

### Files (fora do /bot, no main claimscan)
- `lib/platforms/zora.ts`: função que gera warn "Zora Coins API failed" com status 404
- `lib/platforms/bankr.ts`: `getTokenFees returned HTTP 404` warn
- `lib/chains/base.ts` ou `eth.ts`: `getZoraWithdrawLogs: timed out after 15000ms`

### Tasks
- [ ] Em zora.ts: se `res.status === 404`, retornar `[]` e log `logger.debug` (não warn) com msg "no Zora account for wallet" → verify: logs pós-deploy não tem `level:warn` pra 404
- [ ] Em bankr.ts: mesmo pattern, 404 vira debug → verify: logs limpos
- [ ] Zora withdraw logs timeout 15s/20s é excessivo: cortar pra 8s e adicionar retry once com AbortController → verify: timeout vira 1x max, não 2x sequencial
- [ ] Guard: se o creator não tem `creator_tokens` com `platform='zora'`, skip o getZoraWithdrawLogs completamente → verify: logs mostram menos chamadas no cron
- [ ] Deploy no Vercel (não é bot, é a plataforma main) → verify: Sentry Issues cai 80% nos warnings Zora

### Done when
`pm2 logs claimscan-bot --lines 100` tem <5 warnings por 5 min (hoje tem 20+). Sentry não alerta mais sobre Zora 404s rotineiros.

### Effort: S (2-3 horas)

### Risks
- Mudança afeta plataforma Vercel, não o bot diretamente. Deploy separado.
- Se skippar Zora lookup quando creator "não tem" tokens, pode perder fees auto-distribuídas que nunca foram indexadas. Guard deve ser baseado em presença histórica, não ausência.

---

## Notes

- Todas mudanças no `/bot` seguem deploy rsync + pm2 restart (ver `reference_claimscan_bot_vps.md` na memória).
- Mudanças em `/lib`, `/app`, migrations vão via git push + Vercel auto-deploy + `supabase db push`.
- `/setmenubutton`, `/setinline`, `/setcommands` são feitos direto no @BotFather, salvar screenshots do estado pra reverter se precisar.
- Métricas pra validar sucesso pós-deploy: watched_tokens count semanal (alvo: 50+ em 7 dias), leaderboard command uses/dia, unique groups com digest on.
