# NeuralCut.AI Phase NC-02 — Credit Meter UX
## In-app credit balance display, warnings, and top-up flow

---

## OVERVIEW

Users need to always know:
1. How many GC they have left
2. How much a generation will cost before they click generate
3. When they're running low — with enough warning to top up or upgrade
4. How to get more credits without leaving their workflow

This phase covers the complete credit UX layer. No back-end changes — this is all front-end.

---

## COMPONENT 1: CreditMeter (global, always visible)

Location: Top nav bar, right of user avatar

```tsx
// client/src/components/credits/CreditMeter.tsx
import { useCredits } from '@/hooks/useCredits'

export function CreditMeter() {
  const { data: credits, isLoading } = useCredits()
  
  if (isLoading || !credits) return <CreditMeterSkeleton />
  
  const { totalGC, monthlyBudget, warningLevel, percentUsed, billingCycleEnd } = credits
  
  const colors = {
    none:    { bar: '#4F46E5', text: '#4B5563', bg: '#EEF2FF' },
    warning: { bar: '#D97706', text: '#92400E', bg: '#FFFBEB' },
    urgent:  { bar: '#E11D48', text: '#9F1239', bg: '#FFF1F2' },
    empty:   { bar: '#E11D48', text: '#9F1239', bg: '#FFF1F2' },
  }
  const c = colors[warningLevel]
  
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: c.bg,
        border: `1px solid ${c.bar}22`,
        borderRadius: 100,
        padding: '5px 12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      title={`${totalGC} GC remaining · Resets ${new Date(billingCycleEnd).toLocaleDateString()}`}
    >
      {/* Credit icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.bar} strokeWidth="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      
      {/* Balance */}
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: c.text }}>
        {totalGC.toLocaleString()} GC
      </span>
      
      {/* Progress bar */}
      <div style={{ width: 48, height: 4, background: `${c.bar}20`, borderRadius: 100, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100 - percentUsed, 100)}%`,
          background: c.bar,
          borderRadius: 100,
          transition: 'width 0.5s ease',
        }} />
      </div>
      
      {warningLevel !== 'none' && (
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: c.text }}>
          {warningLevel === 'empty' ? 'Add credits' : 'Low'}
        </span>
      )}
    </div>
  )
}
```

---

## COMPONENT 2: CreditWarningBanner

Location: Top of the generation workspace, visible when credits are low.

```tsx
// client/src/components/credits/CreditWarningBanner.tsx

interface Props {
  warningLevel: 'warning' | 'urgent' | 'empty'
  totalGC: number
  onTopUp: () => void
  onUpgrade: () => void
}

