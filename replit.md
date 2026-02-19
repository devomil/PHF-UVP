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
-   **Custom Script Workflow**: A 3-phase workflow for custom script projects including script generation, editable scene cards (narration, visual direction, duration, type), and asset generation configuration (voice, reference images, provider selection).
-   **Quick Create Workflow**: Panel for quick asset creation including visual (prompt editing, provider selection), voiceover (AI narration), and background music generation.
-   **Post-Production & Rendering**: Features a render configuration panel for voiceover, background music volume, sound design, film treatments (color grade, grain, vignette, letterbox), and transition controls. Remotion Lambda is used for rendering with live progress polling.
-   **Asset Library**: Comprehensive system with upload/deletion, brand media management, and S3 render asset integration, supporting various media types and file validation.
-   **API Testing System**: Dedicated page for testing AI video, image, audio, and LLM providers with real-time polling and persistent test results.
-   **Service Architecture**: Backend services are modularized (e.g., `ai-video-service`, `brand-service`, `remotion-lambda-service`) to manage specific functionalities.
-   **Database Schema**: Drizzle ORM defines schema for users, sessions, video projects, production phases, brand assets, media assets, and various job queues.

## External Dependencies
-   **AI Video Providers**: Kling, RunwayML, Luma, Pika, Veo.
-   **Database**: PostgreSQL (specifically Neon).
-   **Object Storage**: S3 (for render assets, logos, overlays, badges, end-cards, sfx, music, fonts).
-   **Rendering**: Remotion (for video composition and rendering via Remotion Lambda).
-   **Image Generation**: PiAPI Flux Schnell (as a fallback when FAL_KEY is not configured).
-   **Authentication**: Passport.js for local strategy authentication.