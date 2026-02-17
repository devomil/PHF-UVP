# AI Video Production Studio

## Overview
A full-stack AI video production platform supporting multiple AI video providers (Kling, RunwayML, Luma, Pika, Veo), intelligent provider selection, brand asset management, quality evaluation, sound design, and Remotion-based video composition. Built with React frontend and Express backend using PostgreSQL database.

## Recent Changes
- 2026-02-17: Added Script Content Generation panel to project detail page for Custom Script projects. Features: "Generate All Assets" button (POST /generate-assets), step-by-step pipeline control (voiceover→images→videos→music), visual progress tracker with 5 pipeline steps and percentage bar, per-scene cards with Regen Image/Video, Upload Image (via /api/videos/uploads), and Library picker (asset-library integration). Provider selector for video regeneration. Panel uses ScriptGenerationPanel component with react-query mutations and polling.
- 2026-02-17: Extracted ProviderCatalogSelector into shared component for reuse across Quick Create and Custom Script flows. Updated visual style selector to card-based grid with 6 wellness-aligned styles.
- 2026-02-17: Wired S3 Render Assets into render pipeline. Created s3-render-asset-service.ts (paginated S3 listing with caching) to serve as central lookup for all S3 render asset categories. End card logos now pull from brand/logos/ first; end card backgrounds check brand/end-cards/ (fallback to gradient). SFX validation uses audio/sfx/ instead of HTTP validation. Background music falls back to audio/music/ when project has no music. Brand-injection-service logos fall back to S3 Render Assets. getPublicAssetUrl has S3 fallbacks for logos/overlays/badges. Sound-design-service pulls SFX from audio/sfx/ and background music from audio/music/.
- 2026-02-16: Added Quick Create Asset Creation panel to project detail page. Three asset cards: Visual (with prompt editing, provider selection, preview, generate/regenerate), Voiceover (AI narration from prompt, audio playback), and Background Music (mood/style selectors, audio playback). Each asset tracks status independently (pending/generating/completed/failed). Backend endpoints: GET/POST /api/projects/:id/quick-create/assets, generate-visual, generate-voiceover, generate-music. Job processor updated to persist per-component status in project.assets.quickCreate. Auto-polling at 3s while any asset is generating.
- 2026-02-16: Added Render Configuration panel to project detail page with voiceover enable/disable, background music volume control, sound design toggles (transitions, impacts, ambient with type selection), film treatment settings (color grade presets, grain/vignette sliders, letterbox), and transition style/duration controls. All settings auto-save via PATCH /api/universal-video/projects/:projectId/render-settings endpoint with server-side validation and value clamping. Settings are persisted on project data and consumed by render pipeline.
- 2026-02-16: Added Post-Production & Rendering panel to project detail page. Includes service status dashboard (all configured providers), Lambda health check with function details, S3 bucket status, text overlay controls with position/font-size settings, and Remotion Lambda render trigger with live progress polling. Added /api/services/lambda-health endpoint. S3 asset routes opened to all authenticated users (removed admin-only restriction). Added predefined upload files for all 7 S3 categories (sfx, music, logos, badges, overlays, end-cards, fonts).
- 2026-02-16: Fixed multiple missing service modules (logger, project-instructions-service, smart-provider-router, objectAcl) that prevented universal-video-routes from loading. Refactored remotion-lambda-service to use dynamic imports so it loads even without @remotion/lambda installed. Fixed Vite HMR config with proper WSS protocol for Replit proxy. Fixed brand-media-library and media-assets API to return { assets, total } wrapper matching frontend expectations. All routes now load successfully at startup.
- 2026-02-16: Added comprehensive asset library system with upload/deletion, brand media management, and 4-tab UI (Brand Media, Asset Library, My Uploads, S3 Render Assets). Created 5 backend route files and 4 frontend components. Added file type validation (MIME whitelist) for upload security.
- 2026-02-16: Integrated PiAPI I2V/T2V services. Created server/config/ai-video-providers.ts with all provider configs (30+ models), server/config/video-providers.ts for registry. Added provider-test API routes (/api/provider-test/providers, /generate, /task/:id). Updated Providers page with tabbed UI showing Provider Registry Panel and Testing Playground. Fixed generateAudio type error in piapi-video-service.ts.
- 2026-02-16: Added light/dark mode toggle. ThemeContext manages theme state with localStorage persistence, CSS custom properties handle all theme-dependent colors. Toggle button in sidebar (authenticated) and top-right corner (landing/auth pages).
- 2026-02-16: Major UI/UX redesign - Canva-inspired persistent sidebar navigation, glassmorphism card surfaces, animated gradient landing page, split-panel auth page, visual project cards with gradient thumbnails, modern dark theme throughout all pages.
- 2026-02-16: Restructured from HR app to Video Production Platform. Removed all HR management files, created video-focused pages and dark theme UI. Organized backend services into server/services/ and frontend components into client/src/components/video/.

