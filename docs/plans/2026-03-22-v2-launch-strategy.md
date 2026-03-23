# ClaimScan v2 Launch Strategy

*Created: 2026-03-22*

## Overview

Six releases, each with its own launch cycle. The strategy stacks -- each release builds on the audience and momentum from the previous one. Total timeline: ~14-16 weeks from dev start to Release 6 ship.

**Channels (ORB Framework):**
- **Owned:** ClaimScan site (claimscan.tech), @lwartss Twitter/X, LW ARTS Telegram (@lwarts)
- **Rented:** Crypto Twitter/X, Farcaster, Product Hunt, Reddit (r/solana, r/defi, r/CryptoCurrency)
- **Borrowed:** Launchpad teams (Bags.fm, Clanker, Pump.fun, Bankr, Zora), CT influencers, DeFi newsletter features

**Core principle:** Every release is a launch moment. Space them 2-3 weeks apart. Never ship silently.

---

## Release 1: Multi-Chain Claiming + 0.85% Fee

**Goal:** REVENUE. This is the biggest announcement -- ClaimScan goes from read-only to transactional on 4+ platforms.

**Dev estimate:** 7-10 days
**Suggested launch window:** Week 3-4 from dev start

### Pre-Launch (7-10 days before)

**Week -2: Teaser campaign**
- [ ] Twitter thread from @lwartss: "We built ClaimScan to show you what you're owed. But scanning isn't enough. Next week, you claim." -- no details, just tension
- [ ] Quote-tweet with a screenshot of the new ClaimDialog showing Pump.fun + Clanker logos, blur the numbers
- [ ] DM 10-15 active creators you've seen with large unclaimed balances: "Hey, you have $X unclaimed across Pump and Clanker. We're about to let you claim it all in one click. Want early access?"
- [ ] Reach out to Bags.fm, Clanker, and Pump.fun teams: "ClaimScan is adding claiming for your platform. Would you RT our announcement?" -- send them a draft tweet they can copy. Make it easy
- [ ] Post in LW ARTS Telegram: behind-the-scenes screenshot of the multi-chain wallet connector working

**Week -1: Build the list**
- [ ] Add a banner on claimscan.tech homepage: "Multi-chain claiming coming [date]. Pump.fun, Clanker, Bankr, Zora." with email/Telegram link
- [ ] Twitter thread: "40% of creator fees go unclaimed. Here's why:" -- educational content that naturally leads to "we're fixing this next week"
- [ ] Create a short screen recording (30-60s) showing the claim flow: search handle, see fees, click claim, wallet pops up, done. Don't publish yet -- save for launch day

**Day -1: Final prep**
- [ ] Schedule launch tweet for optimal CT hours (10-11am EST, when US + EU crypto twitter overlap)
- [ ] Prepare a thread (5-7 tweets) walking through the claim flow step by step with screenshots
- [ ] Notify the 10-15 early-access creators: "It's live tomorrow. You'll be first."
- [ ] Ensure fee disclosure is visible and ToS is updated (legal requirement from v2 design)

### Launch Day

**Morning (10am EST):**
- [ ] Publish the launch thread from @lwartss:
  - Tweet 1: "ClaimScan now lets you claim your creator fees. Pump.fun, Clanker, Bankr, Zora -- one click, any chain. No more visiting 9 different dashboards."
  - Tweet 2: Screen recording of the full claim flow
  - Tweet 3: "How it works: We build the tx, you sign it. Zero custody. Your keys never leave your wallet."
  - Tweet 4: "Free to scan, always. 0.85% fee on claims. That's how we keep the lights on."
  - Tweet 5: "Built by @lwartss. 408+ projects shipped. This is tool #409."
  - Tweet 6: Link to claimscan.tech
- [ ] Post in LW ARTS Telegram with the same screen recording
- [ ] DM the launchpad teams: "It's live. Here's the tweet if you want to RT" + link
- [ ] DM the 10-15 early creators: "Go claim. Share your flex card after."

