# ClaimScan Design Specification

> Extracted from `Claimscan.pen` design file. This is the single source of truth for UI implementation.
> Reference PNGs at `design-reference/*.png` (all @2x scale).

---

## Design Tokens (CSS Variables)

### Colors
```css
:root {
  --bg-primary: #0B0B0E;
  --bg-card: #151518CC;        /* 80% opacity */
  --bg-input: #101013;
  --bg-surface: #1A1A1D99;     /* 60% opacity */
  --bg-surface-hover: #202023CC; /* 80% opacity */
  --bg-secondary: #131316E6;   /* 90% opacity */

  --text-primary: #F5F5F7;
  --text-secondary: #A1A1AA;
  --text-tertiary: #71717A;
  --text-inverse: #0A0A0F;

  --accent-primary: #FFFFFF;
  --accent-secondary: #FFFFFF;
  --accent-glow: #FFFFFF14;    /* 8% opacity */

  --border-subtle: #FFFFFF10;  /* 6% opacity */
  --border-default: #FFFFFF18; /* 9% opacity */
  --border-accent: #FFFFFF26;  /* 15% opacity */

  --success: #34D399;
  --warning: #FBBF24;
  --error: #F87171;
  --partial: #FB923C;
}
```

### Typography
```css
:root {
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  --font-size-3xl: 48px;
  --font-size-4xl: 64px;
}
```

**Font Families:**
- **Primary:** `Inter` - used for all body text, labels, buttons
- **Monospace:** `Geist Mono` - used for numbers, stats, crypto values, table data

### Spacing
```css
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  --spacing-3xl: 64px;
  --spacing-4xl: 96px;
}
```

### Border Radius
```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}
```

---

## Page Structure

Desktop: 1440px max-width
Mobile: 390px

The homepage is split across two vertical sections (ND0L8 + pNLGL) that scroll as one page.

### Pages
| Page | Desktop Frame | Mobile Frame | Route |
|------|---------------|--------------|-------|
| Homepage | ND0L8 + pNLGL | jHXkt | `/` |
| Profile | iXnoo | EXcBT | `/[handle]` |
| Leaderboard | MwTva | ctMaX | `/leaderboard` |
| Docs | 8W6zy | hm4qc | `/docs` |
| Terms & Pricing | HEGzN | bBIFd | `/terms` |

---

## Background Treatment

All pages use a dark base with subtle radial glow overlays. **Black & white monochrome only.**

### Desktop Homepage (ND0L8)
```css
background:
  /* Base gradient */
  linear-gradient(180deg, #18181B 0%, #09090B 100%),
  /* Top center glow */
  radial-gradient(100% 60% at 50% 20%, #FFFFFF10 0%, transparent 70%),
  /* Left accent */
  radial-gradient(50% 40% at 15% 50%, #FFFFFF08 0%, transparent 100%),
  /* Right accent */
  radial-gradient(40% 35% at 85% 45%, #FFFFFF06 0%, transparent 100%);
```

### Desktop Homepage Bottom (pNLGL)
```css
background:
  linear-gradient(180deg, #151517 0%, #09090B 100%),
  radial-gradient(100% 50% at 50% 25%, #FFFFFF0A 0%, transparent 100%),
  radial-gradient(50% 35% at 80% 60%, #FFFFFF05 0%, transparent 100%);
```

### Mobile Homepage (jHXkt)
```css
background:
  linear-gradient(180deg, #17171B 0%, #09090B 100%),
  radial-gradient(160% 12% at 50% 4%, #FFFFFF0E 0%, transparent 70%),
  radial-gradient(80% 10% at 80% 18%, #FFFFFF06 0%, transparent 100%),
  radial-gradient(100% 10% at 20% 42%, #FFFFFF04 0%, transparent 100%),
  radial-gradient(90% 8% at 70% 70%, #FFFFFF04 0%, transparent 100%);
```

---

## Shared Components