## Project Architecture

### Tech Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter (routing), @tanstack/react-query
- **Backend**: Express.js, TypeScript, Passport.js (local strategy), bcrypt
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Video**: Remotion for composition, multiple AI provider integrations
- **Auth**: Email/password authentication with express-session and connect-pg-simple

### Directory Structure
```
client/                  # Frontend
  src/
    App.tsx             # Main app with routing
    main.tsx            # React entry point
    index.css           # Global styles (dark theme, purple accents)
    pages/              # Video platform pages (dashboard, projects, assets, etc.)
    hooks/              # Custom React hooks (auth, toast, font-loader)
    contexts/           # React contexts (ThemeContext)
    components/         # Reusable components
    components/layout/  # App layout with sidebar navigation
    components/ui/      # shadcn/ui primitives
    components/video/   # Video production UI components
    lib/                # Utilities (queryClient, utils)
  index.html            # HTML entry point
server/                 # Backend
  index.ts              # Express server entry (port 5000)
  auth.ts               # Authentication setup
  db.ts                 # Database connection
  routes.ts             # API route registration
  storage.ts            # Database CRUD operations
  vite.ts               # Vite dev middleware
  services/             # Video production services
    universal-video-service.ts    # Main video orchestration
    universal-video-routes.ts     # Video API routes
    ai-video-service.ts           # AI video generation
    ai-music-service.ts           # AI music generation
    brand-*-service.ts            # Brand asset management
    quality-*-service.ts          # Quality evaluation
    remotion-lambda-service.ts    # Remotion rendering
    scene-*-service.ts            # Scene analysis/regeneration
    sound-design-service.ts       # Sound design
    transition-service.ts         # Video transitions
    objectStorage.ts              # Object storage
shared/                 # Shared between client/server
  schema.ts             # Drizzle ORM schema (video/brand/media tables)
  video-types.ts        # Video type definitions
  provider-config.ts    # AI provider configurations
  types/                # Additional type definitions
  config/               # Shared configuration
remotion/               # Remotion video compositions
  Root.tsx              # Remotion entry
  components/           # Video composition components
  compositions/         # Video compositions
```

### Key Configuration
- Frontend dev server: Vite middleware mode through Express on port 5000
- Path aliases: `@/` maps to `client/src/`, `@shared/` maps to `shared/`
- Vite configured with `allowedHosts: true` for Replit proxy
- Light/dark mode via CSS custom properties (--app-bg, --surface, --border-subtle, --text-primary, etc.)
- ThemeContext with toggle, localStorage persistence, data-theme attribute on html
- Canva-inspired collapsible sidebar navigation with theme toggle (Sun/Moon icons)
- Purple/indigo accent colors with gradient CTAs

### Scripts
- `npm run dev` - Start development server (tsx server/index.ts)
- `npm run build` - Build for production (vite build + esbuild server)
- `npm run start` - Start production server
- `npm run db:push` - Push schema changes to database

### Database Tables
- users, sessions - Authentication
- universalVideoProjects - Video project management
- videoProductions, productionPhases, productionAssets, productionLogs - Production tracking
- brandAssets, brandMediaLibrary - Brand management
- mediaAssets, assetTags, mediaAssetTagMap - Media library
- videoGenerationJobs - Render queue
- sceneRegenerationHistory - Scene tracking
- assetLibrary - Asset management
- userMediaUploads - User uploads

## User Preferences
- Focus on Video Production Platform only (no HR features)
- Dark theme with purple/indigo accent colors
- Modern, professional, cutting-edge UI (Canva-inspired)
- Glassmorphism card surfaces, gradient thumbnails, visual project cards
