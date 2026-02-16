# AI Video Production Studio

## Overview
A full-stack AI video production platform supporting multiple AI video providers (Kling, RunwayML, Luma, Pika, Veo), intelligent provider selection, brand asset management, quality evaluation, sound design, and Remotion-based video composition. Built with React frontend and Express backend using PostgreSQL database.

## Recent Changes
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
