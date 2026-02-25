# AI Video Production Studio

## Overview
The AI Video Production Studio is a full-stack platform designed to streamline video creation using multiple AI video providers (Kling, RunwayML, Luma, Pika, Veo). Its core purpose is to offer an intelligent system for provider selection, comprehensive brand asset management, quality evaluation, and advanced sound design capabilities. The platform leverages Remotion for flexible video composition, targeting a broad market with ambitions to be a leading tool for professional and efficient AI-driven video production.

## User Preferences
- Focus on Video Production Platform only (no HR features)
- Dark theme with purple/indigo accent colors
- Modern, professional, cutting-edge UI (Canva-inspired)
- Glassmorphism card surfaces, gradient thumbnails, visual project cards

## System Architecture

### Tech Stack
-   **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter, @tanstack/react-query
-   **Backend**: Express.js, TypeScript, Passport.js (local strategy), bcrypt
-   **Database**: PostgreSQL (Neon) with Drizzle ORM
-   **Video**: Remotion for composition
-   **Authentication**: Email/password with express-session and connect-pg-simple

### Key Features and Design Decisions
-   **UI/UX**: Canva-inspired persistent sidebar navigation, glassmorphism card surfaces, animated gradient landing page, split-panel authentication, and visual project cards with gradient thumbnails. A modern dark theme is applied throughout.
-   **Dynamic Theming**: Light/dark mode toggle with `ThemeContext` managing state, `localStorage` persistence, and CSS custom properties for theme-dependent styling.
-   **Brand Management**: Integrated brand settings (name, tagline, website, colors, logo_url, guidelines) persistent in the database, with dynamic injection into project creation, script parsing, and video prompt optimization. Supports drag-and-drop logo upload and brand media library.
-   **AI Video Generation**: Supports configurable T2V (Text-to-Video) and I2V (Image-to-Video) pipelines, allowing users to choose generation modes. Includes a system for persisting project-level reference images for I2V.
-   **Micro-Scenes**: Claude automatically splits scene narrations into 2-4 micro-scenes at natural topic shifts. Each micro-scene gets its own visual direction and AI-generated video clip. Remotion stitches micro-scene clips with crossfade transitions within the parent scene. UI shows micro-scene breakdown with video previews in the scene editor. MicroScene type defined in `shared/video-types.ts`. Supports per-micro-scene original audio mixing: users can toggle native video audio on/off per micro-scene with volume control (0-100%), automatic fade in/out, and background music auto-ducking during native audio segments for TV-quality rendering.
-   **Custom Script Workflow**: Scene-by-scene editor allowing users to add individual scenes with type selection (Opening/Hook, Introduction, Benefit, Feature, Content, CTA, Closing/Outro) and exact narration text. Scenes can be reordered, added, or removed before project creation. Pre-seeded scenes skip the AI script generation step and go directly to scene review/editing in the project detail page.
-   **Quick Create Workflow**: Panel for quick asset creation including visual (prompt editing, provider selection), voiceover (AI narration), and background music generation.
-   **Overlay System (Unified)**: Single consolidated overlay pipeline with two sources: (1) `sceneOverlayConfigs` for automated per-scene logos/watermarks via `overlay-configuration-service`, and (2) `scene.overlayItems` for user-positioned drag-and-drop overlays via `SceneOverlayEditor` UI. Rendered by `LogoOverlay`, `WatermarkOverlay`, and `CustomImageOverlay` Remotion components. End cards handled separately by `AnimatedEndCard`.
-   **Post-Production & Rendering**: Features a render configuration panel for voiceover, background music volume, sound design, film treatments (color grade, grain, vignette, letterbox), and transition controls. Remotion Lambda is used for rendering with live progress polling. Chunked rendering (for videos >90s) strips audio from individual chunks and mixes voiceover + music into the final stitched video via ffmpeg post-concatenation, preventing audio restart at chunk boundaries.
-   **Asset Library**: Comprehensive system with upload/deletion, brand media management, and S3 render asset integration, supporting various media types and file validation.
-   **API Testing System**: Dedicated page for testing AI video, image, audio, and LLM providers with real-time polling and persistent test results.
-   **Service Architecture**: Backend services are modularized (e.g., `ai-video-service`, `brand-service`, `remotion-lambda-service`) to manage specific functionalities.
-   **Database Schema**: Drizzle ORM defines schema for users, sessions, video projects, production phases, brand assets, media assets, and various job queues.

## External Dependencies
-   **AI Video Providers**: Kling, RunwayML, Luma, Pika, Veo, Hailuo, Wan, Sora, Seedance, Hunyuan (via PiAPI). Provider selection is filtered by API test results from `piapi_test_results` table - only providers that passed testing are used in production pipelines.
-   **Database**: PostgreSQL (specifically Neon).
-   **Object Storage**: S3 for render assets (sfx, end-cards, intro-backgrounds, fonts). Logos/badges/watermarks managed through the overlay UI and brand settings.
-   **Rendering**: Remotion (for video composition and rendering via Remotion Lambda).
-   **Image Generation**: PiAPI Flux Schnell (as a fallback when FAL_KEY is not configured).
-   **Authentication**: Passport.js for local strategy authentication.
