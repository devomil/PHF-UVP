# NeuralCut.AI Phase NC-03 — Public Pricing Page
## New /pricing page for neuralcut.ai reflecting the Generation Credits model

---

## OVERVIEW

Build the new public-facing pricing page at `/pricing` on neuralcut.ai.
This replaces any existing pricing page and reflects the new GC-based subscription model.

**Design system:** Match existing neuralcut.ai visual style.
**Reference:** See pricing screenshot for current UI patterns.

---

## PAGE SECTIONS

### 1. Hero
```
Eyebrow: "Simple, transparent pricing"
H1: "Predictable pricing. No token shock."
Subtitle: "Generate as much as your plan allows. 
Know exactly what every generation costs before you click. 
No surprise bills. No hidden fees."

Billing toggle: Monthly / Annual (annual = 2 months free)
Trust pills: ✓ 14-day free trial  ✓ No credit card to start  ✓ No token costs
```

### 2. Plan Cards (3 visible + Enterprise CTA)

**Starter — $59/mo**
```
200 GC / month
Standard providers (Kling, Hailuo, Wan, Hunyuan)
720p max resolution
1 brand workspace · 1 seat
14-day free trial
Overage: $0.12/GC

"Perfect for creators and small businesses 
producing short social content."

CTA: Start free trial →
```

**Growth — $149/mo ← FEATURED**
```
500 GC / month
Standard + Premium providers (adds Kling 3.0, Veo3 fast, Sora 2)
1080p resolution · 10s clips
25% GC rollover (up to 125 GC)
2 brand workspaces · 3 seats
14-day free trial
Overage: $0.10/GC

"For SMB marketing teams and active creators. 
Replaces your video agency at a fraction of the cost."

CTA: Start free trial →
```

**Studio — $299/mo**
```
1,200 GC / month
ALL providers including top-tier (Veo3 full, Seedance 1080p, Sora 2 Pro)
4K / unlimited resolution
50% GC rollover (up to 600 GC)
5 brand workspaces · 10 seats
API access
Priority support
Overage: $0.085/GC

"For agencies, power users, and multi-brand operations."

CTA: Start free trial →
```

**Enterprise — Custom**
```
3,000+ GC / month
Dedicated infrastructure available
Unlimited workspaces + seats
Full API + custom rate limits
SLA guarantee
Dedicated account manager
White-label option included
Custom Foundry integrations

CTA: Talk to sales →
```

### 3. What are Generation Credits?

Clean explainer section:
```
"Every AI generation in NeuralCut.AI costs a defined number of 
Generation Credits (GC). The cost depends on which provider and 
quality level you choose."

3-column breakdown:
  Standard (3–5 GC/clip)    Premium (5–12 GC/clip)    Top-tier (12–30 GC/clip)
  Kling std, Hailuo, Wan    Kling 3.0, Veo3 fast       Veo3 full, Seedance 1080p
  Good for most content     Higher quality, more real  Maximum quality

Example calculation:
  "A 90-second brand video using Kling 3.0 720p + audio:
   18 clips × 8 GC = 144 GC  +  voice 4 GC  +  render 6 GC  =  ~154 GC total"
```

### 4. Top-up Credit Packs

For users who need occasional extra capacity:
```
100 GC   $11   ($0.11/GC)
250 GC   $25   ($0.10/GC)
500 GC   $45   ($0.09/GC)  ← POPULAR
1,000 GC $80   ($0.08/GC)
2,500 GC $175  ($0.07/GC)  ← BEST VALUE

"Top-up credits never expire."
"Used after your monthly subscription credits."
CTA: Buy credits (after signup/login)
```

### 5. Provider Access by Plan

Table showing which providers are available on each plan:

| Provider | Starter | Growth | Studio |
|----------|---------|--------|--------|
| Kling 2.5/2.6 std | ✓ | ✓ | ✓ |
| Hailuo 2.3 | ✓ | ✓ | ✓ |
| Hunyuan, Wan, LTX | ✓ | ✓ | ✓ |
| Kling 2.5/2.6 pro | — | ✓ | ✓ |
| Kling 3.0 720p/1080p | — | ✓ | ✓ |
| Veo3 fast | — | ✓ | ✓ |
| Seedance 2 (480p) | — | ✓ | ✓ |
| Sora 2 720p | — | ✓ | ✓ |
| Veo3 full | — | — | ✓ |
| Seedance 2 (1080p) | — | — | ✓ |
| Sora 2 Pro | — | — | ✓ |
| Kling Omni | — | — | ✓ |

### 6. FAQ

- What are Generation Credits?
- Do unused credits roll over?
- What happens when I run out of credits?
- Can I add more credits without upgrading?
- Which providers cost the most credits?
- What's included in the free trial?
- Can I cancel anytime?
- How is this different from token-based tools?

### 7. Final CTA

```
H2: "Start creating in minutes."
Body: "14-day free trial. No credit card. Cancel anytime."
CTA: Start free trial →
Secondary: Talk to sales →
```

---

## ANNUAL PRICING (toggle state)

When annual billing is selected, prices update:
- Starter: ~~$59/mo~~ → $49/mo (billed $588/yr)
- Growth: ~~$149/mo~~ → $124/mo (billed $1,488/yr)
- Studio: ~~$299/mo~~ → $249/mo (billed $2,988/yr)

Each plan card shows: "Save $120/year" / "Save $300/year" / "Save $600/year"

---

## SEO METADATA

```html
<title>NeuralCut.AI Pricing — AI Video Generation Credits | No Token Costs</title>
<meta name="description" content="Transparent AI video pricing with Generation Credits. 
Starter from $59/mo. No token costs, no surprises. Access Kling, Veo3, Seedance 2, 
Sora 2, and 68+ AI services. 14-day free trial.">
```

