# NeuralCut.AI — Generation Credit Architecture
## Canonical reference document · All pricing, permissions, and credit costs

---

## THE CORE PROBLEM THIS SOLVES

"Unlimited videos" is financially untenable with premium AI providers:
- A 4-minute video using Kling 3.0 1080p + audio costs ~$40 in API costs alone
- A heavy user making 20 premium videos/month costs ~$975 — more than 5× the Studio plan
- Light users (short social clips, standard providers) cost ~$13/month — very profitable

**Solution: Generation Credits (GC)** — the industry standard used by Runway, Pika, and Kling.
- 100 GC = $10 of AI generation at cost
- Every generation action costs a defined number of GC based on provider + quality
- Each subscription plan includes a monthly GC budget
- Heavy users buy top-up credit packs or upgrade to Enterprise
- 60–66% gross margin target at plan level

---

## SUBSCRIPTION PLANS

### Plan 1: Starter — $59/month (was $79)
```
Monthly GC budget:      200 GC  (~$20 of AI generation at cost)
Annual price:           $49/mo (billed $588/yr — saves $120)
Free trial:             14 days, no credit card
Overage rate:           $0.12 per GC
Provider access:        Standard tier only
Max resolution:         720p
Max clip duration:      5 seconds
ElevenLabs voices:      Basic voices only (OpenAI TTS included)
Remotion rendering:     Included (720p cap)
Brand workspaces:       1
Team seats:             1 (solo)
API access:             No
Support:                Email, 48h response
```

Target user: Solo creators, hobbyists, small businesses doing short social content.
Typical usage: 15–20 short social clips/month. Rarely hits credit ceiling.

---

### Plan 2: Growth — $149/month (was $179) ← SWEET SPOT
```
Monthly GC budget:      500 GC  (~$50 of AI generation at cost)
Annual price:           $124/mo (billed $1,488/yr — saves $300)
Free trial:             14 days, no credit card
Overage rate:           $0.10 per GC
Provider access:        Standard + Premium tier
Max resolution:         1080p (standard providers), 720p (premium providers)
Max clip duration:      10 seconds
ElevenLabs voices:      All voices including premium
Remotion rendering:     Included (1080p)
Brand workspaces:       2
Team seats:             3
API access:             No
Support:                Email + chat, 24h response
Credit rollover:        25% of unused GC rolls to next month (max 125 GC)
```

Target user: SMB marketing teams, active content creators, agencies producing regular content.
Typical usage: 15–20 medium videos/month. Hits ceiling only with premium providers.

---

### Plan 3: Studio — $299/month (was $349)
```
Monthly GC budget:      1,200 GC  (~$120 of AI generation at cost)
Annual price:           $249/mo (billed $2,988/yr — saves $600)
Free trial:             14 days, no credit card
Overage rate:           $0.085 per GC (volume rate)
Provider access:        ALL providers including Top-tier (Veo3 full, Seedance 1080p, Sora 2 Pro)
Max resolution:         4K / unlimited
Max clip duration:      10 seconds
ElevenLabs voices:      All voices, priority rendering
Remotion rendering:     Included (4K)
Brand workspaces:       5
Team seats:             10
API access:             Yes (rate limited)
Support:                Priority email + chat, 4h response
Credit rollover:        50% of unused GC rolls (max 600 GC)
White-label option:     Available (+$99/mo addon)
```

Target user: Agencies, multi-brand companies, power users, resellers.
Typical usage: 15–25 premium videos/month with headroom for experimentation.

---

### Plan 4: Enterprise — Custom pricing
```
Monthly GC budget:      Negotiated (minimum 3,000 GC / $500/mo)
Commitment:             Monthly or annual
Overage rate:           $0.07 per GC (best rate)
Provider access:        ALL + early access to new providers
Dedicated infrastructure: Optional
Brand workspaces:       Unlimited
Team seats:             Unlimited
API access:             Full, high rate limits
SLA:                    99.9% uptime guarantee
Support:                Dedicated account manager, phone
Custom integrations:    Motif Foundry builds available
White-label:            Included
```

