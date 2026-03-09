# CLAIMSCAN WHITEPAPER V1.0 — FIGMA DESIGN PROMPT

## INSTRUCAO GERAL

Crie um whitepaper/documento de 12 paginas para o ClaimScan — um tracker de fees cross-chain para criadores DeFi. O design deve seguir uma estetica **brutalist monochrome** (preto, branco, cinzas) com tipografia bold, muito whitespace, e visual premium crypto-native. Pense: pitch deck de startup tech + whitepaper cripto + design editorial suico.

---

## DESIGN SYSTEM / VISUAL RULES

### Paleta de Cores
```
Principal:
- #0A0A0A — Black (backgrounds, headers, text principal)
- #111111 — Near Black
- #1A1A1A — Dark Gray
- #222222 — Mid Dark
- #333333 — Mid Gray (body text alternativo)
- #666666 — Gray (body text, subtitles)
- #999999 — Light Gray (labels, section numbers)
- #CCCCCC — Lighter Gray (secondary text em dark bg)
- #E8E8E8 — Off White (borders, separadores)
- #F5F5F5 — Near White (cards bg, backgrounds alternados)
- #FAFAFA — White BG

Cores das Plataformas (usar APENAS na pagina de plataformas):
- Pump.fun: #00D4AA
- Bags.fm: #FF6B35
- Heaven: #FFD700
- Believe: #E91E63
- RevShare: #4CAF50
- Coinbarrel: #FF8C00
- Raydium: #6C5CE7
- Clanker: #0052FF
- Zora: #5B5BD6
- Bankr: #1DA1F2
```

### Tipografia
```
Headings: Exo 2 Bold (ou Inter Bold/Helvetica Bold como fallback)
- Titulos principais: 32-52px, UPPERCASE, letter-spacing: -0.02em (tracking tight)
- Section numbers: 8px, Light Gray, uppercase

Body: Inter / Helvetica
- Corpo principal: 11px, cor #333333 ou #666666
- Corpo secundario: 9-10px, cor #666666 ou #999999

Monospace: JetBrains Mono / Courier
- Dados tecnicos, stats, schemas: 9-10px

Quotes: Italic, 10px
```

### Elementos Visuais
```
- Linhas grossas (2px) pretas como separadores de secao
- Linhas finas (0.5px) cinzas como separadores internos
- Dot grid pattern sutil no background (pontos de 0.3-0.5px radius, spacing 20-30px, cor #E0E0E0 em white / #1A1A1A em dark)
- Barras pretas com texto branco para headers de subsecao
- Cards com borda esquerda preta grossa (3-4px) para citacoes
- Alternancia preto/branco em secoes para ritmo visual
- Numeros de pagina centralizados no rodape (8px, #999999)
- Logo = Quadrado preto arredondado com "CS" branco em Helvetica Bold dentro
```

### Layout
```
- Formato: Letter (8.5 x 11 inches / 612 x 792pt)
- Margens: 0.75 inch (54pt) em todos os lados
- Largura de conteudo: ~504pt
- Whitespace generoso entre secoes
- Grid de 2 ou 3 colunas para stats e platforms
```

---

## PAGINA 1 — CAPA

**Background:** Full #0A0A0A (preto total)
**Dot grid pattern:** pontos #1A1A1A, spacing 30px

**Layout (de cima pra baixo, centralizado):**