**Afternoon:**
- [ ] Engage with every reply on the launch thread. Answer questions about security, fee structure, supported platforms
- [ ] If any launchpad team RTs, quote-tweet thanking them
- [ ] Post on Farcaster (if LW has presence there -- Clanker's community is heavy on Farcaster)

**Evening:**
- [ ] Post a "Day 1 stats" tweet: "X claims processed, $Y claimed in the first 12 hours" (only if numbers are good)
- [ ] Share on r/solana and r/defi with a non-promotional angle: "Built a free tool that shows crypto creators their unclaimed fees across 9 platforms. Just added one-click claiming."

### Post-Launch (Week +1 to +2)

- [ ] Twitter: Share individual creator success stories (with permission). "Creator X just discovered $2,400 unclaimed on Pump.fun. Claimed in 30 seconds."
- [ ] Reach out to 3-5 CT accounts with 10K-50K followers who are active in memecoin/DeFi space. Offer them early look, no payment needed -- the product sells itself if they have unclaimed fees
- [ ] Monitor fee_skipped rate. If above 20%, investigate and fix before it becomes a talking point
- [ ] Track treasury wallet balances daily. First revenue milestone tweet: "ClaimScan processed its first $X in claims this week"
- [ ] Collect feedback from early claimers. Any UX friction? Chain detection issues? Fix within 48h

**Metrics to track:**
- Claims per day (total + per platform)
- Fee revenue collected vs fee_skipped
- New unique visitors from launch
- Conversion: scan -> claim attempt -> claim completed

---

## Release 2: Leaderboard + Flex Cards

**Goal:** GROWTH. Viral mechanics. People share rankings and flex cards on CT = free distribution.

**Dev estimate:** 2-3 days
**Suggested launch window:** Week 5-6 (2 weeks after Release 1 stabilizes)

### Pre-Launch (5-7 days before)

- [ ] Seed the narrative on Twitter: "Who's the top earning creator on Pump.fun? On Clanker? We have the data..." -- don't answer yet
- [ ] DM 5 creators who you know are in the top 10. "You're about to be on a very exclusive list. Leaderboard drops [date]."
- [ ] Create 2-3 sample flex cards with real (anonymized) data. Post one as a teaser: "New flex cards dropping soon. Your earnings, your rank, your proof."
- [ ] Reach out to CT influencers who cover memecoins: "We're launching a public ranking of top earning creators. Your followers will want to check their rank."

### Launch Day

- [ ] Launch tweet: "ClaimScan Leaderboard is live. See who's earning the most across 9 launchpads. Check your rank: claimscan.tech/leaderboard"
- [ ] Second tweet: Show a flex card for a top-10 creator (with permission). "Top 10 creator badge unlocked. Share yours."
- [ ] DM the top-10 creators: "You made the leaderboard. Here's your flex card -- share it."
- [ ] The top creators sharing their flex cards IS the marketing. Each shared card = free impressions with a link back to ClaimScan

### Post-Launch (Week +1)

- [ ] Weekly "leaderboard movers" tweet: "Biggest climbers this week on the ClaimScan leaderboard" -- creates recurring content
- [ ] Add "Share your rank" CTA on the leaderboard page itself
- [ ] Monitor opt-out rate. If significant, the feature is working (people care enough to manage their presence)
- [ ] Pitch DeFi newsletters: "We track creator earnings across 9 launchpads. Here's what the data shows" -- use leaderboard data for a data-driven article angle

**Metrics to track:**
- Flex card shares per day (track via OG image generation hits)
- Leaderboard page views
- New visitors from flex card referrals
- Opt-out rate

---

## Release 3: Watchlist + Push Notifications

**Goal:** RETENTION. Bring users back without them having to remember to check.

**Dev estimate:** 4-5 days
**Suggested launch window:** Week 8-9

### Pre-Launch (5-7 days before)

- [ ] Tweet: "How many times have you forgotten to check your unclaimed fees? What if ClaimScan just told you when it's time to claim?"
- [ ] Telegram post: "Push notifications coming to ClaimScan. No account needed, no email, no app. Just a browser notification when your watched creators have fees ready."
- [ ] Reach out to Bags.fm and Clanker teams again: "Our users can now watch creators and get notified. Would make sense for your community to know about this."

### Launch Day

- [ ] Launch tweet: "Never miss unclaimed fees again. ClaimScan Watchlist: watch any creator, set a threshold, get a push notification when it's time to claim. No account. No email. Just your browser."
- [ ] Screen recording: watch a creator, set threshold to $50, get notification, click, claim
- [ ] Emphasize the no-account angle: "Zero signup. Zero email. Zero tracking. Just notifications that save you money."

### Post-Launch (Week +1 to +2)

- [ ] Tweet notification stats (anonymized): "ClaimScan sent X notifications this week. $Y in fees claimed from notifications alone."
- [ ] Iterate on notification timing based on user behavior. Are people claiming immediately after notification? Or ignoring?
- [ ] Add "Watch this creator" CTA on every creator profile page (prominent placement)
- [ ] Consider: Telegram bot announcement here (@ClaimScanBot from backlog). Natural timing since both are notification/retention features. If built, launch as a "bonus" alongside watchlist

**Metrics to track:**
- Push subscription count
- Notification -> claim conversion rate
- Watchlist size per user (average)
- Return visitor rate (before vs after watchlist launch)

---

## Release 4: Dashboard with History

**Goal:** DEPTH. Transform ClaimScan from a one-time scanner to a daily check-in tool.

**Dev estimate:** 5-7 days
**Suggested launch window:** Week 11-12

### Pre-Launch (5-7 days before)

- [ ] Tweet a teaser chart (blurred or sample data): "Your earnings over time. Platform breakdown. Claim history. The ClaimScan Dashboard is coming."
- [ ] Post a poll on Twitter: "How do you track your creator earnings? A) Spreadsheet B) I don't C) I check each platform manually D) What earnings?" -- engagement bait that highlights the problem
- [ ] DM power users (people who've claimed multiple times): "You're getting early access to the new dashboard. Your data is already there."

### Launch Day

- [ ] Launch tweet: "ClaimScan Dashboard: Your earnings timeline, platform breakdown, claim history. See your big picture across 9 launchpads."
- [ ] Screenshots of a real dashboard (with permission or anonymized): earnings chart, platform donut, period comparison
- [ ] Thread on what the data reveals: "We analyzed earnings across X creators. Here's what we found:" -- use aggregate data as content marketing
  - Average earnings by platform
  - Fastest growing platform
  - Claim rate trends

### Post-Launch (Week +1 to +2)

- [ ] "This week vs last week" comparison feature highlighted in a follow-up tweet
- [ ] Reach out to DeFi data / analytics accounts on CT. "ClaimScan now tracks historical earnings. If you cover creator economics, we have interesting data."
- [ ] Consider a monthly "State of Creator Fees" data report using dashboard aggregate data. Positions ClaimScan as the authority on creator fee data

**Metrics to track:**
- Dashboard page views per unique user (frequency)
- Session duration on dashboard pages
- Chart interaction rate
- Return visit frequency

---

## Release 5: Embeddable Widget

**Goal:** ECOSYSTEM. Turn every project website into a ClaimScan distribution channel.

**Dev estimate:** 5-6 days
**Suggested launch window:** Week 13-14

### Pre-Launch (7-10 days before)

- [ ] Direct outreach is king here. Email/DM 20-30 token projects: "Want to show your community their unclaimed fees right on your site? We built a widget. 2 lines of code."
- [ ] Build a demo page showing all 3 widget variants (compact, full, banner) on a mock project site
- [ ] Tweet: "What if every token project could show unclaimed fees right on their site? We're about to make that happen."
- [ ] Reach out to launchpad teams AGAIN: "We built an embeddable widget. Your users can see fees without leaving your site. Powered by ClaimScan. Free. Would you consider embedding it or recommending it to your ecosystem?"
- [ ] **Product Hunt prep starts here.** This is the best release for PH because:
  - It's developer-facing (PH audience loves dev tools)
  - It has a clear "aha" moment (paste 2 lines, see widget)
  - It builds on 4 previous releases worth of social proof
  - Ship the /developers page with code snippets, live preview, and documentation

### Launch Day

- [ ] **Product Hunt launch.** Listing details:
  - Tagline: "Show unclaimed crypto creator fees on any website"
  - First comment: explain what ClaimScan does, why the widget matters, and link to the developer page
  - Visuals: GIF showing widget embed in action, screenshot of all 3 variants
  - Maker available all day to respond to every comment
- [ ] Simultaneous Twitter thread: "ClaimScan is now embeddable. 2 lines of code. Any website. claimscan.tech/developers"
- [ ] Post on r/solana, r/defi, r/webdev: "We built an embeddable widget that shows crypto creator fees on any site"
- [ ] Notify all projects you reached out to pre-launch: "It's live. Here's your snippet."

### Post-Launch (Week +1 to +3)

- [ ] Follow up with every Product Hunt commenter. Convert interest to actual embeds
- [ ] Track which domains embed the widget. Reach out to thank them and offer support
- [ ] Tweet each new embed: "@ProjectX just added ClaimScan to their site. Creators can now see fees without leaving."
- [ ] Build a "Wall of Sites" section on /developers showing who's using the widget. Social proof for more embeds
- [ ] Pitch to crypto media: "X projects now show creator fees via ClaimScan widget" -- only when numbers are meaningful

**Metrics to track:**
- Widget embed count (unique domains)
- Widget impressions and click-through rate
- Product Hunt ranking and traffic
- New users from widget referrals
- Developer page visits

---

## Release 6: Auto-Claim

**Goal:** PREMIUM. The "set it and forget it" feature that completes the product vision.

**Dev estimate:** 7-10 days + security audit
**Suggested launch window:** Week 16+ (depends on security audit timeline)

### Pre-Launch (2-3 weeks before -- longer due to security sensitivity)

- [ ] **Security audit announcement tweet:** "Auto-claim is coming to ClaimScan. Before we ship it, we're getting an independent security audit. Your funds, your rules, our responsibility." -- builds trust
- [ ] Educational thread: "How auto-claim works: you set rules, we execute when conditions are met. You can revoke anytime. Here's the technical breakdown:" -- explain delegation, caps, expiration
- [ ] DM top 20 power users (most claims, highest volume): "We're building auto-claim. Want to be in the first cohort? We'll set you up 1-on-1."
- [ ] Reach out to security-focused CT accounts: "We just completed a security audit for our auto-claim feature. Would you be interested in reviewing the findings?"
- [ ] Telegram: weekly "building in public" updates about auto-claim progress. Show the onboarding wizard, the rules engine, the revocation flow

### Launch Day

- [ ] Launch tweet: "ClaimScan Auto-Claim: Set your rules. We handle the rest. Claim your fees automatically when they hit your threshold. Security audited. Revoke anytime."
- [ ] Thread:
  1. How it works (rules engine)
  2. Security model (delegation with caps + expiration)
  3. Audit results summary
  4. Screen recording of the onboarding wizard
  5. "Your money, your rules. We just save you the clicks."
- [ ] Pin the security audit summary on the ClaimScan site
- [ ] Email/DM every power user: "Auto-claim is live. Set it up in 60 seconds."

### Post-Launch (Week +1 to +3)

- [ ] Stats tweet: "Auto-claim executed X claims this week. $Y automatically sent to creators. Zero manual effort."
- [ ] Case study tweet: "Creator X set auto-claim to $100 threshold. Claimed $Z automatically across 3 platforms this month."
- [ ] Monitor auto-claim failure rate obsessively. Any failure is a trust-breaking moment. Fix within hours, not days
- [ ] Consider: "State of Creator Fees - Q2 2026" report using all the data accumulated across releases. Position as THE authority on creator fee data in crypto

**Metrics to track:**
- Auto-claim rules created
- Auto-claim execution success rate (target: 99%+)
- Fee revenue from auto-claims vs manual claims
- Revocation rate (high = trust problem)
- Creator retention (auto-claim users vs non-auto-claim)

---

## Cross-Release Strategy

### Partnership Playbook

Maintain ongoing relationships with launchpad teams. Each release is a reason to reach out:

| Team | Release 1 | Release 2 | Release 3 | Release 5 | Release 6 |
|------|-----------|-----------|-----------|-----------|-----------|
| Bags.fm | "Claiming live for your platform" | "Your top creators on the leaderboard" | "Your users get fee notifications" | "Embed widget on bags.fm" | "Auto-claim for Bags creators" |
| Clanker | "Claiming live for Clanker" | Same | Same | Same | Same |
| Pump.fun | "Pump.fun claiming live" | Same | Same | Same | Same |
| Bankr | "Bankr claiming live" | Same | Same | Same | Same |

Each touchpoint reinforces ClaimScan as infrastructure, not competition.

### Content Calendar (recurring)

| Cadence | Content | Channel |
|---------|---------|---------|
| Daily | Engage with CT mentions, reply to relevant fee/earnings discussions | Twitter |
| Weekly | "Leaderboard movers" update (post Release 2) | Twitter |
| Bi-weekly | Data insight from ClaimScan data ("X% of fees on Pump.fun go unclaimed") | Twitter + Farcaster |
| Monthly | "State of Creator Fees" snapshot | Twitter thread + blog post on site |
| Per-release | Full launch cycle (pre + launch + post) | All channels |

### Influencer/KOL Strategy

**Tier 1 (5K-20K followers, crypto-native):**
- Don't pay them. Find creators with unclaimed fees and show them ClaimScan
- "You have $X unclaimed. Here's how to get it." -- the product IS the pitch
- Target: 5-10 per release

**Tier 2 (20K-100K followers, DeFi/memecoin focused):**
- Offer early access to new features
- Provide data exclusives ("You're first to see this leaderboard data")
- Target: 2-3 per release

**Tier 3 (100K+ followers):**
- Only approach when you have a compelling data story or they have significant unclaimed fees
- Never pay for posts. Authenticity matters in crypto
- Target: 1 per major release (1, 5, or 6)

### LW ARTS Cross-Promotion

ClaimScan IS a portfolio piece for LW ARTS. Use it:
- Add "Built by LW ARTS" footer link with UTM tracking (`?ref=claimscan`)
- Every ClaimScan launch tweet gets a quote-tweet from @lwartss: "This is what we build at LW ARTS. Need a tool? DM us."
- Track inbound leads that come from ClaimScan exposure

---

## Timeline Summary

```
Week 1-2:   Release 1 development
Week 3:     Release 1 pre-launch teasers
Week 4:     RELEASE 1 LAUNCH (Multi-Chain Claiming)
Week 5:     Release 1 post-launch + Release 2 dev
Week 6:     RELEASE 2 LAUNCH (Leaderboard + Flex Cards)
Week 7:     Release 2 post-launch + Release 3 dev
Week 8-9:   RELEASE 3 LAUNCH (Watchlist + Notifications)
Week 10:    Release 3 post-launch + Release 4 dev
Week 11-12: RELEASE 4 LAUNCH (Dashboard + History)
Week 13:    Release 5 dev + Product Hunt prep
Week 14:    RELEASE 5 LAUNCH (Widget) + PRODUCT HUNT
Week 15:    Release 5 post-launch + Release 6 dev + security audit
Week 16+:   RELEASE 6 LAUNCH (Auto-Claim) -- after audit clears
```

**Pace:** One launch every ~2 weeks. Fast enough to maintain momentum, slow enough to execute well.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claim failure on launch day (Release 1) | Test on devnet/testnet with 5+ wallets before mainnet. Have rollback ready. Feature flag to disable claiming per-platform |
| Low leaderboard engagement (Release 2) | Seed it by DMing top creators directly. Their shares kickstart the flywheel |
| Push notification permission denied (Release 3) | Contextual prompt ("Get notified when @handle has fees") converts better than generic. Never prompt on first visit |
| Product Hunt flop (Release 5) | PH is a bonus, not the strategy. The widget's value is in direct outreach to projects. PH traffic is gravy |
| Auto-claim security incident (Release 6) | External audit is non-negotiable. Launch to small cohort first. Kill switch via env var. Over-communicate security model |
| Launch fatigue (audience tunes out) | Each release solves a different problem. Vary the content format (threads, recordings, data, stories). Never repeat the same angle |

---

## Measurement: What Success Looks Like

| Release | 30-Day Success Signal |
|---------|----------------------|
| 1. Multi-Chain Claiming | 100+ claims processed, $X fee revenue, <5% failure rate |
| 2. Leaderboard | 50+ flex cards shared on Twitter, leaderboard page in top 3 most visited |
| 3. Watchlist | 200+ push subscriptions, 30%+ notification-to-claim conversion |
| 4. Dashboard | 40%+ of returning users visit dashboard, session duration increases 2x |
| 5. Widget | 10+ domains embed the widget, Product Hunt top-10 of the day |
| 6. Auto-Claim | 50+ active auto-claim rules, 99%+ execution success rate |

Adjust these numbers based on actual traction from Release 1. If Release 1 does 500+ claims in 30 days, scale expectations up across the board.