Target user: Production studios, enterprise marketing teams, SaaS resellers.

---

## CREDIT TOP-UP PACKS (available to all plans)

```
Pack 100 GC:    $11.00  ($0.11/GC)
Pack 250 GC:    $25.00  ($0.10/GC)
Pack 500 GC:    $45.00  ($0.09/GC)
Pack 1,000 GC:  $80.00  ($0.08/GC)
Pack 2,500 GC:  $175.00 ($0.07/GC)
```

Top-up credits never expire. Subscription credits reset monthly.
Top-up credits are consumed AFTER monthly subscription credits.

---

## GENERATION CREDIT COSTS BY PROVIDER

### Standard Tier (available on all plans)

| Provider | Quality | Duration | GC Cost | AI Cost | Margin |
|----------|---------|---------|---------|---------|--------|
| Kling 2.5/2.6 | std | 5s | 3 GC | $0.20 | ~33% |
| Kling 2.5/2.6 | std | 10s | 5 GC | $0.40 | ~20% |
| Hailuo 2.3 | 768p | 6s | 3 GC | $0.23 | ~23% |
| Hailuo 2.3 | 768p | 10s | 5 GC | $0.45 | ~10% |
| Hunyuan fast | 480p | 5s | 1 GC | $0.03 | ~70% |
| Frame Pack | any | per 5s | 2 GC | $0.15 | ~25% |
| Wan 2.6 | 720p | 5s | 4 GC | $0.40 | 0% |
| WANX 14b | std | per gen | 3 GC | $0.28 | ~7% |
| LTX Video | std | 5s | 2 GC | $0.18 | ~10% |
| Skyreels | std | per gen | 2 GC | $0.15 | ~25% |

### Premium Tier (Growth + Studio plans)

| Provider | Quality | Duration | GC Cost | AI Cost | Margin |
|----------|---------|---------|---------|---------|--------|
| Kling 2.5/2.6 | pro | 5s | 4 GC | $0.33 | ~18% |
| Kling 2.5/2.6 | pro | 10s | 7 GC | $0.46 | ~34% |
| Kling 3.0 | 720p no audio | 5s | 5 GC | $0.50 | 0% |
| Kling 3.0 | 720p + audio | 5s | 8 GC | $0.75 | ~7% |
| Kling 3.0 | 1080p no audio | 5s | 9 GC | $0.75 | ~17% |
| Kling 3.0 | 1080p + audio | 5s | 12 GC | $1.00 | ~17% |
| Veo3 fast | no audio | 5s | 4 GC | $0.30 | ~25% |
| Veo3 fast | + audio | 5s | 6 GC | $0.45 | ~25% |
| Wan 2.6 | 1080p | 5s | 7 GC | $0.60 | ~14% |
| Seedance 2 | 480p | 5s | 6 GC | $0.50 | ~17% |
| Seedance 2 fast | 480p | 5s | 5 GC | $0.40 | ~20% |
| Seedance 2 fast | 720p | 5s | 9 GC | $0.80 | ~11% |
| Sora 2 | 720p | per 5s | 5 GC | $0.40 | ~20% |
| Hailuo 2.3 | 1080p | 6s | 5 GC | $0.40 | ~20% |

### Top-tier (Studio + Enterprise only)

| Provider | Quality | Duration | GC Cost | AI Cost | Margin |
|----------|---------|---------|---------|---------|--------|
| Veo3 full | no audio | 5s | 7 GC | $0.60 | ~14% |
| Veo3 full | + audio | 5s | 14 GC | $1.20 | ~14% |
| Seedance 2 | 720p | 5s | 12 GC | $1.00 | ~17% |
| Seedance 2 | 1080p | 5s | 30 GC | $2.50 | ~17% |
| Seedance 2 fast | 720p (vip) | 5s | 10 GC | $0.80 | ~20% |
| Sora 2 Pro | 1080p | 5s | 18 GC | $1.50 | ~17% |
| Kling Omni | 1080p | 5s | 7 GC | $0.52 | ~26% |
| Kling 3.0 Omni | 1080p + audio | per 5s | 12 GC | $1.00 | ~17% |
| Kling 3.0 | Turbo 5s | per gen | 4 GC | $0.28 | ~30% |
| OmniHuman 1.5 | per sec | per sec | 2 GC | $0.13 | ~35% |