### Navbar
- **Height:** 68px
- **Padding:** 16px 48px
- **Background:** `#0B0B0E99` (60% opacity, for glass effect)
- **Border-bottom:** 1px solid `var(--border-subtle)` (#FFFFFF10)
- **Layout:** horizontal, space-between, align-center
- **Position:** sticky top

**Left side:**
- Logo icon: 28x28px, corner-radius 6px, image fill
- Logo text: "ClaimScan", Inter 20px/700, color `var(--text-primary)`
- Gap between icon and text: 10px
- Gap between logo group and nav links: 32px
- Nav links: "Leaderboard", "Docs", "API" - Inter 15px/normal, color `var(--text-secondary)`
- Gap between links: 28px

**Right side:**
- Connect Wallet button: Inter 13px/600, color `var(--text-inverse)` (#0B0B0E)
- Button bg: `var(--accent-primary)` (#FFFFFF)
- Padding: 10px 20px
- Corner-radius: `var(--radius-md)` (10px)

### Search Bar
- **Width:** 720px (desktop), full-width (mobile)
- **Padding:** 16px 20px
- **Corner-radius:** `var(--radius-lg)` (14px)
- **Background:** #0E0E12
- **Border:** 1px solid `var(--border-default)` (#FFFFFF18)
- **Shadow:** 0 4px 60px #FFFFFF06
- **Layout:** horizontal, align-center, gap 12px

**Contents:**
- Search icon: lucide `search`, 22x22px, color `var(--text-secondary)`
- Placeholder: "Search by @handle, wallet, or ENS...", Inter 15px/normal, color `var(--text-tertiary)`
- Keyboard badge (desktop only): "/" character, Geist Mono 12px/500, color `var(--text-secondary)`
  - Badge bg: #FFFFFF0A, border: 1px solid #FFFFFF18, corner-radius: 6px, padding: 5px 12px

### Footer
- **Background:** `var(--bg-secondary)` (#131316E6)
- **Border-top:** 1px solid `var(--border-default)` (#FFFFFF18)
- **Padding:** 32px 120px (desktop), 24px 20px (mobile)
- **Layout:** horizontal, space-between, align-center (desktop); vertical, center (mobile)

**Left:**
- Logo icon: 24x24px + "ClaimScan" Inter 18px/700, gap 8px
- Subtitle: "Solana · Base · Ethereum · BSC", Inter 11px/normal, `var(--text-tertiary)`

**Center (desktop) / Below logo (mobile):**
- Links: "Leaderboard", "Docs", "API", "Twitter", "Telegram", "Terms"
- Inter 13px/normal, color `var(--text-secondary)`, gap 24px

**Right (desktop) / Bottom (mobile):**
- "Built by LW ARTS", Inter 11px/normal, `var(--text-tertiary)`

---

## Homepage Sections

### 1. Hero Section
- **Padding:** 96px 48px 72px 48px
- **Layout:** vertical, center-aligned, gap 40px

**Eyebrow badge:**
- "FREE CRYPTO FEE TRACKER"
- Inter 11px/600, letter-spacing 2px, color `var(--text-secondary)`
- Badge: corner-radius 20px, bg #FFFFFF08, border 1px solid #FFFFFF12, padding 6px 16px
- Small white dot (6x6px, corner-radius 3px) before text, gap 10px

**Title (2 lines, centered):**
- Line 1: "TRACK YOUR ✦" - Inter 72px/900, letter-spacing 3px, color `var(--text-primary)`
- Line 2: "[CREATOR] REVENUE" - same style
- "[CREATOR]" has a bracket styling: Inter 72px/300 brackets + Inter 72px/900 text
- Gap between lines: 4px

**Subtitle:**
- "Paste any @handle or wallet. See what you've earned, claimed, and left on the table across 11 launchpads. Learn how it works"
- Inter 16px/normal, line-height 1.6, color `var(--text-tertiary)`, text-align center
- Max-width: 620px

**Search bar** (see shared component above)

### 2. Stats Section
- **Padding:** 16px 48px
- **Layout:** horizontal, gap 16px, 3 equal cards

**Each stat card:**
- Corner-radius: 16px
- Background: #FFFFFF06
- Border: 1px solid `var(--border-subtle)`
- Shadow: 0 2px 48px #FFFFFF05
- Padding: 32px 28px
- Layout: vertical, center-aligned, gap 8px

**Stat values:**
- Value: Geist Mono 38px/700, color `var(--text-primary)`
- Label: Inter 13px/normal, letter-spacing 0.5px, color `var(--text-secondary)`

**Data:**
| Value | Label |
|-------|-------|
| $12.4M+ | Fees Tracked |
| 84,000+ | Wallets Scanned |
| ~40% | Left Unclaimed |

### 3. Supported Platforms
- **Padding:** 48px 120px 64px 120px
- **Layout:** vertical, center-aligned, gap 24px

**Label:** "// SUPPORTED PLATFORMS", Inter 11px/600, letter-spacing 2px, color #FFFFFF

**3 rows of 5 names**, justified space-between across full width:
- Font: Inter 20px/700, color `var(--text-primary)`
- Alternating opacity: 0.5 / 0.35 pattern

| Row 1 | Row 2 | Row 3 |
|-------|-------|-------|
| Pump.fun (0.5) | Raydium (0.35) | Solana (0.5) |
| Believe (0.35) | Jupiter (0.5) | Base (0.35) |
| Virtuals (0.5) | Meteora (0.35) | Ethereum (0.5) |
| Moonshot (0.35) | Clanker (0.5) | BSC (0.35) |
| LetsBonk (0.5) | Wow (0.35) | Dexscreener (0.5) |

### 4. Multi-Chain Coverage
- **Padding:** 96px 120px (part of pNLGL top padding)
- **Layout:** vertical, center-aligned, gap 40px

**Label:** "MULTI-CHAIN COVERAGE", Inter 11px/600, letter-spacing 2px

**4 badge cards** in a horizontal row, gap 16px:
- Corner-radius: `var(--radius-md)` (10px)
- Background: `var(--bg-card)` (#151518CC)
- Border: 1px solid `var(--border-subtle)`
- Padding: 20px 24px
- Layout: horizontal, align-center, gap 16px

Each card has:
- 10x10 ellipse dot, color `var(--text-secondary)`
- Info: chain name (Inter 15px/600, `var(--text-primary)`) + description (Inter 11px/normal, `var(--text-tertiary)`)

**Chains:** Solana, Base, Ethereum, BSC

### 5. Leaderboard Preview
- **Layout:** vertical, center-aligned, gap 32px

**Label:** "TOP EARNERS", Inter 11px/600, letter-spacing 2px
**Title:** "CREATOR FEE LEADERBOARD", Inter 32px/700

**Table:**
- Corner-radius: `var(--radius-lg)` (14px)
- Background: `var(--bg-card)` (#151518CC)
- Border: 1px solid `var(--border-subtle)`
- Clip overflow

**Header row:**
- Background: `var(--bg-surface)` (#1A1A1D99)
- Padding: 12px 24px
- Columns: # (32px) | Creator (fill) | Earned (110px) | USD (90px) | Top Platform (100px)
- Font: Inter 11px/600, color `var(--text-tertiary)`

**Data rows:**
- Padding: 14px 24px
- Alternating: odd rows have `var(--bg-surface)` bg, even are transparent
- Gap between columns: 16px

**#1 row special treatment:**
- Background: #FFFFFF0A
- Left border: 2px gradient (linear, #FFFFFF20 to #FFFFFF08)
- Shadow: 0 0 24px #FFFFFF0C
- Trophy icon: lucide `trophy`, 16x16px, color #FFFFFF
- Rank: Geist Mono 18px/800
- Name: Inter 13px/700

**Regular rows:**
- Rank: Geist Mono 13px/700, color #FFFFFF
- Avatar: 28x28 ellipse, fill #A1A1AA44
- Name: Inter 13px/500, color `var(--text-primary)`
- Earned: Geist Mono 13px/600, color #FFFFFF
- USD: Geist Mono 11px/normal, color `var(--text-secondary)`
- Platform: Inter 11px/normal, color `var(--text-secondary)`, text-align right

**Leaderboard data:**
| # | Creator | Earned | USD | Platform |
|---|---------|--------|-----|----------|
| 1 | @phantom_dev | 657.4 SOL | $847,230 | pump.fun |
| 2 | @base_builder | 475.2 SOL | $612,450 | virtuals.io |
| 3 | @defi_whale | 379.8 SOL | $489,100 | friend.tech |
| 4 | @sol_maxi | 288.7 SOL | $371,880 | pump.fun |
| 5 | @nft_queen | 201.0 SOL | $258,920 | moonshot |

**"View Full Leaderboard" button:**
- Corner-radius: `var(--radius-md)` (10px)
- Background: `var(--accent-primary)` (#FFFFFF)
- Border: 1px solid `var(--border-accent)`
- Padding: 12px 24px, gap 8px
- Text: "View Full Leaderboard →", Inter 13px/600, color `var(--text-inverse)`

### 6. How It Works
- **Layout:** vertical, center-aligned

**Header:**
- "HOW IT WORKS" label: Inter 11px/600, letter-spacing 2px
- "THREE SIMPLE STEPS": Inter 28px/700
- Subtitle: Inter 15px/normal, color `var(--text-secondary)`
- Gap between items: 12px

**3 cards** in horizontal row, gap 24px, padding-top 40px:
- Corner-radius: `var(--radius-lg)` (14px)
- Background: `var(--bg-card)` (#151518CC)
- Border: 1px solid `var(--border-subtle)`
- Shadow: 0 4px 32px #FFFFFF06
- Padding: 32px
- Layout: vertical, gap 20px
- Height: 314px (all cards same height)

**Each card:**
1. Step badge: "STEP 1/2/3", Inter 11px/600, padding 4px 14px, corner-radius 20px, bg #FFFFFF10, border 1px solid #FFFFFF18
2. Icon circle: 56x56px, corner-radius 28px (full circle), bg #FFFFFF08, border 1px solid #FFFFFF12, lucide icon 24px centered
3. Title: Inter 20px/700, color `var(--text-primary)`
4. Description: Inter 14px/normal, line-height 1.6, color `var(--text-secondary)`, width fill

**Card data:**
| Step | Icon | Title | Description |
|------|------|-------|-------------|
| 1 | `search` | PASTE A HANDLE | Enter any creator @handle, wallet address, or ENS name. ClaimScan will instantly scan all 10 supported launchpads across Solana, Base, Ethereum and BSC. |
| 2 | `scan-search` | SEE YOUR FEES | Get a complete breakdown of earned, claimed and unclaimed fees. See exactly how much you have left on the table, per platform, per token. |
| 3 | `hand-coins` | CLAIM DIRECTLY | Claim your unclaimed fees directly through ClaimScan in one click. No need to visit each platform separately. Everything in one place. |

**CTA section** (below cards, padding-top 32px, center-aligned):
- "Read the Docs" button: lucide `book-open` icon 16px + "Read the Docs →"
- Inter 14px/600, color `var(--text-inverse)`, bg #FFFFFF
- Corner-radius: `var(--radius-md)`, padding 12px 24px, gap 8px

---

## Profile Page (iXnoo / EXcBT)

### Profile Hero
- **Background:** `var(--bg-secondary)` (#131316E6)
- **Border-bottom:** 1px solid `var(--border-subtle)`
- **Padding:** 32px 48px
- **Layout:** horizontal, space-between, align-center

**Left:**
- Avatar: 64x64 ellipse with gradient fill (linear 135deg, #404040 to #808080)
- Creator name: Inter 24px/700, color `var(--text-primary)`
- Wallet address: truncated, Geist Mono 13px/normal, color `var(--text-secondary)`
- Gap between avatar and info: 20px

**Right (action buttons):**
- "Save OG Card": lucide `download` 14px + text, Inter 13px/600, bg #FFFFFF, color `var(--text-inverse)`, corner-radius 8px, padding 10px 18px
- "Copy Link": lucide `link` 14px + text, Inter 13px/600, color `var(--text-primary)`, border 1px solid #FFFFFF18, corner-radius 8px, padding 10px 18px
- "Share on X": lucide `twitter` 14px + text, same style as Copy Link
- Gap between buttons: 10px

### Search Bar (in profile)
Same component as hero search bar but full width (1344px within 48px padding).

### Aggregate Stats
- **Padding:** 32px 48px
- **Layout:** horizontal, gap 16px, 4 equal cards

**Each card:**
- Corner-radius: `var(--radius-lg)` (14px)
- Background: `var(--bg-card)` (#151518CC)
- Border: 1px solid `var(--border-subtle)`
- Padding: 24px
- Layout: vertical, gap 8px

**Stats:**
| Label | Value |
|-------|-------|
| Total Unclaimed | $4,231.50 |
| Total Claimed | $12,890.00 |
| Largest Single Fee | $2,100.00 |
| Platforms with Fees | 6 of 10 |

- Label: Inter 13px/normal, `var(--text-secondary)`
- Value: Geist Mono 32px/700, `var(--text-primary)` (first card uses #FFFFFF for emphasis)

### Filter Bar
- **Padding:** 24px 48px
- **Layout:** vertical, gap 16px

**Chain tabs:**
- Row of pills: All (active), Solana, Base, ETH, BSC
- Active pill: bg #FFFFFF, text #0B0B0E, Inter 13px/600, corner-radius 6px, padding 8px 16px
- Inactive pill: bg `var(--bg-surface)`, text `var(--text-secondary)`, Inter 13px/normal

**Status filters:**
- Pills: All (active), Unclaimed, Claimed, Partial
- Active: bg `var(--bg-surface-hover)`, text `var(--text-primary)`, Inter 11px/500, border 1px solid #FFFFFF18, corner-radius 20px, padding 6px 14px
- Inactive: bg `var(--bg-surface)`, text `var(--text-secondary)`, same dimensions

**Launchpad filters:**
- Scrollable row: Bags.fm (active), Pump.fun, Believe, Virtuals, Moonshot, LetsBonk, Raydium
- Same pill style as status filters
- Divider: 1px wide, 20px tall, #FFFFFF10
- "All Filters" button: lucide `sliders-horizontal` 14px + text, Inter 11px/500, bg `var(--bg-surface)`, border 1px solid #FFFFFF10, corner-radius 6px, padding 6px 14px

### Fee Table (Desktop)
- **Padding:** 0 48px
- **Layout:** vertical, full-width

**7 columns:**
| Column | Width | Content |
|--------|-------|---------|
| TOKEN | fill | Icon (16px circle) + $TOKEN name, Inter 15px/600 |
| PLATFORM | 100px | Inter 13px/normal, `var(--text-secondary)` |
| EARNED | 110px | Geist Mono 13px/normal |
| CLAIMED | 110px | Geist Mono 13px/normal |
| UNCLAIMED | 110px | Geist Mono 13px/normal |
| USD | 90px | Geist Mono 13px/600 |
| STATUS | 110px | Badge |

**Header row:**
- Inter 11px/600, letter-spacing 1px, color `var(--text-tertiary)`
- Padding: 12px 16px
- Border-bottom: 1px solid `var(--border-subtle)`

**Data rows:**
- Padding: 14px 16px
- Alternating: odd rows bg `var(--bg-surface)`, even transparent
- Border-bottom: 1px solid `var(--border-subtle)`

**Status badges:**
- CLAIMED: bg #A1A1AA18, text `var(--text-secondary)`, Inter 11px/600, padding 4px 10px, corner-radius 4px
- PARTIAL: bg #FBBF2418, text `var(--warning)`, same dimensions, includes small dot

**Sample data:**
| Token | Platform | Earned | Claimed | Unclaimed | USD | Status |
|-------|----------|--------|---------|-----------|-----|--------|
| $ELON | Bags.fm | 57.33 SOL | 57.33 SOL | 0 SOL | $4.62K | CLAIMED |
| $BAGZ | Bags.fm | 20.01 SOL | 20.01 SOL | 0 SOL | $1.61K | CLAIMED |
| $ELON | Bags.fm | 15.80 SOL | 15.80 SOL | 0.0023 SOL | $1.27K | PARTIAL |
| $TUSK | Bags.fm | 7.30 SOL | 7.30 SOL | 0.0000 SOL | $588.57 | PARTIAL |

### Fee Cards (Mobile - EXcBT)
Each fee entry is a card instead of a table row:
- Corner-radius: `var(--radius-md)`, bg `var(--bg-card)`, border 1px solid `var(--border-subtle)`
- Padding: 16px
- Layout: vertical, gap 12px

**Card structure:**
1. Top row: Token icon (24x24 ellipse) + $TOKEN name (Inter 15px/600) + status badge (right-aligned)
2. Platform row: 8x8 green dot (#34D399) + platform name (Inter 11px/normal, `var(--text-tertiary)`)
3. Values row: EARNED label + SOL value | USD label + USD value
4. Bottom row: UNCLAIMED label + value | CLAIMED label + value

---

## Leaderboard Page (MwTva / ctMaX)

### Header Section
- **Padding:** 48px 40px
- **Layout:** vertical, gap varies

**Left-aligned (desktop):**
- Label: "LEADERBOARD", Inter 11px/600, letter-spacing 2px
- Title: "CREATOR FEE RANKINGS", Inter 32px/700
- Subtitle: description text, Inter 15px/normal, `var(--text-secondary)`

**Right-aligned filter tabs:**
- "All Time" (active), "30D", "7D" - same pill style as profile filters

### Search Bar
Full-width search bar, same component.

### Leaderboard Table (Desktop - MwTva)
**6 columns:**
| Column | Width | Align |
|--------|-------|-------|
| # (Rank) | 60px | center |
| Creator | 780px (fill) | left |
| Earned | 160px | right |
| USD | 160px | right |
| Top Platform | 120px | right |
| Action | 40px | center |

**Header row:** height 40px, bg matches surface
**Data rows:** height 60px each

**#1 row highlight:** Same special treatment as homepage leaderboard preview.

**Pagination:** Page numbers + arrows at bottom.

### Leaderboard Cards (Mobile)
Each row becomes a card with:
- Rank + Avatar + Name on left
- SOL value (primary, white, Geist Mono 15px/600) + USD (secondary, `var(--text-tertiary)`, 11px) stacked on right

---

## Mobile Adaptations (390px)

### General Rules
- All horizontal padding reduces to 20px
- Font sizes scale down ~80%: titles become 32-48px instead of 64-72px
- Cards stack vertically instead of horizontal grids
- Search bar becomes full-width
- Tables become card-based layouts
- Footer stacks vertically, center-aligned

### Mobile Navbar
- Same structure, padding 12px 20px
- Logo text: Inter 18px/700
- Hamburger menu instead of text links
- Connect wallet button: smaller padding (8px 16px)

### Mobile Stats
- 3 cards in a 1-column stack (or 2+1 grid)
- Reduced font sizes: value 28px, label 11px

### Mobile Supported Platforms
- 5 rows of 3 names instead of 3 rows of 5
- Font size: 15px instead of 20px
- Padding: 32px 20px

---

## Wallet Connect Cards

### Desktop (xH7vx) - 1440px
OG-image style card showing user's fee summary with:
- Dark background with glow
- Large stats display
- Branding elements

### Mobile (Dluwj) - 390px
Same concept, mobile-optimized layout.

---

## Icon Usage (Lucide)

| Context | Icon Name | Size |
|---------|-----------|------|
| Search bar | `search` | 22px |
| Step 1 | `search` | 24px |
| Step 2 | `scan-search` | 24px |
| Step 3 | `hand-coins` | 24px |
| Leaderboard #1 | `trophy` | 16px |
| Download OG | `download` | 14px |
| Copy link | `link` | 14px |
| Share X | `twitter` | 14px |
| Read docs | `book-open` | 16px |
| Filters | `sliders-horizontal` | 14px |
| Keyboard shortcut | - | text "/" |

---

## Implementation Notes

### Tailwind v4 Variable Mapping
Map design tokens to Tailwind CSS variables in `globals.css`:
```css
@theme {
  --color-bg-primary: #0B0B0E;
  --color-bg-card: #151518CC;
  --color-bg-input: #101013;
  --color-bg-surface: #1A1A1D99;
  --color-bg-surface-hover: #202023CC;
  --color-bg-secondary: #131316E6;
  --color-text-primary: #F5F5F7;
  --color-text-secondary: #A1A1AA;
  --color-text-tertiary: #71717A;
  --color-text-inverse: #0A0A0F;
  --color-accent-primary: #FFFFFF;
  --color-border-subtle: #FFFFFF10;
  --color-border-default: #FFFFFF18;
  --color-border-accent: #FFFFFF26;
  --color-accent-glow: #FFFFFF14;
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #F87171;
  --color-partial: #FB923C;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}
```

### Key Patterns
1. **Glass cards:** bg with alpha + 1px border-subtle + subtle shadow
2. **Section labels:** ALL CAPS, Inter 11px/600, letter-spacing 2px, #FFFFFF
3. **Monospace numbers:** Always use Geist Mono for crypto values, stats, amounts
4. **Status badges:** Small pills with semi-transparent colored backgrounds
5. **Buttons:** White bg (#FFFFFF) with dark text for primary CTAs; transparent bg with border for secondary
6. **Glow effects:** Multiple layered radial gradients on page backgrounds, very subtle (4-16% opacity white)

### Component Hierarchy (recommended build order)
1. Design tokens + globals.css
2. Navbar (shared)
3. Footer (shared)
4. SearchBar (shared)
5. Homepage: Hero → Stats → Platforms → MultiChain → LeaderboardPreview → HowItWorks
6. Profile: ProfileHero → AggregateStats → FilterBar → FeeTable/FeeCards
7. Leaderboard: Header → SearchBar → Table/Cards
8. Docs page
9. Terms page
