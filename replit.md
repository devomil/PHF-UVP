# AI Video Production Studio

## Run & Operate
- **Run**: `npm run dev` (client and server)
- **Production Run**: `NODE_ENV=production node dist/server/index.js`
- **Build**: `vite build && esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outdir=dist/server`
- **Typecheck**: `npm run typecheck`
- **Lint Dialogs**: `npm run lint:dialogs`
- **Health Check**: `GET /api/health`
- **Codegen**: _Populate as you build_
- **DB Push**: _Populate as you build_
- **Env Vars**: `SESSION_SECRET`, `AYRSHARE_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_NOTIFICATION_PHONE`, `SENDGRID_FROM_EMAIL`, `RECRAFT_API_KEY`

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
- `client/`: Frontend source code
- `server/`: Backend source code
- `shared/`: Shared types and utilities
- `drizzle/`: Database migrations and schema
- `db/schema.ts`: Drizzle ORM database schema
- `shared/video-types.ts`: Core video-related types and API contracts
- `shared/config/visual-art-presets.ts`: Visual art style presets configuration
- `.husky/`: Git hooks (pre-commit for dialog linting)
- `.github/workflows/`: CI/CD configurations
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: Defined implicitly by Express.js routes in `server/services/`
- **Theme Files**: `client/src/index.css`, `client/tailwind.config.js`

## Architecture decisions
- **Image-first I2V Pipeline**: All AI video generation prioritizes Image-to-Video (I2V) by generating an intermediate image (Flux Pro) then animating it, ensuring style consistency and leveraging advanced motion capabilities.
- **Micro-Scene Architecture**: Complex scenes are automatically broken into smaller, independently editable and regenerable micro-scenes, improving granularity and allowing for fine-tuned control over video segments.
- **Atomic Database Operations**: Utilizes PostgreSQL's `jsonb_set()` and `jsonb ||` (or `jsonb_agg`) for atomic updates to complex JSONB fields (like scene data and render settings), preventing race conditions during concurrent modifications.
- **Two-Stage Rendering Optimization**: For "Studio Polish" projects, video rendering bypasses Remotion Lambda for raw uploaded clips when possible, significantly reducing render times.
- **Intelligent Script Pipeline (4 Stages)**: A sophisticated AI pipeline handles script generation from creative strategy to cinematic prompt enhancement, incorporating brand guidelines, trend data, and Suzzie's 7-layer cinematic framework for transforming visual directions into production-grade AI video prompts.
- **Text-Aware Image-to-Video**: Automatically detects text-heavy scenes and routes them through a GPT-Image-1 -> I2V pipeline to ensure accurate text rendering within AI-generated video.

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

## User preferences
- Focus on Video Production Platform only (no HR features)
- Dark theme with purple/indigo accent colors
- Modern, professional, cutting-edge UI (Canva-inspired)
- Glassmorphism card surfaces, gradient thumbnails, visual project cards

## Gotchas
- **Native Browser Dialogs**: Avoid `window.alert`, `window.confirm`, `window.prompt` in `client/src`. Use `AlertDialog` or `useToast` for themed UI. `npm run lint:dialogs` enforces this.
- **Husky Pre-commit Hook**: `npm install` is required after cloning to install the pre-commit hook which runs `lint:dialogs`. Set `HUSKY=0` to skip installation.
- **Session Security**: `SESSION_SECRET` environment variable is mandatory in production.
- **Cinematic Flow Mode**: Breaks continuity chain if art styles change between scenes.
- **Concurrent Video Generation**: Race conditions are handled by atomic DB operations and specific retry/polling logic, but unexpected delays can occur.
- **Cost Telemetry**: Storyboard batch generation includes cost tracking with budget caps and alerts for nearing the cap.
- **Canva Integration**: Requires `canva_tokens` to be valid and active. Sync status should be monitored in the UI.

## Pointers
- **Remotion Documentation**: [https://www.remotion.dev/docs](https://www.remotion.dev/docs)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **Tailwind CSS Documentation**: [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **shadcn/ui Documentation**: [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
- **Passport.js Documentation**: [http://www.passportjs.org/docs/](http://www.passportjs.org/docs/)
- **PiAPI LLM Client**: Refer to `server/services/piapi-llm-client.ts` for Claude integration details.
- **Image Generation Policy**: `server/utils/image-generation-policy.ts` for provider selection logic.
- **Ayrshare API Documentation**: _Populate as you build_
- **Canva API Documentation**: _Populate as you build_