### Non-video services (all plans where applicable)

| Service | Unit | GC Cost | AI Cost |
|---------|------|---------|---------|
| Image generation (T2I) Flux/Recraft | per image | 2 GC | $0.015 |
| Image generation Nano Banana 2 (4K) | per image | 2 GC | $0.12 |
| Image-to-image (style transfer) | per image | 2 GC | $0.025 |
| Face swap (image) | per swap | 1 GC | $0.01 |
| Face swap (video) | per 100 frames | 5 GC | $0.40 |
| 4K upscale | per minute | 3 GC | $0.24 |
| Background removal | per image | 1 GC | $0.01 |
| Video watermark removal | per 10s | 1 GC | $0.08 |
| ElevenLabs TTS | per minute audio | 2 GC | included in plan |
| OpenAI TTS | per 1k chars | 1 GC | included in plan |
| AI music generation | per track | 1 GC | $0.02 |
| Script generation (LLM) | per script | 2 GC | ~$0.05 |
| Claude Vision QA | per scene review | 1 GC | ~$0.01 |
| Remotion render | per minute of video | 2 GC | ~$0.10 |
| Kling effects (std) | per effect | 3 GC | $0.26 |
| Kling effects (pro) | per effect | 5 GC | $0.46 |

---

## CREDIT CONSUMPTION EXAMPLE: A 4-MINUTE EXPLAINER VIDEO

Using Growth plan, Kling 3.0 720p + audio, 30% regen rate:

```
24 clips × 5s each = 120s of final video
+ 30% regens = 31 total clip generations

31 clips × 8 GC (Kling 3.0 720p + audio) = 248 GC
Voice generation (4-min script):              8 GC
Script writing (LLM):                         2 GC
Remotion render (4 min):                      8 GC
Claude Vision QA (24 scenes):                 24 GC
─────────────────────────────────────────────────
TOTAL:                                       ~290 GC

At 500 GC/month (Growth plan):
→ User can make ~1.7 videos like this per month on base credits
→ Additional overage at $0.10/GC = $29 per additional video
→ Or upgrade to Studio (1,200 GC) → ~4 videos/month
```

This is transparent, honest, and predictable. Users know exactly what to budget.

---

## CREDIT CONSUMPTION EXAMPLE: SOCIAL CONTENT (short clips)

Using Growth plan, Kling 2.5 std, 15% regen rate:

```
20 videos × 3 clips = 60 base clips
+ 15% regens = 69 total clips

69 clips × 3 GC (Kling std 5s) = 207 GC
Voice generation (30s × 20):               20 GC
Script writing × 20:                        40 GC
Remotion render (10 min total):             20 GC
QA (60 scenes):                             60 GC
─────────────────────────────────────────────────
TOTAL:                                     ~347 GC

At 500 GC/month (Growth plan):
→ Has 153 GC remaining for additional content
→ Comfortable buffer for experimentation
→ No overage charges for typical social creators
```

---

## CREDIT DISPLAY FORMAT (UI reference)

```
Credit balance display:
  Current balance:  347 GC  ████████░░░░░░  (69% used — 153 remaining)
  Monthly budget:   500 GC
  Resets:           June 15, 2025 (in 12 days)
  Top-up credits:   0 GC

Warning states:
  > 80% used (400+ GC):  Yellow warning pill: "80 GC remaining"
  > 95% used (475+ GC):  Orange urgent: "25 GC remaining · Top up or upgrade"
  = 0 GC remaining:      Red block: "No credits · Generations paused · Add credits or upgrade"

Credit cost preview (before generation):
  "This generation will use ~8 GC  (Kling 3.0 720p + audio)"
  "You have 347 GC remaining this month"
```

