# AI Video Production Studio

## Run & Operate
- **Run**: `NODE_ENV=production node dist/server/index.js`
- **Build**: `vite build && esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outdir=dist/server`
- **Typecheck**: _Populate as you build_
- **Codegen**: _Populate as you build_
- **DB Push**: _Populate as you build_
- **Env Vars**: `SESSION_SECRET`, `AYRSHARE_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_NOTIFICATION_PHONE`, `SENDGRID_FROM_EMAIL`, `RECRAFT_API_KEY`

## Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, wouter, @tanstack/react-query
- **Backend**: Express.js, TypeScript, Passport.js, bcrypt
- **Database**: PostgreSQL (Neon)
- **ORM**: Drizzle ORM
- **Validation**: _Populate as you build_
- **Build Tool**: Vite, esbuild
- **Runtime**: Node.js
- **Video Composition**: Remotion

## Where things live
- `client/`: Frontend source code
- `server/`: Backend source code
- `shared/`: Shared types and utilities
- `drizzle/`: Database migrations and schema
- `.husky/`: Git hooks
- `.github/workflows/`: CI/CD configurations
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: Defined implicitly by Express.js routes in `server/services/`
- **Theme Files**: `client/src/index.css`, `client/tailwind.config.js`
- **Video Art Presets**: `shared/config/visual-art-presets.ts`

## Architecture decisions
- **Image-first I2V Pipeline**: All AI video generation prioritizes Image-to-Video (I2V) by generating an intermediate image (Flux Pro) then animating it, ensuring style consistency and leveraging advanced motion capabilities.
- **Micro-Scene Architecture**: Complex scenes are automatically broken into smaller, independently editable and regenerable micro-scenes, improving granularity and allowing for fine-tuned control over video segments.
- **Atomic Database Operations**: Utilizes PostgreSQL's `jsonb_set()` and `jsonb ||` for atomic updates to complex JSONB fields (like scene data and render settings), preventing race conditions during concurrent modifications.
- **Intelligent Script Pipeline (4 Stages)**: A sophisticated AI pipeline handles script generation from creative strategy to cinematic prompt enhancement, incorporating brand guidelines, trend data, and LLM-powered visual direction.
- **Text-Aware Image-to-Video**: Automatically detects text-heavy scenes and routes them through a GPT-Image-1 -> I2V pipeline to ensure accurate text rendering within AI-generated video.

## Product
- AI-powered video creation with multiple AI video providers.
- Content-aware provider selection and brand asset management.
- Quality evaluation and advanced sound design capabilities.
- Brand settings for dynamic content injection and trend analysis.
- Character reference pipeline for consistent AI-generated characters.
- Long-form video production with document ingestion and chapter outlining.
- Studio Polish workflow for editing existing video/image assets.
- Comprehensive overlay system for logos, text, and custom elements.
- Word-synced text caption overlays with various styles.
- Visual art direction presets with smart style mixing.
- Ask Suzzie AI assistant for guided video creation.
- Asset library for managing AI-generated and uploaded assets.
- Canva integration for seamless export of renders.
- Social publishing hub for scheduling and sharing videos.
- Admin portal for user, project, and cost management.

## User preferences
- Focus on Video Production Platform only (no HR features)
- Dark theme with purple/indigo accent colors
- Modern, professional, cutting-edge UI (Canva-inspired)
- Glassmorphism card surfaces, gradient thumbnails, visual project cards

## Gotchas
- **Native Browser Dialogs**: Avoid `window.alert`, `window.confirm`, `window.prompt` in `client/src`. Use `AlertDialog` or `useToast` for themed UI. `npm run lint:dialogs` enforces this.
- **Husky Pre-commit Hook**: `npm install` is required after cloning to install the pre-commit hook which runs `lint:dialogs`. Set `HUSKY=0` to skip installation.
- **Cinematic Flow Mode**: Breaks continuity chain if art styles change between scenes.
- **Concurrent Video Generation**: Race conditions are handled by atomic DB operations and specific retry/polling logic, but unexpected delays can occur.
- **Canva Integration**: Requires `canva_tokens` to be valid and active. Sync status should be monitored in the UI.

## Pointers
- **Remotion Documentation**: `https://www.remotion.dev/docs`
- **Drizzle ORM Documentation**: `https://orm.drizzle.team/docs/overview`
- **Tailwind CSS Documentation**: `https://tailwindcss.com/docs`
- **shadcn/ui Documentation**: `https://ui.shadcn.com/docs`
- **Passport.js Documentation**: `http://www.passportjs.org/docs/`
- **PiAPI LLM Client**: Refer to `server/services/piapi-llm-client.ts` for Claude integration details.
- **Image Generation Policy**: `server/utils/image-generation-policy.ts` for provider selection logic.