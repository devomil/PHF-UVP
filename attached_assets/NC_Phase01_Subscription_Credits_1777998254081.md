# NeuralCut.AI Phase NC-01 — Subscription & Credits System
## Replit Agent Implementation Instructions

---

## OVERVIEW

Implement the Generation Credits (GC) subscription and billing system for NeuralCut.AI. This is the foundational infrastructure that all other phases build on. Every AI generation in the app will flow through this credit system.

**Reference document:** `NC_Credit_Architecture.md` — canonical source of truth for all credit costs, plan limits, and pricing. Read it completely before writing any code.

---

## TECH STACK

- Existing NeuralCut.AI stack (React + Vite or Next.js — check existing codebase)
- Stripe for billing (subscriptions + one-time top-up purchases)
- PostgreSQL + Prisma for credit ledger
- Redis for real-time credit balance caching (prevents race conditions)
- TypeScript throughout

---

## DELIVERABLES FOR THIS PHASE

```
server/
├── prisma/
│   ├── schema.prisma          ← Add subscription + credit models
│   └── migrations/            ← Generated migration files
├── lib/
│   ├── credits.ts             ← Credit engine (check/consume/refund)
│   ├── stripe.ts              ← Stripe client + webhook handler
│   └── providerPermissions.ts ← Plan → provider access matrix
├── routes/
│   ├── credits.ts             ← /api/credits/* endpoints
│   ├── subscriptions.ts       ← /api/subscriptions/* endpoints
│   └── billing.ts             ← /api/billing/webhook
└── middleware/
    └── requireCredits.ts      ← Middleware to gate generation endpoints

client/src/
├── hooks/
│   └── useCredits.ts          ← React hook for credit balance + usage
├── components/
│   └── credits/
│       ├── CreditMeter.tsx    ← Balance bar + usage display
│       ├── CreditWarning.tsx  ← Warning banners at 80%/95%/0%
│       ├── TopUpModal.tsx     ← Purchase top-up credits
│       └── CreditCost.tsx     ← "This will use ~X GC" preview
└── pages/
    └── billing/
        └── index.tsx          ← Subscription management page
```

---

## STEP 1: DATABASE SCHEMA

Add to `prisma/schema.prisma`:

```prisma
enum PlanTier {
  FREE_TRIAL
  STARTER
  GROWTH
  STUDIO
  ENTERPRISE
}

enum SubStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  PAUSED
}

enum TxType {
  MONTHLY_RESET
  GENERATION
  REGEN
  TOPUP_PURCHASE
  ROLLOVER
  REFUND
  ADMIN_GRANT
}

model Subscription {
  id                  String    @id @default(cuid())
  userId              String    @unique
  plan                PlanTier  @default(FREE_TRIAL)
  status              SubStatus @default(TRIALING)
  monthlyGC           Int       @default(0)
  currentGC           Int       @default(0)
  rolloverGC          Int       @default(0)
  topupGC             Int       @default(0)
  billingCycleStart   DateTime  @default(now())
  billingCycleEnd     DateTime
  stripeCustomerId    String?
  stripeSubscriptionId String?
  trialEndsAt         DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  user                User      @relation(fields: [userId], references: [id])
  transactions        CreditTransaction[]
}

model CreditTransaction {
  id            String   @id @default(cuid())
  userId        String
  type          TxType
  gcAmount      Int
  gcBalance     Int
  provider      String?
  quality       String?
  durationS     Int?
  jobId         String?
  description   String?
  createdAt     DateTime @default(now())

  user          User     @relation(fields: [userId], references: [id])
  subscription  Subscription? @relation(fields: [userId], references: [userId])
}

model GenerationRate {
  id          String     @id @default(cuid())
  provider    String
  quality     String
  durationS   Int
  gcCost      Int
  isActive    Boolean    @default(true)
  updatedAt   DateTime   @updatedAt

  @@unique([provider, quality, durationS])
}
```

Run migration: `npx prisma migrate dev --name add_credits_system`

---

## STEP 2: PLAN CONFIGURATION

Create `server/lib/plans.ts`:

```typescript
export const PLAN_CONFIG = {
  FREE_TRIAL: {
    monthlyGC: 50,
    price: 0,
    rolloverPercent: 0,
    rolloverMax: 0,
    overageRatePerGC: 0, // no overage on trial
    maxResolution: '720p',
    maxClipDuration: 5,
    brandWorkspaces: 1,
    teamSeats: 1,
    apiAccess: false,
    trialDays: 14,
  },
  STARTER: {
    monthlyGC: 200,
    priceMonthly: 5900, // cents
    priceAnnual: 49900, // cents (per month × 12 = $49/mo annual)
    rolloverPercent: 0,
    rolloverMax: 0,
    overageRatePerGC: 12, // cents
    maxResolution: '720p',
    maxClipDuration: 5,
    brandWorkspaces: 1,
    teamSeats: 1,
    apiAccess: false,
    stripePriceMonthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    stripePriceAnnual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  },
  GROWTH: {
    monthlyGC: 500,
    priceMonthly: 14900,
    priceAnnual: 124900,
    rolloverPercent: 25,
    rolloverMax: 125,
    overageRatePerGC: 10,
    maxResolution: '1080p',
    maxClipDuration: 10,
    brandWorkspaces: 2,
    teamSeats: 3,
    apiAccess: false,
    stripePriceMonthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
    stripePriceAnnual: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
  },
  STUDIO: {
    monthlyGC: 1200,
    priceMonthly: 29900,
    priceAnnual: 249900,
    rolloverPercent: 50,
    rolloverMax: 600,
    overageRatePerGC: 9, // $0.085 rounded to nearest cent
    maxResolution: '4K',
    maxClipDuration: 10,
    brandWorkspaces: 5,
    teamSeats: 10,
    apiAccess: true,
    stripePriceMonthly: process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID,
    stripePriceAnnual: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
  },
  ENTERPRISE: {
    monthlyGC: 3000, // minimum, negotiated upward
    priceMonthly: 50000, // minimum $500/mo
    rolloverPercent: 100,
    rolloverMax: 3000,
    overageRatePerGC: 7,
    maxResolution: '4K',
    maxClipDuration: 10,
    brandWorkspaces: 999,
    teamSeats: 999,
    apiAccess: true,
  },
} as const

export type PlanTier = keyof typeof PLAN_CONFIG
```

---

## STEP 3: CREDIT ENGINE

Create `server/lib/credits.ts`:

```typescript
import { prisma } from './prisma'
import { redis } from './redis'
import { PLAN_CONFIG } from './plans'

const CACHE_TTL = 30 // seconds

// Get user's total available GC (subscription + rollover + topup)
export async function getAvailableCredits(userId: string): Promise<number> {
  const cacheKey = `credits:${userId}`
  
  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) return parseInt(cached)
  
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) return 0
  
  const total = sub.currentGC + sub.topupGC
  await redis.setEx(cacheKey, CACHE_TTL, total.toString())
  return total
}

// Check if user can afford a generation
export async function canAfford(userId: string, gcCost: number): Promise<{
  canAfford: boolean
  available: number
  required: number
  source: 'subscription' | 'topup' | 'mixed' | 'insufficient'
}> {
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) return { canAfford: false, available: 0, required: gcCost, source: 'insufficient' }
  
  const available = sub.currentGC + sub.topupGC
  
  if (available < gcCost) {
    return { canAfford: false, available, required: gcCost, source: 'insufficient' }
  }
  
  let source: 'subscription' | 'topup' | 'mixed' = 'subscription'
  if (sub.currentGC === 0) source = 'topup'
  else if (sub.currentGC < gcCost) source = 'mixed'
  
  return { canAfford: true, available, required: gcCost, source }
}

// Consume credits after successful generation (atomic with Redis lock)
export async function consumeCredits(
  userId: string,
  gcCost: number,
  opts: {
    provider: string
    quality: string
    durationS?: number
    jobId?: string
    type?: 'GENERATION' | 'REGEN'
  }
): Promise<{ success: boolean; newBalance: number; txId: string }> {
  
  // Use Redis distributed lock to prevent race conditions
  const lockKey = `lock:credits:${userId}`
  const lock = await redis.set(lockKey, '1', { NX: true, EX: 5 })
  if (!lock) throw new Error('Credit lock conflict — retry')
  
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId } })
    if (!sub) throw new Error('No subscription found')
    
    const total = sub.currentGC + sub.topupGC
    if (total < gcCost) throw new Error('Insufficient credits')
    
    // Consume subscription credits first, then topup
    let remainingCost = gcCost
    let newCurrentGC = sub.currentGC
    let newTopupGC = sub.topupGC
    
    if (newCurrentGC >= remainingCost) {
      newCurrentGC -= remainingCost
      remainingCost = 0
    } else {
      remainingCost -= newCurrentGC
      newCurrentGC = 0
      newTopupGC -= remainingCost
    }
    
    const newBalance = newCurrentGC + newTopupGC
    
    // Atomic update + transaction record
    const [, tx] = await prisma.$transaction([
      prisma.subscription.update({
        where: { userId },
        data: { currentGC: newCurrentGC, topupGC: newTopupGC },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          type: opts.type ?? 'GENERATION',
          gcAmount: -gcCost,
          gcBalance: newBalance,
          provider: opts.provider,
          quality: opts.quality,
          durationS: opts.durationS,
          jobId: opts.jobId,
          description: `${opts.provider} ${opts.quality} generation`,
        },
      }),
    ])
    
    // Invalidate cache
    await redis.del(`credits:${userId}`)
    
    return { success: true, newBalance, txId: tx.id }
    
  } finally {
    await redis.del(lockKey)
  }
}

// Refund credits for failed generation
export async function refundCredits(
  userId: string,
  gcAmount: number,
  jobId: string,
  reason: string
): Promise<void> {
  await prisma.$transaction([
    prisma.subscription.update({
      where: { userId },
      data: { currentGC: { increment: gcAmount } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        type: 'REFUND',
        gcAmount: gcAmount,
        gcBalance: 0, // will be recalculated on next read
        jobId,
        description: `Refund: ${reason}`,
      },
    }),
  ])
  await redis.del(`credits:${userId}`)
}

// Monthly billing cycle reset (called by Stripe webhook on invoice.paid)
export async function resetMonthlyCreditss(userId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) return
  
  const planConfig = PLAN_CONFIG[sub.plan as keyof typeof PLAN_CONFIG]
  const monthlyGC = (planConfig as any).monthlyGC ?? 0
  const rolloverPct = (planConfig as any).rolloverPercent ?? 0
  const rolloverMax = (planConfig as any).rolloverMax ?? 0
  
  // Calculate rollover from previous cycle
  const rollover = Math.min(
    Math.floor(sub.currentGC * (rolloverPct / 100)),
    rolloverMax
  )
  
  const newCycleEnd = new Date()
  newCycleEnd.setMonth(newCycleEnd.getMonth() + 1)
  
  await prisma.$transaction([
    prisma.subscription.update({
      where: { userId },
      data: {
        currentGC: monthlyGC + rollover,
        rolloverGC: rollover,
        billingCycleStart: new Date(),
        billingCycleEnd: newCycleEnd,
      },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        type: 'MONTHLY_RESET',
        gcAmount: monthlyGC + rollover,
        gcBalance: monthlyGC + rollover + sub.topupGC,
        description: `Monthly reset: ${monthlyGC} GC + ${rollover} rollover`,
      },
    }),
  ])
  
  await redis.del(`credits:${userId}`)
}

// Get credit cost for a specific generation
export async function getCreditCost(
  provider: string,
  quality: string,
  durationS: number
): Promise<number> {
  const rate = await prisma.generationRate.findUnique({
    where: { provider_quality_durationS: { provider, quality, durationS } },
  })
  return rate?.gcCost ?? 10 // default 10 GC if unknown
}

// Check if user's plan allows a specific provider
export async function canAccessProvider(
  userId: string,
  provider: string
): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) return false
  
  const { PROVIDER_PERMISSIONS } = await import('./providerPermissions')
  const allowed = PROVIDER_PERMISSIONS[sub.plan as keyof typeof PROVIDER_PERMISSIONS] ?? []
  return allowed.includes(provider)
}
```

---

## STEP 4: MIDDLEWARE

Create `server/middleware/requireCredits.ts`:

```typescript
import { Request, Response, NextFunction } from 'express'
import { canAfford, canAccessProvider, getCreditCost } from '../lib/credits'

export function requireCredits(opts: {
  provider: string
  quality: string
  durationS: number
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    
    // Check provider access
    const hasAccess = await canAccessProvider(userId, opts.provider)
    if (!hasAccess) {
      return res.status(403).json({
        error: 'PROVIDER_NOT_IN_PLAN',
        message: `${opts.provider} requires upgrading your plan`,
        upgradeRequired: true,
      })
    }
    
    // Check credit balance
    const gcCost = await getCreditCost(opts.provider, opts.quality, opts.durationS)
    const affordCheck = await canAfford(userId, gcCost)
    
    if (!affordCheck.canAfford) {
      return res.status(402).json({
        error: 'INSUFFICIENT_CREDITS',
        message: `This generation requires ${gcCost} GC. You have ${affordCheck.available} GC.`,
        required: gcCost,
        available: affordCheck.available,
        shortfall: gcCost - affordCheck.available,
        upgradeUrl: '/billing',
        topupUrl: '/billing/topup',
      })
    }
    
    // Attach cost to request for consumption after generation
    req.creditCost = gcCost
    req.creditProvider = opts.provider
    req.creditQuality = opts.quality
    next()
  }
}
```