---

## DATABASE SCHEMA (Prisma/PostgreSQL)

```prisma
model Subscription {
  id              String   @id @default(cuid())
  userId          String   @unique
  plan            PlanTier
  status          SubStatus
  monthlyGC       Int      // GC budget per billing cycle
  currentGC       Int      // current remaining GC
  rolloverGC      Int      @default(0) // accumulated rollover
  topupGC         Int      @default(0) // never-expiring top-up credits
  billingCycleStart DateTime
  billingCycleEnd   DateTime
  stripeCustomerId  String?
  stripeSubId       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id])
}

enum PlanTier {
  STARTER
  GROWTH
  STUDIO
  ENTERPRISE
  FREE_TRIAL
}

enum SubStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
  PAUSED
}

model CreditTransaction {
  id            String   @id @default(cuid())
  userId        String
  type          TxType
  gcAmount      Int      // negative = consumed, positive = added
  gcBalance     Int      // balance after transaction
  provider      String?  // e.g. "kling-3.0"
  quality       String?  // e.g. "1080p-audio"
  durationS     Int?     // clip duration in seconds
  jobId         String?  // link to generation job
  description   String?
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
}

enum TxType {
  MONTHLY_RESET    // plan credits loaded
  GENERATION       // AI generation consumed
  REGEN            // regeneration consumed
  TOPUP_PURCHASE   // user bought top-up pack
  ROLLOVER         // unused credits rolled forward
  REFUND           // failed generation refunded
  ADMIN_GRANT      // manual grant
}

model GenerationCreditRate {
  id          String  @id @default(cuid())
  provider    String  // "kling-3.0"
  quality     String  // "720p-audio"
  durationS   Int     // 5 or 10
  gcCost      Int     // credits charged
  apiCostUSD  Decimal // actual API cost for internal tracking
  planTier    PlanTier[] // which plans can access
  isActive    Boolean @default(true)
  updatedAt   DateTime @updatedAt
}
```

---

## API ENDPOINTS NEEDED

```
POST   /api/credits/check           → check if user has enough GC for a generation
POST   /api/credits/consume         → deduct GC after successful generation
POST   /api/credits/refund          → restore GC if generation failed
GET    /api/credits/balance         → current GC balance + usage stats
GET    /api/credits/transactions    → paginated transaction history
POST   /api/credits/topup           → purchase top-up pack (Stripe)
GET    /api/credits/rates           → list all provider credit costs
POST   /api/subscriptions/upgrade   → upgrade plan (Stripe)
POST   /api/subscriptions/downgrade → downgrade plan
GET    /api/subscriptions/current   → current plan details
POST   /api/billing/webhook         → Stripe webhook handler
```

---

## PROVIDER PERMISSION MATRIX

```typescript
const PROVIDER_PERMISSIONS = {
  STARTER: [
    'kling-2.5-std', 'kling-2.6-std',
    'hailuo-2.3-768p',
    'hunyuan-fast',
    'frame-pack',
    'wan-2.6-720p',
    'ltx-video',
    'skyreels',
    'wanx-1.3b',
  ],
  GROWTH: [
    ...STARTER,
    'kling-2.5-pro', 'kling-2.6-pro',
    'kling-3.0-720p', 'kling-3.0-1080p',
    'veo3-fast',
    'wan-2.6-1080p',
    'seedance-2-480p', 'seedance-2-fast-480p',
    'seedance-2-fast-720p',
    'sora-2-720p',
    'hailuo-2.3-1080p',
    'wanx-14b',
  ],
  STUDIO: [
    ...GROWTH,
    'veo3-full',
    'seedance-2-720p', 'seedance-2-1080p',
    'sora-2-pro',
    'kling-omni-1080p',
    'kling-3.0-omni',
    'kling-3.0-turbo',
    'omnihuman-1.5',
  ],
  ENTERPRISE: [
    ...STUDIO,
    // + any new providers in beta
  ],
}
```