1. **Topo** — Linha horizontal fina cinza (#666666)
   - Esquerda: "MARCH 2026" (8px, #666666)
   - Direita: "WHITEPAPER V1.0" (8px, #666666)

2. **Centro-superior** — Logo grande
   - Quadrado branco 100x100px, border-radius ~12px
   - Dentro: "CS" em preto, bold, ~42px

3. **Centro** — Titulo
   - "CLAIMSCAN" — 52px, bold, branco, uppercase, tracking tight

4. **Subtitulo**
   - "CROSS-CHAIN DEFI FEE TRACKER" — 14px, #CCCCCC

5. **Linha separadora** — fina, cinza, 3 inches de largura, centralizada

6. **Taglines**
   - "Stop leaving money on the table." — 10px, #666666
   - "10 platforms. 2 chains. One search." — 10px, #666666

7. **Rodape** — Linha horizontal fina cinza
   - "A PRODUCT BY" — 9px, #666666, centralizado
   - "LW TEAM" — 14px, bold, branco, centralizado
   - "lwdesigns.art" — 8px, #666666

---

## PAGINA 2 — TABLE OF CONTENTS

**Background:** Branco com dot grid #F0F0F0

**Layout:**

1. **Label:** "01" — 8px, #999999

2. **Titulo:**
   - "TABLE OF" — 36px, bold, preto
   - "CONTENTS" — 36px, bold, preto

3. **Linha grossa preta** (2px)

4. **Lista de secoes** — cada item tem:
   - Numero bold grande (24px, preto): "01", "02", etc.
   - Titulo (14px, bold, uppercase, preto): "INTRODUCTION", "THE PROBLEM", etc.
   - Subtitulo (9px, #666666): breve descricao
   - Linha pontilhada fina ate a margem direita
   - Separador fino entre itens

**Secoes:**
```
01 — INTRODUCTION — What is ClaimScan?
02 — THE PROBLEM — The Creator Fee Problem
03 — THE SOLUTION — How ClaimScan Solves It
04 — HOW IT WORKS — Technical Flow
05 — SUPPORTED PLATFORMS — Solana & Base Ecosystems
06 — ARCHITECTURE — Tech Stack & Infrastructure
07 — SECURITY & PRIVACY — Built with Security First
08 — ROADMAP — What's Next
09 — TEAM — Built by LW TEAM
```

---

## PAGINA 3 — INTRODUCTION (What is ClaimScan?)

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 01" — 8px, #999999

2. **Titulo:**
   - "WHAT IS" — 32px, bold, preto
   - "CLAIMSCAN?" — 32px, bold, preto

3. **Linha grossa preta**

4. **Paragrafo introdutorio:**
   > Every day, creators leave thousands of dollars unclaimed across DeFi. ClaimScan is the first cross-chain fee intelligence layer built for the creator economy. It scans 10 launchpads across Solana and Base in real time, surfacing every dollar you've earned, claimed, and left behind.

5. **Bloco de citacao** (fundo #F5F5F5, borda esquerda preta 3px):
   > "Your money is already out there. ClaimScan finds it. 10 platforms. 2 chains. Zero excuses."

6. **Header bar preta:** "KEY METRICS"

7. **Grid de Stats — 2 linhas x 3 colunas:**

   **Linha 1 (fundo preto, texto branco):**
   | 10 | 2 | ~40% |
   |---|---|---|
   | PLATFORMS TRACKED | BLOCKCHAINS | FEES UNCLAIMED |

   **Linha 2 (fundo branco, borda preta):**
   | <30s | FREE | 24/7 |
   |---|---|---|
   | SCAN TIME | ALWAYS | LIVE TRACKING |

   Cada box: numero grande (22px, bold) em cima, label (8px, uppercase) embaixo

8. **Paragrafo CTA:**
   > Whether you launched on Pump.fun last week or Clanker six months ago, ClaimScan has your back. Enter any handle or wallet address and see exactly what's waiting for you. No signups. No fees. Just your money.

---

## PAGINA 4 — THE PROBLEM

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 02" — 8px, #999999

2. **Titulo:**
   - "THE CREATOR" — 32px, bold, preto
   - "FEE PROBLEM" — 32px, bold, preto

3. **Linha grossa preta**

4. **Paragrafo (pain-driven copy):**
   > You launched a token on Pump.fun. A few on Clanker. Maybe one on Believe. Each platform deposited creator fees into different wallets, using different mechanisms, on different chains. You forgot to claim some. You didn't even know about others. Right now, your money is sitting unclaimed across DeFi.

5. **3 Cards de Pain Points** (empilhados verticalmente):

   Cada card:
   - Altura ~110px
   - Background alternado (#F5F5F5 / branco)
   - Borda fina #E8E8E8
   - Barra de acento preta 4px na esquerda
   - Numero grande (28px) no canto direito em #E8E8E8
   - Titulo bold (12px, preto)
   - Descricao (9px, #666666)

   **Card 01 — FRAGMENTED DASHBOARDS**
   > 10 platforms. 10 different dashboards. 10 different login flows. No creator is checking all of them. Most check zero. The friction kills the claim rate — and your revenue disappears.

   **Card 02 — CROSS-CHAIN COMPLEXITY**
   > Solana and Base speak different languages. Different wallets, explorers, RPCs, and token standards. If you launched on both chains, you need two completely separate workflows just to see what you're owed. Nobody has time for that.

   **Card 03 — IDENTITY SPRAWL**
   > Your @handle on Twitter, your Farcaster FID, your GitHub, your 0x wallet, your Solana address — all disconnected. Platforms see fragments of you. No tool connects the dots. Until now.

6. **Callout bar preta** no rodape:
   > "THE RESULT: MILLIONS IN UNCLAIMED CREATOR FEES ACROSS DEFI"
   (texto branco, 11px bold, centralizado)

---

## PAGINA 5 — THE SOLUTION

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 03" — 8px, #999999

2. **Titulo:**
   - "HOW CLAIMSCAN" — 32px, bold, preto
   - "SOLVES IT" — 32px, bold, preto

3. **Linha grossa preta**

4. **6 Items de Solucao** — layout alternado:

   Items impares (1, 3, 5): **Fundo preto**, texto branco
   Items pares (2, 4, 6): **Fundo branco**, borda #E8E8E8

   Cada item: ~70px altura, padding 15px
   - Titulo (11px, bold)
   - Descricao (9px)
   - Gap de 4px entre items

   **Item 1 (PRETO) — ONE SEARCH, ALL PLATFORMS**
   > Type your @handle. That's it. ClaimScan fires parallel queries across all 10 platforms and delivers your complete fee picture in under 30 seconds. No logins. No switching tabs.

   **Item 2 (BRANCO) — CROSS-CHAIN AGGREGATION**
   > Solana and Base, unified. ClaimScan scans both ecosystems simultaneously and merges the results into a single dashboard. One view of everything you're owed.

   **Item 3 (PRETO) — REAL-TIME TRACKING**
   > Live polling every 30 seconds catches newly accumulated fees the moment they appear. Your dashboard is always current. Set it and forget it — we'll keep watching.

   **Item 4 (BRANCO) — IDENTITY RESOLUTION**
   > Enter a Twitter handle, and we'll find the wallets. Enter a Farcaster FID, and we'll map it to every chain. ClaimScan resolves your identity graph automatically.

   **Item 5 (PRETO) — USD VALUATION**
   > Raw token amounts mean nothing without context. ClaimScan converts everything to USD using live feeds from CoinGecko, DexScreener, and Jupiter. See real dollar amounts.

   **Item 6 (BRANCO) — ZERO COST, ZERO CATCH**
   > Free. Not freemium. Not "free trial". Free. We built ClaimScan for ourselves first. Now every creator in the ecosystem can use it. No token. No premium tier. Just value.

---

## PAGINA 6 — HOW IT WORKS

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 04" — 8px, #999999

2. **Titulo:**
   - "HOW IT" — 32px, bold, preto
   - "WORKS" — 32px, bold, preto

3. **Linha grossa preta**

4. **Subtitulo:**
   > "From @handle to full fee breakdown in under 30 seconds. Here's how."

5. **Timeline vertical de 6 steps:**

   Cada step tem:
   - Circulo preto (28px diametro) com numero branco bold (12px) dentro
   - Linha pontilhada vertical cinza conectando ao proximo circulo
   - Titulo (11px, bold, preto) a direita do circulo
   - Descricao (9px, #666666) abaixo do titulo
   - ~80px de espaco vertical entre steps

   **Step 1 — USER INPUT**
   > Enter a Twitter handle, GitHub username, Farcaster handle, or wallet address. ClaimScan accepts multiple identity formats including direct URLs.

   **Step 2 — IDENTITY RESOLUTION**
   > Social identities are resolved to wallet addresses using Neynar API, Twitter API, and on-chain data. Multiple wallets can be discovered from a single identity.

   **Step 3 — MULTI-PLATFORM SCAN**
   > Simultaneously queries 10 launchpad APIs and smart contracts across Solana and Base. Each platform adapter handles its own data format and claim mechanisms.

   **Step 4 — FEE AGGREGATION**
   > Collects earned, claimed, and unclaimed fee data per token per platform. Data is normalized and deduplicated across all sources.

   **Step 5 — USD CONVERSION**
   > Live price feeds from CoinGecko, DexScreener, and Jupiter convert native token amounts to USD. Prices are cached with a 5-minute TTL for performance.

   **Step 6 — REAL-TIME DASHBOARD**
   > Results displayed with live polling at 30-second intervals, platform breakdown, chain breakdown, token-level details, and claim status indicators.

6. **Nota no rodape** (fundo #F5F5F5, borda esquerda preta 2px):
   > NOTE: All scanning is read-only. ClaimScan never requires wallet connections or signatures.

---

## PAGINA 7 — SUPPORTED PLATFORMS

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 05" — 8px, #999999

2. **Titulo:**
   - "SUPPORTED" — 32px, bold, preto
   - "PLATFORMS" — 32px, bold, preto

3. **Linha grossa preta**

4. **Subtitulo:** "10 platforms across 2 blockchains. More coming in V2."

5. **Layout 2 colunas:**

   **Coluna Esquerda — SOLANA (header bar preto: "SOLANA" | "7 PLATFORMS")**

   Cada plataforma:
   - Dot colorido (8px diametro) com a cor da plataforma
   - Nome (11px, bold, preto)
   - Descricao (8px, #666666)
   - Separador fino horizontal

   ```
   [#00D4AA] Pump.fun — The largest Solana token launchpad
   [#FF6B35] Bags.fm — Social token platform
   [#FFD700] Heaven — Creator-focused launchpad
   [#E91E63] Believe — Community-driven launches
   [#4CAF50] RevShare — Revenue sharing protocol
   [#FF8C00] Coinbarrel — Token launch platform
   [#6C5CE7] Raydium — Leading Solana DEX/AMM
   ```

   **Coluna Direita — BASE (header bar preto: "BASE" | "3 PLATFORMS")**

   ```
   [#0052FF] Clanker — Base-native token launcher
   [#5B5BD6] Zora — Creator economy protocol
   [#1DA1F2] Bankr — DeFi trading platform
   ```

   Abaixo dos 3 items da Base, box #F5F5F5:
   > "+ More platforms coming in V2"
   > "  Ethereum L1, Arbitrum, and more"

6. **Banner preto no rodape:**
   - Linha 1 (bold, branco): "MORE PLATFORMS ARE BEING ADDED CONTINUOUSLY"
   - Linha 2 (9px, #CCCCCC): "ClaimScan V2 will expand to additional chains and launchpads."

---

## PAGINA 8 — ARCHITECTURE & TECH STACK

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 06" — 8px, #999999

2. **Titulo:**
   - "ARCHITECTURE &" — 32px, bold, preto
   - "TECH STACK" — 32px, bold, preto

3. **Linha grossa preta**

4. **Tabela de Tech Stack** (linhas alternadas #F5F5F5 / branco):

   | Categoria (bold, 9px) | Tecnologia (Courier, 9px, #666) |
   |---|---|
   | FRONTEND | Next.js 16 + React 19 + Tailwind CSS v4 |
   | BLOCKCHAIN | @solana/web3.js + viem (EVM/Base) |
   | DATABASE | Supabase (PostgreSQL) |
   | PRICE FEEDS | CoinGecko, DexScreener, Jupiter API |
   | IDENTITY | Neynar API (Farcaster), Twitter API |
   | MONITORING | Sentry error tracking |
   | DEPLOYMENT | Vercel Edge Network |
   | TYPOGRAPHY | Exo 2 (headings) + JetBrains Mono |

   Altura de cada linha: 32px

5. **Header bar preto:** "DATABASE SCHEMA"

6. **Schema diagram** (fundo #F5F5F5, fonte Courier):
   ```
   creators  -->  wallets  -->  fee_records
       |              |              |
   identity       blockchain     per-token fees
   resolution     addresses      & USD values
   ```

7. **Header bar preto:** "KEY ARCHITECTURE DECISIONS"

8. **Lista com bullet points:**
   - **In-flight deduplication** — Prevents duplicate API calls for concurrent requests
   - **30-second timeout** — All resolve operations timeout gracefully in serverless
   - **5-minute cache TTL** — Creator and fee data cached for optimal performance
   - **Visibility-aware polling** — Stops polling when browser tab is hidden
   - **Privacy-first logging** — SHA256 hashed search queries, no raw PII stored

---

## PAGINA 9 — SECURITY & PRIVACY

**Background:** Full #0A0A0A (pagina toda preta)
**Dot grid:** pontos #151515, spacing 30px

**Layout:**

1. **Label:** "SECTION 07" — 8px, #666666

2. **Titulo (branco):**
   - "SECURITY &" — 32px, bold, branco
   - "PRIVACY" — 32px, bold, branco

3. **Linha cinza** (#666666, 2px)

4. **Subtitulo italic:**
   > "We never touch your wallet. We never store your data. By design."
   (11px, italic, #CCCCCC)

5. **6 Cards de Seguranca** (empilhados):

   Cada card:
   - Borda #333333 (0.5px)
   - Barra branca de acento (3px) na esquerda
   - Titulo (10px, bold, branco)
   - Descricao (9px, #999999)
   - ~72px altura, gap 8px

   **PRIVACY-PRESERVING SEARCH**
   > All search queries are SHA256 hashed before logging. We never store raw search terms. Your identity lookups remain private.

   **SERVER-SIDE ISOLATION**
   > All sensitive operations run server-side only using Next.js server components. API keys and service role credentials are never exposed to the client bundle.

   **ANTI-COPY PROTECTION**
   > Proprietary content and data displays are protected against unauthorized reproduction and scraping attempts.

   **NO WALLET CONNECTIONS**
   > ClaimScan is completely read-only. We never ask for wallet signatures, approvals, or any form of blockchain write access. Zero transaction risk.

   **ZERO DATA COLLECTION**
   > No personal data stored. No cookies. No tracking beyond anonymized, hashed analytics. Your privacy is not a feature — it's the default.

   **VERIFIABLE ON-CHAIN DATA**
   > Every fee record displayed can be independently verified on-chain. ClaimScan reads directly from smart contracts and public APIs. No black boxes.

---

## PAGINA 10 — ROADMAP

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 08" — 8px, #999999

2. **Titulo:**
   - "WHAT'S" — 32px, bold, preto
   - "NEXT" — 32px, bold, preto

3. **Linha grossa preta**

4. **Bloco V1 — CURRENT (fundo preto, 165px altura):**

   Header: "V1" (18px, bold, branco) + "CURRENT | MARCH 2026" (10px, #CCCCCC)

   Items com ">" em cor #00D4AA (verde Pump.fun):
   ```
   > 10 platform support (Solana + Base)
   > Multi-identity search (Twitter, GitHub, Farcaster, Wallet)
   > Real-time fee polling with 30s intervals
   > USD conversion with live price feeds
   > Mobile-responsive brutalist design
   > Privacy-preserving search analytics
   ```

5. **Bloco V2 — COMING SOON (fundo branco, borda preta 1.5px, 155px altura):**

   Header: "V2" (18px, bold, preto) + "COMING SOON" (10px, #666666)

   Items com "->" em #666666:
   ```
   -> Additional chain support (Ethereum L1, Arbitrum, etc.)
   -> More launchpad integrations
   -> Historical fee tracking & analytics
   -> Email/Telegram notifications for new unclaimed fees
   -> Portfolio dashboard for multi-creator agencies
   -> API access for third-party integrations
   ```

6. **Bloco V3 — FUTURE (fundo #F5F5F5, 110px altura):**

   Header: "V3" (18px, bold, #999999) + "FUTURE" (10px, #999999)

   Items com "->" em #CCCCCC:
   ```
   -> One-click claim across all platforms
   -> Automated claim scheduling
   -> Creator analytics & insights dashboard
   -> SDK for platform integrations
   ```

7. **Texto centralizado no rodape:**
   - "This is V1. We're just getting started." (12px, bold, preto)
   - "More updates coming soon." (10px, #666666)

---

## PAGINA 11 — TEAM (Built by LW TEAM)

**Background:** Branco

**Layout:**

1. **Label:** "SECTION 09" — 8px, #999999

2. **Titulo:**
   - "BUILT BY" — 32px, bold, preto
   - "LW TEAM" — 32px, bold, preto

3. **Linha grossa preta**

4. **Paragrafo:**
   > LW is not an agency. We're a 4-person Web3 development studio that ships real products. No layers. No outsourcing. Every project is built by the same people you talk to on Telegram.

5. **Bloco de citacao** (fundo #F5F5F5, borda esquerda preta 3px):
   > "We've been deep in crypto since 2021. We survived rug pulls, bear markets, and hype cycles. We don't just build — we understand the market."

6. **2 Stats boxes lado a lado (fundo preto, texto branco):**
   | 408+ | $1.6B+ |
   |---|---|
   | PROJECTS DELIVERED | MARKET CAP GENERATED |

7. **Header bar preto:** "THE TEAM"

8. **Grid 2x2 de team members:**

   Cada card:
   - Borda #E8E8E8 (1px)
   - ~65px altura
   - Badge preto com codigo (Courier bold 7px, branco): "LW-2201"
   - Role (9px, bold, preto)
   - Descricao (8px, #666666)

   ```
   [LW-2201] BRANDING SPECIALIST — Brand psychology, logos, visual identity
   [LW-2202] FRONTEND DEVELOPER — Websites, dApps, bots, dashboards
   [LW-2203] BACKEND ENGINEER — APIs, databases, contract integrations
   [LW-2204] MOTION DESIGNER — Promo videos, animated logos, TGS stickers
   ```

9. **Statement bold:**
   > "ClaimScan started as our internal tool. We built it because no one else did."

10. **Linha grossa preta + 3 colunas de contato:**
    | X / TWITTER | TELEGRAM | WEBSITE |
    |---|---|---|
    | @lwartss | t.me/lwarts | lwdesigns.art |

---

## PAGINA 12 — BACK COVER

**Background:** Full #0A0A0A (preto total)
**Dot grid:** pontos #141414, spacing 30px

**Layout (tudo centralizado verticalmente):**

1. **Logo grande:**
   - Quadrado branco 80x80px, border-radius ~10px
   - "CS" preto bold ~34px dentro

2. **Titulo:** "CLAIMSCAN" — 36px, bold, branco

3. **URL:** "claimscan.tech" — 14px, #CCCCCC

4. **Linha separadora** fina cinza, ~3 inches, centralizada

5. **Tagline:**
   > "Your money is out there. We find it."
   (12px, italic, #666666)

6. **Rodape:**
   - "A PRODUCT BY" — 9px, #666666
   - "LW TEAM" — 14px, bold, branco
   - Linha fina horizontal
   - Esquerda: "V1.0 | MARCH 2026" — 8px, #666666
   - Direita: "2026 LW ARTS. All rights reserved." — 8px, #666666

---

## COPY HIGHLIGHTS / FRASES-CHAVE

Essas sao as frases de maior impacto usadas no documento. Garantir destaque visual:

1. **"Stop leaving money on the table."** — Capa
2. **"10 platforms. 2 chains. One search."** — Capa
3. **"Your money is already out there. ClaimScan finds it."** — Intro
4. **"10 platforms. 2 chains. Zero excuses."** — Intro
5. **"No tool connects the dots. Until now."** — Problem
6. **"THE RESULT: MILLIONS IN UNCLAIMED CREATOR FEES ACROSS DEFI"** — Problem callout
7. **"Type your @handle. That's it."** — Solution
8. **"Free. Not freemium. Not 'free trial'. Free."** — Solution
9. **"We never touch your wallet. We never store your data. By design."** — Security
10. **"Your privacy is not a feature — it's the default."** — Security
11. **"This is V1. We're just getting started."** — Roadmap
12. **"ClaimScan started as our internal tool. We built it because no one else did."** — Team
13. **"Your money is out there. We find it."** — Back Cover

---

## LOGICA DE DESIGN / PRINCIPIOS

1. **Alternancia de contraste** — Paginas alternam entre backgrounds brancos e pretos (capa preta, TOC branca, intro branca, problem branca, solution branca, how it works branca, platforms branca, architecture branca, SECURITY PRETA, roadmap branca, team branca, back cover preta). Isso cria ritmo visual.

2. **Hierarquia de informacao** — Section number (micro) > Titulo (macro) > Regua grossa > Conteudo. Consistente em TODAS as paginas.

3. **Stat boxes como armas visuais** — Numeros grandes em boxes pretos/brancos criam impacto imediato. Usados na intro (6 stats) e team (2 stats).

4. **Cards com acento lateral** — Barra vertical preta de 3-4px na esquerda para citacoes e pain points. Cria peso visual e direciona o olhar.

5. **Steps com timeline** — Circulos numerados conectados por linhas pontilhadas criam senso de progressao (pagina How It Works).

6. **Platform colors sao excepcao** — O documento inteiro e monocromatico EXCETO os dots de cor na pagina de plataformas. Isso faz os dots explodirem visualmente.

7. **Roadmap com degradacao visual** — V1 (preto forte) > V2 (borda preta) > V3 (cinza claro). A intensidade visual diminui conforme o futuro fica mais distante.

8. **Zero decoracao desnecessaria** — Sem gradients, sem sombras, sem imagens stock. A forca vem da tipografia, contraste e whitespace.

---

## LOGOS OFICIAIS

### ClaimScan Logo
- **Arquivo:** /Users/lowellmuniz/Downloads/VKSAJHDJ.png
- **Descricao:** Monograma "CS" branco em fundo preto. O "C" e o "S" se entrelaçam com um elemento de radar/scanner circular no centro (circulos concentricos com ponteiro). Visual tecnologico e crypto-native.
- **Formato:** PNG quadrado, branco sobre preto
- **Onde usar:**
  - CAPA: grande (120px), centralizado, e o hero visual principal
  - INTRO (pag 3): pequeno (55px), canto superior direito ao lado do titulo
  - BACK COVER: grande (100px), centralizado
- **Em backgrounds pretos:** a logo se integra perfeitamente (fundo preto com CS branco)
- **Em backgrounds brancos:** usar como esta (o fundo preto da logo cria um bloco visual forte)

### LW ARTS Logo
- **Arquivo:** /Users/lowellmuniz/Downloads/LWARTSpng.png
- **Descricao:** Monograma "LW" estilizado como uma chama/flor. O "L" e o "W" se fundem em um shape organico com curvas de chama ao redor. Inclui "TM" pequeno. Visual bold e memoravel.
- **Formato:** PNG quadrado, branco sobre fundo transparente
- **Onde usar:**
  - CAPA: medio (45px), centralizado no rodape, abaixo de "A PRODUCT BY"
  - TEAM (pag 11): medio-grande (65px), canto superior direito, dentro de um circulo preto (#0A0A0A) para contraste no fundo branco
  - BACK COVER: medio (40px), centralizado abaixo de "A PRODUCT BY"
- **Em backgrounds pretos:** usar direto (branco transparente funciona perfeitamente)
- **Em backgrounds brancos:** colocar um circulo preto (#0A0A0A) por tras e reduzir o logo ~70% para caber dentro

---

## NOTAS PARA O DESIGNER

- Os logos oficiais estao nos arquivos acima — NAO usar texto "CS" ou "LW" como placeholder
- O logo ClaimScan tem um scanner/radar no centro que da identidade visual unica ao produto
- O logo LW e uma chama estilizada que representa a marca LW ARTS
- O site da ClaimScan (claimscan.tech) usa a mesma estetica: brutalist, monocromatico, Exo 2 + JetBrains Mono, dot grids, scan lines, glass morphism
- Este e V1 do whitepaper. Sera atualizado conforme o produto evolui.
- "ClaimScan e mais um produto feito da LW TEAM" — essa narrativa de studio interno deve ficar clara
