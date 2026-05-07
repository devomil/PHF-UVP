# AI Video Production Studio

## Run & Operate
- **Run**: `npm run dev` (client and server)
- **Production Run**: `NODE_ENV=production node dist/server/index.js`
- **Build**: `vite build && esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outdir=dist/server`
- **Typecheck**: `npm run typecheck`
- **Lint Dialogs**: `npm run lint:dialogs`
- **Health Check**: `GET /api/health`
- **Codegen**: _Populate as you build_
- **DB Push**: `drizzle-kit push:pg`
- **Env Vars**: `SESSION_SECRET`, `AYRSHARE_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_NOTIFICATION_PHONE`, `SENDGRID_FROM_EMAIL`, `RECRAFT_API_KEY`
- **Social Login (Tasks #163, #166)**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GOOGLE_CALLBACK_URL` (default `${APP_URL}/api/auth/google/callback`); `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, optional `FACEBOOK_CALLBACK_URL`; `APPLE_CLIENT_ID` (Services ID, e.g. `com.neuralcut.signin`), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (full `.p8` PEM contents — literal `\n` sequences are auto-restored to newlines), optional `APPLE_CALLBACK_URL` (default `${APP_URL}/api/auth/apple/callback`, must be registered in Apple's Services ID config; Apple POSTs the callback as `application/x-www-form-urlencoded`); optional exploratory `ENABLE_CANVA_LOGIN` (`1|true|yes`) — surfaces `canva:true` on `/api/auth/providers` so the client can light up the placeholder once the strategy lands. Each provider is registered conditionally — missing env vars cause the strategy + buttons to be omitted gracefully (no crash). `GET /api/auth/providers` reports which are configured. OAuth flows enable Passport's session-backed `state` parameter on both initiate and callback (login-CSRF protection). OAuth signups create users via `linkOrCreateOAuthUser` in `server/auth.ts` which (1) matches existing `oauth_accounts` row, else (2) links by verified email to existing `users` row (rejects if provider didn't confirm `email_verified`), else (3) creates a new user (role `employee` unless email is in `ADMIN_EMAILS`), provisions free trial via `createInitialTrialForNewUser`, and fires signup + welcome notifications. Concurrent callbacks for the same provider account or email are handled via unique-violation re-fetch. Linkage stored in `oauth_accounts` table (unique `(provider, provider_account_id)`).
- **Billing (NC-01)**: `BILLING_PROVIDER` (default `stripe`), `STRIPE_SECRET_KEY` (must be `sk_test_…`/`sk_live_…`, not the publishable key), `STRIPE_WEBHOOK_SECRET`. **Price IDs are NOT env vars** — each catalog entry is resolved by Stripe `lookup_key` (lowercased catalog key, e.g. `starter_monthly`, `growth_annual`, `pack_100`, `pack_2500`). See `server/config/billing-catalog.ts` for the full key list and `server/services/billing/stripe-provider.ts` for the cached `prices.list({ lookup_keys })` resolver. Webhook endpoint: `POST /api/billing/webhook/:providerName` (raw body required). Catalog reports `configured:false` for any lookup_key not found in Stripe.
- **Public Pricing (NC-03)**: Public marketing routes `/pricing` and `/contact-sales` (no auth required). Server projection endpoints `GET /api/billing/plans` and `GET /api/billing/topup-packs` derive everything from `PLAN_CONFIG`, `TOPUP_PACKS`, `PROVIDER_PERMISSIONS`, and `BILLING_CATALOG` — no client-side hardcoded prices. Each plan/pack reports `configured:true|false` based on whether its Stripe `lookup_key` resolves; unconfigured CTAs degrade to "Contact us" which routes to `/contact-sales?plan=…`. Sales-inquiry endpoint: `POST /api/sales-inquiries` (honeypot field `website`, in-memory rate limit 5/min/IP, sends via SendGrid to `ADMIN_NOTIFICATION_EMAIL` with `SENDGRID_FROM_EMAIL` as sender). `GET /api/sales-inquiries/config` reports email-configured state for the contact-sales mailto fallback. **Marketing claims** (`seats`, `brandWorkspaces`, `prioritySupport`, `apiAccess`) shown on the pricing page are display-only today and are NOT enforced anywhere in the backend — wire enforcement before relying on them commercially.

## Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter, @tanstack/react-query
- **Backend**: Express.js, TypeScript, Passport.js, bcrypt
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **ORM**: Drizzle ORM
- **Validation**: _Populate as you build_
- **Build Tool**: Vite, esbuild
- **Runtime**: Node.js
- **Video Composition**: Remotion

## Where things live
- **Frontend Source**: `client/`
- **Backend Source**: `server/`
- **Shared Utilities/Types**: `shared/`
- **DB Schema**: `db/schema.ts` (Drizzle ORM)
- **API Routes**: `server/services/` (e.g., `universal-video-routes.ts`, `admin-routes.ts`)
- **Remotion Root**: `remotion/Root.tsx`
- **Native Dialog Linting Script**: `scripts/check-no-native-dialogs.sh`
- **CI/CD Workflows**: `.github/workflows/`
- **Husky Hooks**: `.husky/`
- **Visual Art Presets**: `shared/config/visual-art-presets.ts`
- **Theme Files**: `client/src/index.css`, `client/tailwind.config.js`

## Architecture decisions
- **Image-first I2V Pipeline**: All AI video generation prioritizes Image-to-Video (I2V) by generating an intermediate image (Flux Pro) then animating it, ensuring style consistency and leveraging advanced motion capabilities.
- **Micro-Scene Architecture**: Complex scenes are automatically broken into smaller, independently editable and regenerable micro-scenes, improving granularity and allowing for fine-tuned control over video segments.
- **Atomic Database Operations**: Utilizes PostgreSQL's `jsonb_set()` and `jsonb ||` (or `jsonb_agg`) for atomic updates to complex JSONB fields (like scene data and render settings), preventing race conditions during concurrent modifications.
- **Two-Stage Rendering Optimization**: For "Studio Polish" projects, video rendering bypasses Remotion Lambda for raw uploaded clips when possible, significantly reducing render times.
- **Intelligent Script Pipeline (4 Stages)**: A sophisticated AI pipeline handles script generation from creative strategy to cinematic prompt enhancement, incorporating brand guidelines, trend data, and Suzzie's 7-layer cinematic framework for transforming visual directions into production-grade AI video prompts.
- **Text-Aware Image-to-Video**: Automatically detects text-heavy scenes and routes them through a GPT-Image-1 -> I2V pipeline to ensure accurate text rendering within AI-generated video.
- **Two-Stage Rendering Pipeline**: FFmpeg pre-composes micro-scene clips for each scene, then Remotion renders these pre-assembled clips. This optimizes performance, especially for Studio Polish projects which can bypass Remotion Lambda almost entirely.

## Product
- **AI Video Generation**: Utilizes multiple AI video providers with an intelligent selection system.
- **Brand Asset Management**: Comprehensive tools for managing brand settings, logos, and media.
- **Trending Hook Intelligence**: AI-powered analysis for viral content suggestions and keywords.
- **Character Reference Pipeline**: Generate and reuse consistent characters across projects with image-to-image (I2I) generation.
- **Micro-Scenes**: Automatic narration splitting into micro-scenes with individual visual directions and video clips.
- **Long Story / Deep Dive Mode**: Project type for extended content with document ingestion, chapter outlining, and repurposing features.
- **Custom Script Workflow**: Scene-by-scene editor for granular control over video content.
- **Quick Create Workflow**: Rapid asset creation (T2I, T2V, I2I, I2V, V2V) with advanced image transformation.
- **Studio Polish Workflow**: Upload existing media for professional polishing and editing.
- **Overlay System**: Customizable image and text overlays with styling, animations, and WYSIWYG preview.
- **Per-Scene Voiceover & Captions**: ElevenLabs-powered voiceovers with word-level timing and customizable text caption overlays.
- **Visual Art Direction Presets**: 9 distinct visual styles with smart mix capability and per-scene overrides.
- **Ask Suzzie AI Assistant**: Conversational AI assistant for visual direction, provider recommendations, and platform guidance.
- **Asset Library**: Centralized management of generated and uploaded media assets with advanced AI creation modes.
- **Canva Integration**: OAuth-based integration for seamless rendering and asset synchronization to Canva.
- **Social Publishing Hub**: Ayrshare-powered system for scheduling and publishing videos to social media with AI caption generation.
- **Admin Portal**: Dashboard for user, project, cost, and activity management.
- **Sound Design**: Advanced sound design capabilities and quality evaluation.

## User preferences
- Focus on Video Production Platform only (no HR features)
- Dark theme with purple/indigo accent colors
- Modern, professional, cutting-edge UI (Canva-inspired)
- Glassmorphism card surfaces, gradient thumbnails, visual project cards

## Gotchas
- **OAuth account linking by email**: Social login (Google/Facebook/Apple) trusts the provider's verified-email claim and links to an existing `users` row when emails match (case-insensitive `lower(email)` lookup; `/api/register` and the local-login strategy both lowercase on write/read). Do NOT enable a third-party provider that returns unverified emails without adding an explicit verification step, or different people could collide on the same account. Apple-specific notes: (a) the user's name is only sent on the very *first* sign-in (Apple drops it on subsequent logins) — passport-apple parses the body `user` JSON onto `req.appleProfile` for first-time captures; (b) users may opt for Apple's private email relay (`@privaterelay.appleid.com`) — those addresses are Apple-verified and treated as `email_verified=true`; (c) Apple's `email_verified` claim arrives as the string `"true"` per their spec, not a boolean — both forms are accepted.
- **Native Browser Dialogs**: Avoid `window.alert`, `window.confirm`, `window.prompt` in `client/src`. Use `AlertDialog` or `useToast` for themed UI. `npm run lint:dialogs` enforces this.
- **Husky Pre-commit Hook**: `npm install` is required after cloning to install the pre-commit hook which runs `lint:dialogs`. Set `HUSKY=0` to skip installation.
- **Session Security**: `SESSION_SECRET` environment variable is mandatory in production.
- **Cinematic Flow Mode**: Breaks continuity chain if art styles change between scenes.
- **Concurrent Video Generation**: Race conditions are handled by atomic DB operations and specific retry/polling logic, but unexpected delays can occur.
- **Cost Telemetry**: Storyboard batch generation includes cost tracking with budget caps and alerts for nearing the cap.
- **Canva Integration**: Requires `canva_tokens` to be valid and active. Sync status should be monitored in the UI.
- **Session Security:** `SESSION_SECRET` environment variable is critical in production; the app will fail fast if missing.
- **Image Generation Policy:** Recraft is preferred for text-heavy/product scenes, while Nano Banana 2 is preferred for photorealistic/lifestyle scenes.
- **Admin-Unlimited Credits:** Users with `role="admin"` (e.g. `ryan@pinehillfarm.co` via the `ADMIN_EMAILS` allowlist in `server/auth.ts`) bypass all credit accounting. The single source of truth is `isAdminUnlimited(user)` / `isAdminUnlimitedById(userId)` in `server/lib/admin.ts`. `consumeCredits` writes a `source="admin_unlimited"` row into `credit_transactions` (so the admin Costs dashboard, per-project rollups, and `usage-by-provider` analytics still see the would-have-been provider cost) but does NOT decrement `currentGC` / `topupGC`. `getAvailableCredits` returns `unlimited:true` plus `monthlyUsedGC`. `canAccessProvider` and `canAfford` short-circuit `true`. The `requireCredits` middleware skips both checks for admins so 402/403 envelopes never fire. Client `useCredits` exposes `unlimited` so the credit meter renders an "Unlimited · Admin" chip, the warning banner is suppressed, the cost preview / generate button stay in the calm/ready state, and the top-up & upgrade modals become toast no-ops. The billing page shows an admin notice and hides the plan comparison strip.

## Pointers
- **Remotion Documentation**: [https://www.remotion.dev/docs](https://www.remotion.dev/docs)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **Tailwind CSS Documentation**: [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **shadcn/ui Documentation**: [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
- **Passport.js Documentation**: [http://www.passportjs.org/docs/](http://www.passportjs.org/docs/)
- **@tanstack/react-query Documentation**: [https://tanstack.com/query/latest/docs/react/overview](https://tanstack.com/query/latest/docs/react/overview)
- **Husky Hooks**: [https://typicode.github.io/husky/](https://typicode.github.io/husky/)
- **PiAPI LLM Client**: Refer to `server/services/piapi-llm-client.ts` for Claude integration details.
- **Image Generation Policy**: `server/utils/image-generation-policy.ts` for provider selection logic.
- **Ayrshare API Documentation**: [https://docs.ayrshare.com/](https://docs.ayrshare.com/)
- **Canva API Documentation**: [https://www.canva.com/developers/api/](https://www.canva.com/developers/api/)