---

## STEP 5: STRIPE WEBHOOK

Create `server/routes/billing.ts`:

```typescript
import Stripe from 'stripe'
import { resetMonthlyCredits } from '../lib/credits'
import { prisma } from '../lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature failed' })
  }
  
  switch (event.type) {
    
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata.userId
      const plan = sub.metadata.plan as PlanTier
      const planConfig = PLAN_CONFIG[plan]
      
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan,
          status: sub.status === 'trialing' ? 'TRIALING' : 'ACTIVE',
          monthlyGC: planConfig.monthlyGC,
          currentGC: planConfig.monthlyGC,
          billingCycleStart: new Date(sub.current_period_start * 1000),
          billingCycleEnd: new Date(sub.current_period_end * 1000),
          stripeCustomerId: sub.customer as string,
          stripeSubscriptionId: sub.id,
        },
        update: {
          plan,
          status: sub.status === 'trialing' ? 'TRIALING' : 'ACTIVE',
          monthlyGC: planConfig.monthlyGC,
          stripeSubscriptionId: sub.id,
        },
      })
      break
    }
    
    case 'invoice.paid': {
      // New billing cycle — reset credits
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId }
      })
      if (sub) await resetMonthlyCredits(sub.userId)
      break
    }
    
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata.userId
      await prisma.subscription.update({
        where: { userId },
        data: { status: 'CANCELED', currentGC: 0 },
      })
      break
    }
    
    case 'payment_intent.succeeded': {
      // Top-up credit purchase
      const pi = event.data.object as Stripe.PaymentIntent
      if (pi.metadata.type === 'topup') {
        const userId = pi.metadata.userId
        const gcAmount = parseInt(pi.metadata.gcAmount)
        await prisma.subscription.update({
          where: { userId },
          data: { topupGC: { increment: gcAmount } },
        })
        await prisma.creditTransaction.create({
          data: {
            userId,
            type: 'TOPUP_PURCHASE',
            gcAmount,
            gcBalance: 0, // recalc on next read
            description: `Top-up: ${gcAmount} GC purchased`,
          },
        })
        await redis.del(`credits:${userId}`)
      }
      break
    }
  }
  
  res.json({ received: true })
}
```

---

## STEP 6: SEED GENERATION RATES

Create `prisma/seed.ts` additions:

```typescript
const GENERATION_RATES = [
  // Standard tier
  { provider: 'kling-2.6-std',    quality: '720p',       durationS: 5,  gcCost: 3  },
  { provider: 'kling-2.6-std',    quality: '720p',       durationS: 10, gcCost: 5  },
  { provider: 'hailuo-2.3',       quality: '768p',       durationS: 6,  gcCost: 3  },
  { provider: 'hailuo-2.3',       quality: '768p',       durationS: 10, gcCost: 5  },
  { provider: 'hunyuan-fast',     quality: '480p',       durationS: 5,  gcCost: 1  },
  { provider: 'wan-2.6',          quality: '720p',       durationS: 5,  gcCost: 4  },
  { provider: 'ltx-video',        quality: '720p',       durationS: 5,  gcCost: 2  },
  // Premium tier
  { provider: 'kling-2.6-pro',    quality: '1080p',      durationS: 5,  gcCost: 4  },
  { provider: 'kling-3.0',        quality: '720p',       durationS: 5,  gcCost: 5  },
  { provider: 'kling-3.0',        quality: '720p-audio', durationS: 5,  gcCost: 8  },
  { provider: 'kling-3.0',        quality: '1080p',      durationS: 5,  gcCost: 9  },
  { provider: 'kling-3.0',        quality: '1080p-audio',durationS: 5,  gcCost: 12 },
  { provider: 'veo3-fast',        quality: '720p',       durationS: 5,  gcCost: 4  },
  { provider: 'veo3-fast',        quality: '720p-audio', durationS: 5,  gcCost: 6  },
  { provider: 'seedance-2-fast',  quality: '480p',       durationS: 5,  gcCost: 5  },
  { provider: 'sora-2',           quality: '720p',       durationS: 5,  gcCost: 5  },
  // Top tier
  { provider: 'veo3-full',        quality: '1080p',      durationS: 5,  gcCost: 7  },
  { provider: 'veo3-full',        quality: '1080p-audio',durationS: 5,  gcCost: 14 },
  { provider: 'seedance-2',       quality: '720p',       durationS: 5,  gcCost: 12 },
  { provider: 'seedance-2',       quality: '1080p',      durationS: 5,  gcCost: 30 },
  { provider: 'sora-2-pro',       quality: '1080p',      durationS: 5,  gcCost: 18 },
  { provider: 'kling-omni',       quality: '1080p',      durationS: 5,  gcCost: 7  },
  // Non-video
  { provider: 'elevenlabs',       quality: 'standard',   durationS: 60, gcCost: 2  },
  { provider: 'remotion-render',  quality: '1080p',      durationS: 60, gcCost: 2  },
  { provider: 'claude-vision-qa', quality: 'standard',   durationS: 1,  gcCost: 1  },
  { provider: 'script-llm',       quality: 'standard',   durationS: 1,  gcCost: 2  },
]

for (const rate of GENERATION_RATES) {
  await prisma.generationRate.upsert({
    where: { provider_quality_durationS: { provider: rate.provider, quality: rate.quality, durationS: rate.durationS } },
    create: rate,
    update: rate,
  })
}
```

---

## STEP 7: REACT HOOK

Create `client/src/hooks/useCredits.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useCredits() {
  return useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await fetch('/api/credits/balance')
      return res.json() as Promise<{
        subscriptionGC: number
        topupGC: number
        totalGC: number
        monthlyBudget: number
        usedThisCycle: number
        percentUsed: number
        billingCycleEnd: string
        plan: string
        warningLevel: 'none' | 'warning' | 'urgent' | 'empty'
      }>
    },
    staleTime: 30_000, // refresh every 30s
    refetchInterval: 60_000,
  })
}

export function useCreditCost(provider: string, quality: string, durationS: number) {
  return useQuery({
    queryKey: ['credit-cost', provider, quality, durationS],
    queryFn: async () => {
      const res = await fetch(`/api/credits/rates?provider=${provider}&quality=${quality}&duration=${durationS}`)
      const data = await res.json()
      return data.gcCost as number
    },
    staleTime: 300_000, // rates don't change often
  })
}
```

---

## ENVIRONMENT VARIABLES NEEDED

Add to `.env`:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_STARTER_ANNUAL_PRICE_ID=price_...
STRIPE_GROWTH_MONTHLY_PRICE_ID=price_...
STRIPE_GROWTH_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_MONTHLY_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...
REDIS_URL=redis://localhost:6379
```

---

## STRIPE SETUP (do manually, not in code)

1. Create Products in Stripe Dashboard:
   - NeuralCut.AI Starter — $59/mo + $49/mo annual
   - NeuralCut.AI Growth — $149/mo + $124/mo annual
   - NeuralCut.AI Studio — $299/mo + $249/mo annual

2. Set metadata on each subscription:
   - `plan`: STARTER | GROWTH | STUDIO
   - `userId`: (set dynamically at checkout)

3. Create webhook endpoint pointing to `/api/billing/webhook`
   - Events: customer.subscription.*, invoice.paid, payment_intent.succeeded

4. Create Payment Links or Checkout Sessions for each plan

---

## TESTING CHECKLIST

- [ ] New user gets 50 GC FREE_TRIAL on signup
- [ ] Trial user blocked when 50 GC exhausted
- [ ] Subscription upgrade correctly sets new monthly GC
- [ ] Monthly reset runs on invoice.paid and adds correct GC
- [ ] Rollover correctly calculated (Growth: 25% max 125, Studio: 50% max 600)
- [ ] Top-up purchase adds to topupGC correctly
- [ ] Subscription credits consumed before top-up credits
- [ ] Race condition: two simultaneous generations don't double-deduct (test with Redis lock)
- [ ] Failed generation correctly refunds credits
- [ ] Provider access blocked for wrong plan tier
- [ ] Credit cost preview shows correct GC before generation
- [ ] Credit balance displayed correctly in UI