export function CreditWarningBanner({ warningLevel, totalGC, onTopUp, onUpgrade }: Props) {
  if (warningLevel === 'none') return null
  
  const configs = {
    warning: {
      bg: '#FFFBEB',
      border: '#FCD34D',
      icon: '⚠',
      iconColor: '#D97706',
      text: `You've used 80% of your monthly credits. ${totalGC} GC remaining.`,
      cta: 'Top up credits',
      ctaStyle: { background: '#D97706', color: '#fff' },
    },
    urgent: {
      bg: '#FFF1F2',
      border: '#FDA4AF',
      icon: '!',
      iconColor: '#E11D48',
      text: `Almost out! Only ${totalGC} GC remaining this month.`,
      cta: 'Top up now',
      ctaStyle: { background: '#E11D48', color: '#fff' },
    },
    empty: {
      bg: '#FFF1F2',
      border: '#E11D48',
      icon: '✕',
      iconColor: '#E11D48',
      text: 'No credits remaining. New generations are paused.',
      cta: 'Add credits to continue',
      ctaStyle: { background: '#E11D48', color: '#fff' },
    },
  }
  
  const config = configs[warningLevel]
  
  return (
    <div style={{
      background: config.bg,
      border: `1px solid ${config.border}`,
      borderRadius: 10,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: config.iconColor,
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {config.icon}
      </span>
      
      <span style={{ flex: 1, fontSize: '0.875rem', color: '#374151' }}>
        {config.text}
      </span>
      
      <button
        onClick={onTopUp}
        style={{
          ...config.ctaStyle,
          border: 'none',
          borderRadius: 7,
          padding: '6px 14px',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {config.cta}
      </button>
      
      <button
        onClick={onUpgrade}
        style={{
          background: 'transparent',
          border: '1px solid #D1D5DB',
          borderRadius: 7,
          padding: '6px 14px',
          fontSize: '0.82rem',
          fontWeight: 500,
          cursor: 'pointer',
          color: '#374151',
          whiteSpace: 'nowrap',
        }}
      >
        Upgrade plan
      </button>
    </div>
  )
}
```

---

## COMPONENT 3: CreditCostPreview

Location: Inline in the provider/quality selector, before generate button.

```tsx
// client/src/components/credits/CreditCostPreview.tsx
import { useCreditCost } from '@/hooks/useCredits'
import { useCredits } from '@/hooks/useCredits'

interface Props {
  provider: string
  quality: string
  durationS: number
  showDetail?: boolean
}

export function CreditCostPreview({ provider, quality, durationS, showDetail }: Props) {
  const { data: gcCost } = useCreditCost(provider, quality, durationS)
  const { data: credits } = useCredits()
  
  if (!gcCost || !credits) return null
  
  const canAfford = credits.totalGC >= gcCost
  const remaining = credits.totalGC - gcCost
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      background: canAfford ? '#F9FAFB' : '#FFF1F2',
      border: `1px solid ${canAfford ? '#E5E7EB' : '#FDA4AF'}`,
      borderRadius: 8,
      fontSize: '0.78rem',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke={canAfford ? '#6B7280' : '#E11D48'} strokeWidth="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      
      <span style={{ color: canAfford ? '#374151' : '#9F1239' }}>
        This generation: <strong>{gcCost} GC</strong>
      </span>
      
      {showDetail && (
        <span style={{ color: '#9CA3AF' }}>
          · {credits.totalGC} available
          {canAfford
            ? ` · ${remaining} after`
            : ` · ${gcCost - credits.totalGC} short`
          }
        </span>
      )}
      
      {!canAfford && (
        <a href="/billing/topup" style={{
          color: '#E11D48', fontWeight: 600, textDecoration: 'none',
          marginLeft: 'auto',
        }}>
          Top up →
        </a>
      )}
    </div>
  )
}
```

---

## COMPONENT 4: TopUpModal

```tsx
// client/src/components/credits/TopUpModal.tsx

const TOPUP_PACKS = [
  { gc: 100,   price: 1100,  priceDisplay: '$11',   perGC: '$0.11' },
  { gc: 250,   price: 2500,  priceDisplay: '$25',   perGC: '$0.10', popular: false },
  { gc: 500,   price: 4500,  priceDisplay: '$45',   perGC: '$0.09', popular: true },
  { gc: 1000,  price: 8000,  priceDisplay: '$80',   perGC: '$0.08' },
  { gc: 2500,  price: 17500, priceDisplay: '$175',  perGC: '$0.07', best: true },
]

export function TopUpModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const { data: credits } = useCredits()
  
  const handlePurchase = async () => {
    if (selected === null) return
    setLoading(true)
    const res = await fetch('/api/credits/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packIndex: selected }),
    })
    const { checkoutUrl } = await res.json()
    window.location.href = checkoutUrl // Stripe checkout
  }
  
  return (
    <div style={{ /* modal overlay */ }}>
      <div style={{ /* modal card, max-width 480px */ }}>
        
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Top up your credits</h2>
          <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: 4 }}>
            Top-up credits never expire and are used after your monthly subscription credits.
            Current balance: {credits?.totalGC ?? 0} GC
          </p>
        </div>
        
        {/* Pack grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {TOPUP_PACKS.map((pack, i) => (
            <div
              key={i}
              onClick={() => setSelected(i)}
              style={{
                border: selected === i
                  ? '2px solid #4F46E5'
                  : '1px solid #E5E7EB',
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                background: selected === i ? '#EEF2FF' : '#fff',
                position: 'relative',
                transition: 'all 0.15s',
              }}
            >
              {pack.popular && (
                <span style={{
                  position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                  background: '#4F46E5', color: '#fff',
                  fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                }}>
                  POPULAR
                </span>
              )}
              {pack.best && (
                <span style={{
                  position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                  background: '#059669', color: '#fff',
                  fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                }}>
                  BEST VALUE
                </span>
              )}
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0B1120' }}>
                {pack.gc.toLocaleString()} GC
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#4F46E5', margin: '2px 0' }}>
                {pack.priceDisplay}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>
                {pack.perGC} per GC
              </div>
            </div>
          ))}
        </div>
        
        {/* What can I make? calculator hint */}
        {selected !== null && (
          <div style={{
            background: '#F9FAFB', border: '1px solid #E5E7EB',
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            fontSize: '0.82rem', color: '#4B5563',
          }}>
            With {TOPUP_PACKS[selected].gc} GC you could generate approximately:
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <span>~{Math.floor(TOPUP_PACKS[selected].gc / 3)} short social clips (Kling std)</span>
              <span>~{Math.floor(TOPUP_PACKS[selected].gc / 8)} medium videos (Kling 3.0 720p)</span>
              <span>~{Math.floor(TOPUP_PACKS[selected].gc / 12)} premium 1080p videos</span>
            </div>
          </div>
        )}
        
        {/* Purchase button */}
        <button
          onClick={handlePurchase}
          disabled={selected === null || loading}
          style={{
            width: '100%', padding: '13px',
            background: selected !== null ? '#4F46E5' : '#D1D5DB',
            color: '#fff', border: 'none', borderRadius: 11,
            fontSize: '0.97rem', fontWeight: 600, cursor: selected !== null ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Redirecting to checkout...' : 
           selected !== null ? `Purchase ${TOPUP_PACKS[selected].gc} GC for ${TOPUP_PACKS[selected].priceDisplay}` : 
           'Select a pack'}
        </button>
        
        {/* Upgrade nudge */}
        <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9CA3AF', marginTop: 12 }}>
          Need more credits every month?{' '}
          <a href="/billing" style={{ color: '#4F46E5' }}>Upgrade your plan →</a>
        </p>
        
      </div>
    </div>
  )
}
```

---

## COMPONENT 5: Credit Usage Dashboard (Billing Page)

Shows full breakdown of credit usage by provider, by day, with transaction history.

```tsx
// Key metrics to show on the /billing page:

{/* This billing cycle */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
  <MetricCard label="Credits used" value={`${usedGC} GC`} />
  <MetricCard label="Credits remaining" value={`${remainingGC} GC`} highlight />
  <MetricCard label="Top-up credits" value={`${topupGC} GC`} />
  <MetricCard label="Resets in" value={`${daysUntilReset} days`} />
</div>

{/* Usage bar */}
<UsageBar used={usedGC} total={monthlyGC} />

{/* Usage by provider (last 30 days) */}
<ProviderBreakdown transactions={transactions} />

{/* Transaction history */}
<TransactionTable transactions={transactions} />

{/* Plan comparison + upgrade CTA */}
<PlanCompareUpgrade currentPlan={plan} />
```

---

## GENERATE BUTTON STATES

The main Generate button has 4 states:

```tsx
// 1. READY — user has enough credits
<button style={{ background: '#4F46E5', color: '#fff' }}>
  Generate · {gcCost} GC
</button>

// 2. LOW CREDITS WARNING — less than 20% remaining after this generation
<button style={{ background: '#D97706', color: '#fff' }}>
  Generate · {gcCost} GC  ⚠ {remaining} GC left after
</button>

// 3. INSUFFICIENT — not enough credits
<button style={{ background: '#E5E7EB', color: '#9CA3AF', cursor: 'not-allowed' }} disabled>
  {gcCost} GC needed · {shortfall} more required
</button>
// + shows TopUp button inline below

// 4. PLAN LOCKED — provider not available on current plan
<button style={{ background: '#E5E7EB', color: '#9CA3AF', cursor: 'not-allowed' }} disabled>
  Requires Growth plan or higher
</button>
// + shows Upgrade button inline below
```

---

## ERROR STATES (from API 402/403 responses)

```typescript
// Handle credit errors in generation service
async function handleGenerationError(error: ApiError) {
  if (error.code === 'INSUFFICIENT_CREDITS') {
    showTopUpModal({
      required: error.required,
      available: error.available,
      shortfall: error.shortfall,
    })
  } else if (error.code === 'PROVIDER_NOT_IN_PLAN') {
    showUpgradeModal({
      requiredPlan: 'GROWTH', // or 'STUDIO'
      blockedProvider: error.provider,
    })
  }
}
```

---

## CREDIT COST PREVIEW — WHERE TO SHOW IT

Show `CreditCostPreview` in these locations:
1. **Provider selector** — when user picks a provider, show cost immediately
2. **Quality selector** — when user picks 1080p vs 720p, cost updates
3. **Duration selector** — 5s vs 10s, cost updates
4. **Script pipeline** — before running the 4-stage script pipeline (~4 GC)
5. **QA review** — before running Claude Vision QA on a batch
6. **Before generate button** — always show final total cost one more time

---

## NOTIFICATIONS

Send email/in-app notifications at these thresholds:
- 80% used: "You've used 80% of your monthly credits"
- 95% used: "Only 25 GC remaining — top up to avoid interruption"
- 100% used: "Credits exhausted — your generations are paused"
- 3 days before reset: "Your credits reset in 3 days" (only if >60% used)
- Day of reset: "Fresh credits loaded — {monthlyGC} GC available"

